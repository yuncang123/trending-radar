import { Notice, Plugin, requestUrl } from "obsidian";
import { createAiRankingArtifact, parseAiScores, selectAiRankedItems } from "./ai-ranking.js";
import { lookup } from "node:dns/promises";
import { createAdapterRegistry } from "./adapters/index.js";
import { attachLease, cancelRun, carryForwardReusableSources, createRunLedger, finalizeRunStatus, heartbeat, markRunInterrupted, markSourceCancelled, markSourceFailed, markSourceRunning, markSourceSucceeded, sourcesToRun } from "./ledger.js";
import { deduplicateItems, isPrivateNetworkHost, replaceSourceItems } from "./normalize.js";
import { parseProfile, validateVaultRelativePath } from "./profile.js";
import { createDefaultProfile, DEFAULT_PROFILE_PATH, reviseProfile } from "./profile-editor.js";
import { LEASE_TTL_MS, LeaseHeldError, VaultLedgerStore } from "./run-store.js";
import { TrendingRadarSettingTab } from "./settings-tab.js";
import { buildAnthropicModelsRequest, buildAnthropicProbeRequest, buildAnthropicRankingRequest, extractAnthropicText, extractProviderModels, PROVIDER_TIMEOUTS_MS, type ProviderModel } from "./provider.js";
import { getSourceGuide } from "./source-guide.js";
import type { FailureStage, FetchContext, NormalizedItem, Profile, RunLease, RunLedger, SourceFailure } from "./types.js";
import { appendFactAppendix, createAiRankedDraftInput, createDraftInput, renderAiRankedDraft, renderTemplateDraft, validateExternalWriterOutput } from "./writer.js";
import { createTranslator, resolveLocale, type LanguagePreference, type TranslationKey } from "./i18n.js";

export interface TrendingRadarSettings {
  profilePath: string;
  outputDirectory: string;
  lastRunSummary: string;
  providerApiKey: string;
  providerBaseUrl: string;
  providerModelId: string;
  language: LanguagePreference;
}

export const DEFAULT_SETTINGS: TrendingRadarSettings = {
  profilePath: "",
  outputDirectory: "Trending Radar",
  lastRunSummary: "",
  providerApiKey: "",
  providerBaseUrl: "",
  providerModelId: "",
  language: "auto"
};

function runId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

export default class TrendingRadarPlugin extends Plugin {
  settings!: TrendingRadarSettings;
  private activeRun: { ledger: ReturnType<typeof createRunLedger>; store: VaultLedgerStore } | null = null;
  private runStarting = false;
  private cancelRequested = false;
  private activeController: AbortController | null = null;
  private runNotice: Notice | null = null;
  private runNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ownerId = runId();
  private discoveredModels: ProviderModel[] = [];
  private discoveredModelsBaseUrl = "";
  private modelsFetchedAt: string | null = null;
  private verifiedModel: { id: string; verifiedAt: string } | null = null;
  private settingsTab: TrendingRadarSettingTab | null = null;
  private profileWriteQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const t = this.translate.bind(this);
    this.addCommand({
      id: "run-manual",
      name: t("run_now"),
      callback: () => void this.runManual()
    });
    this.addCommand({
      id: "cancel-run",
      name: t("cancel_run"),
      callback: () => void this.cancelCurrentRun()
    });
    this.addCommand({
      id: "apply-external-draft",
      name: t("run_external"),
      callback: () => void this.applyExternalDraft()
    });
    this.addCommand({
      id: "generate-ai-draft",
      name: t("run_ai"),
      callback: () => void this.generateAiDraft()
    });
    this.addCommand({
      id: "refresh-provider-models",
      name: t("refresh_models"),
      callback: () => void this.refreshProviderModels()
    });
    this.addCommand({
      id: "verify-provider-model",
      name: t("verify_model"),
      callback: () => void this.verifyProviderModel()
    });
    this.settingsTab = new TrendingRadarSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  onunload(): void {
    if (this.runNoticeTimer) clearTimeout(this.runNoticeTimer);
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.runNotice?.hide();
    this.runNotice = null;
    this.runNoticeTimer = null;
    this.leaseTimer = null;
    this.settingsTab = null;
  }

  async runManual(): Promise<void> {
    if (this.activeRun || this.runStarting) {
      this.log("run_rejected", { reason: "already_running" });
      this.showRunNotice(this.translate("notice_run_active"));
      return;
    }
    this.cancelRequested = false;
    this.runStarting = true;
    this.settingsTab?.display();
    this.showRunNotice(this.translate("notice_run_preparing"));
    let lease: RunLease | null = null;
    let leaseStore: VaultLedgerStore | null = null;
    try {
      const profile = await this.loadProfile();
      const effectiveProfile: Profile = profile ?? createDefaultProfile(this.settings.outputDirectory);
      const store = new VaultLedgerStore(this.app.vault.adapter, effectiveProfile.outputDirectory);
      leaseStore = store;
      const currentRunId = runId();
      const runStartedAt = new Date().toISOString();
      lease = await store.acquireLease(currentRunId, this.ownerId);
      let previous = await store.loadLatestLedger();
      if (previous?.status === "running") {
        previous = markRunInterrupted(previous);
        await store.saveLedger(previous);
      }
      const adapters = createAdapterRegistry();
      const currentVersions = Object.fromEntries(effectiveProfile.sources.map((source) => {
        const adapter = adapters.get(source.kind);
        return [source.sourceId, { adapterVersion: adapter?.adapterVersion ?? "unavailable", parserVersion: adapter?.parserVersion ?? "unavailable" }];
      }));
      let ledger = carryForwardReusableSources(attachLease(createRunLedger(effectiveProfile, currentRunId, runStartedAt, currentVersions), lease), previous, effectiveProfile, currentVersions, runStartedAt);
      const sourceIds = sourcesToRun(previous, effectiveProfile, currentVersions, runStartedAt);
      const enabledSourceCount = effectiveProfile.sources.filter((source) => source.enabled).length;
      const reusedSourceCount = enabledSourceCount - sourceIds.length;
      this.log("run_started", {
        runId: ledger.runId,
        profileId: effectiveProfile.profileId,
        profileVersion: effectiveProfile.version,
        sourceCount: enabledSourceCount,
        sourcesToRun: sourceIds.length,
        reusedSourceCount
      });
      for (const [sourceId, source] of Object.entries(ledger.sources)) {
        if (source.status === "succeeded" && !sourceIds.includes(sourceId)) {
          this.log("source_reused", { runId: ledger.runId, sourceId, resultFile: source.resultFile });
        }
      }
      this.activeController = new AbortController();
      this.activeRun = { ledger, store };
      this.startLeaseHeartbeat(lease);
      await store.saveLedger(ledger);
      const failures: SourceFailure[] = [];
      let accumulatedItems: NormalizedItem[] = [];
      if (previous) {
        for (const source of Object.values(ledger.sources)) accumulatedItems.push(...await store.loadSourceItems(source.resultFile));
        accumulatedItems = deduplicateItems(accumulatedItems);
      }
      // A source scheduled for refresh must not retain its previous snapshot if the fetch fails.
      // Otherwise a failed refresh would silently publish stale items as if they were current.
      const refreshingSources = new Set(sourceIds);
      accumulatedItems = accumulatedItems.filter((item) => !refreshingSources.has(item.sourceId));
      const context = this.createFetchContext(this.activeController.signal);
      this.showRunNotice(sourceIds.length > 0
        ? this.translate("notice_run_running", { current: sourceIds.length, total: enabledSourceCount })
        : enabledSourceCount > 0
          ? this.translate("notice_run_reused", { count: reusedSourceCount })
          : this.translate("notice_no_sources"));
      for (const [index, sourceId] of sourceIds.entries()) {
        if (this.cancelRequested) {
          ledger = cancelRun(ledger);
          await store.saveLedger(ledger);
          break;
        }
        this.showRunNotice(this.translate("notice_source_running", { sourceId, current: index + 1, total: sourceIds.length }));
        this.log("source_started", { runId: ledger.runId, sourceId, position: index + 1, total: sourceIds.length });
        ledger = markSourceRunning(ledger, sourceId);
        this.activeRun.ledger = ledger;
        await store.saveLedger(ledger);
        if (this.cancelRequested) {
          ledger = cancelRun(ledger);
          await store.saveLedger(ledger);
          break;
        }
        const source = effectiveProfile.sources.find((entry) => entry.sourceId === sourceId);
        const adapter = source ? adapters.get(source.kind) : undefined;
        const result = source && adapter
          ? await adapter.fetch(source, context)
          : { ok: false as const, sourceId, stage: "verify" as const, code: "UNAVAILABLE", message: `Source adapter is unavailable for ${source?.kind ?? "unknown"}.`, retryable: false, retrievedAt: new Date().toISOString() };
        if (!result.ok) {
          failures.push(result);
          ledger = result.code === "CANCELLED"
            ? markSourceCancelled(ledger, sourceId, result.message)
            : markSourceFailed(ledger, sourceId, result.stage, result.code, result.message);
          this.log("source_failed", {
            runId: ledger.runId,
            sourceId,
            stage: result.stage,
            code: result.code,
            retryable: result.retryable,
            ...(result.fallback ? { fallback: result.fallback } : {}),
            message: result.message
          });
          this.showRunNotice(this.translate("notice_source_failed", { sourceId, stage: result.stage, code: result.code, message: result.message }));
        } else {
          const combined = replaceSourceItems(accumulatedItems, sourceId, result.items);
          const accepted = combined.filter((item) => item.sourceId === sourceId);
          accumulatedItems = combined;
          const resultFile = await store.saveSourceItems(ledger.runId, sourceId, accepted);
          ledger = markSourceSucceeded(ledger, sourceId, resultFile);
          this.log("source_succeeded", { runId: ledger.runId, sourceId, itemCount: accepted.length, resultFile });
          this.showRunNotice(this.translate("notice_source_succeeded", { sourceId, count: accepted.length }));
        }
        this.activeRun.ledger = ledger;
        await store.saveLedger(ledger);
      }
      ledger = this.cancelRequested ? cancelRun(ledger) : finalizeRunStatus(ledger);
      this.activeRun.ledger = ledger;
      for (const [sourceId, source] of Object.entries(ledger.sources)) {
        if (!source.error || failures.some((entry) => entry.sourceId === sourceId)) continue;
        failures.push({ ok: false, sourceId, stage: source.error.stage as FailureStage, code: source.error.code, message: source.error.message, retryable: false, retrievedAt: source.finishedAt ?? new Date().toISOString() });
      }
      await store.saveFailures(ledger.runId, failures);
      const draftInput = createDraftInput({
        runId: ledger.runId,
        profileId: effectiveProfile.profileId,
        profileVersion: effectiveProfile.version,
        status: ledger.status,
        generatedAt: new Date().toISOString(),
        templateId: effectiveProfile.templateId,
        topics: effectiveProfile.topics,
        filter: effectiveProfile.filter,
        items: accumulatedItems,
        failures
      });
      const draft = renderTemplateDraft(draftInput);
      const draftInputFile = await store.saveDraftInput(ledger.runId, draftInput);
      const draftFile = await store.saveDailyDraft(draftInput.generatedAt.slice(0, 10), draft.markdown);
      await store.saveLedger(ledger);
      this.activeRun = null;
      this.activeController = null;
      this.settings.lastRunSummary = formatRunSummary(ledger, this.translate.bind(this));
      await this.saveSettings();
      this.log("run_finished", { runId: ledger.runId, status: ledger.status, fetchedSourceCount: sourceIds.length, reusedSourceCount, failureCount: failures.length, draftFile, draftInputFile });
      this.finishRunNotice(this.settings.lastRunSummary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof LeaseHeldError) {
        this.log("run_rejected", { reason: "lease_held", runId: error.lease.runId });
        this.showRunNotice(this.translate("notice_another_run"));
        return;
      }
      if (this.activeRun?.ledger.status === "running") {
        const interrupted = markRunInterrupted(this.activeRun.ledger, message);
        await this.activeRun.store.saveLedger(interrupted).catch(() => undefined);
      }
      this.activeRun = null;
      this.activeController = null;
      this.log("run_error", { message });
      this.finishRunNotice(this.translate("notice_profile_error", { message }));
    } finally {
      if (this.leaseTimer) clearInterval(this.leaseTimer);
      this.leaseTimer = null;
      if (lease && leaseStore) await this.releaseLease(leaseStore, lease);
      this.runStarting = false;
      this.settingsTab?.display();
    }
  }

  private startLeaseHeartbeat(lease: RunLease): void {
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = setInterval(() => void this.refreshLease(lease), LEASE_TTL_MS / 3);
  }

  private async refreshLease(lease: RunLease): Promise<void> {
    if (!this.activeRun || this.activeRun.ledger.status !== "running") return;
    try {
      const refreshed = await this.activeRun.store.refreshLease(lease);
      this.activeRun.ledger = heartbeat(this.activeRun.ledger, refreshed);
      await this.activeRun.store.saveLedger(this.activeRun.ledger);
    } catch (error) {
      this.log("lease_lost", { runId: lease.runId, message: error instanceof Error ? error.message : String(error) });
      this.cancelRequested = true;
      this.activeController?.abort();
    }
  }

  private async releaseLease(store: VaultLedgerStore, lease: RunLease): Promise<void> {
    try {
      await store.releaseLease(lease);
    } catch (error) {
      this.log("lease_release_failed", { runId: lease.runId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  getProviderModels(): ProviderModel[] {
    return [...this.discoveredModels];
  }

  isRunActive(): boolean {
    return this.runStarting || this.activeRun !== null;
  }

  getLocale(): "en" | "zh-CN" {
    return resolveLocale(this.settings.language);
  }

  translate(key: TranslationKey, values?: Record<string, string | number>): string {
    return createTranslator(this.getLocale())(key, values);
  }

  describeProviderModelState(): string {
    if (this.discoveredModels.length === 0 || this.discoveredModelsBaseUrl !== this.settings.providerBaseUrl.trim()) return this.translate("provider_manual_model");
    const verified = this.verifiedModel && this.verifiedModel.id === this.settings.providerModelId.trim()
      ? this.translate("provider_verified_suffix", { model: this.verifiedModel.id })
      : this.translate("provider_unverified_suffix");
    return this.translate("provider_models_loaded", { count: this.discoveredModels.length, verified });
  }

  clearProviderModels(): void {
    this.discoveredModels = [];
    this.discoveredModelsBaseUrl = "";
    this.modelsFetchedAt = null;
    this.verifiedModel = null;
  }

  async refreshProviderModels(): Promise<void> {
    const apiKey = this.settings.providerApiKey.trim();
    const baseUrl = this.settings.providerBaseUrl.trim();
    if (!apiKey || !baseUrl) {
      this.log("provider_models_rejected", { reason: "provider_not_configured" });
      this.finishRunNotice(this.translate("notice_provider_configure_key_url"));
      return;
    }
    const startedAt = Date.now();
    this.showRunNotice(this.translate("notice_provider_loading"));
    try {
      const request = buildAnthropicModelsRequest(baseUrl, apiKey);
      const response = await this.requestProvider(request.url, request.headers, undefined, "GET", PROVIDER_TIMEOUTS_MS.models);
      if (response.status < 200 || response.status >= 300) {
        this.log("provider_models_failed", { provider: "anthropic-compatible", status: response.status, code: "http_error", elapsedMs: Date.now() - startedAt });
        this.finishRunNotice(this.translate("notice_provider_models_failed_http", { status: response.status }));
        return;
      }
      const models = extractProviderModels(response.text);
      if (models.length === 0) {
        this.log("provider_models_failed", { provider: "anthropic-compatible", code: "empty_or_invalid_response", elapsedMs: Date.now() - startedAt });
        this.finishRunNotice(this.translate("notice_provider_models_empty"));
        return;
      }
      this.discoveredModels = models;
      this.discoveredModelsBaseUrl = baseUrl;
      this.modelsFetchedAt = new Date().toISOString();
      this.verifiedModel = null;
      this.log("provider_models_loaded", { provider: "anthropic-compatible", modelCount: models.length, elapsedMs: Date.now() - startedAt });
      this.settingsTab?.display();
      this.finishRunNotice(this.translate("notice_provider_models_loaded", { count: models.length }));
    } catch (error) {
      this.log("provider_models_failed", { provider: "anthropic-compatible", code: classifyProviderError(error), elapsedMs: Date.now() - startedAt });
      this.finishRunNotice(this.translate("notice_provider_models_failed"));
    }
  }

  async verifyProviderModel(): Promise<void> {
    const apiKey = this.settings.providerApiKey.trim();
    const baseUrl = this.settings.providerBaseUrl.trim();
    const model = this.settings.providerModelId.trim();
    if (!apiKey || !baseUrl || !model) {
      this.log("provider_model_verify_rejected", { reason: "provider_not_configured" });
      this.finishRunNotice(this.translate("notice_provider_configure_all"));
      return;
    }
    const startedAt = Date.now();
    this.showRunNotice(this.translate("notice_provider_verifying", { model }));
    try {
      const request = buildAnthropicProbeRequest(baseUrl, apiKey, model);
      const response = await this.requestProvider(request.url, request.headers, request.body, "POST", PROVIDER_TIMEOUTS_MS.verify);
      if (response.status < 200 || response.status >= 300) {
        this.verifiedModel = null;
        this.log("provider_model_verify_failed", { provider: "anthropic-compatible", model, status: response.status, code: "http_error", elapsedMs: Date.now() - startedAt });
        this.finishRunNotice(this.translate("notice_provider_verify_failed_http", { model, status: response.status }));
        return;
      }
      if (!extractAnthropicText(response.text)) {
        this.verifiedModel = null;
        this.log("provider_model_verify_failed", { provider: "anthropic-compatible", model, code: "empty_or_invalid_response", elapsedMs: Date.now() - startedAt });
        this.finishRunNotice(this.translate("notice_provider_verify_empty", { model }));
        return;
      }
      this.verifiedModel = { id: model, verifiedAt: new Date().toISOString() };
      this.log("provider_model_verified", { provider: "anthropic-compatible", model, elapsedMs: Date.now() - startedAt });
      this.settingsTab?.display();
      this.finishRunNotice(this.translate("notice_provider_verified", { model }));
    } catch (error) {
      this.verifiedModel = null;
      this.log("provider_model_verify_failed", { provider: "anthropic-compatible", model, code: classifyProviderError(error), elapsedMs: Date.now() - startedAt });
      this.finishRunNotice(this.translate("notice_provider_verify_failed", { model }));
    }
  }

  async generateAiDraft(): Promise<void> {
    if (this.activeRun || this.runStarting) {
      this.log("ai_draft_rejected", { reason: "run_active" });
      this.finishRunNotice(this.translate("notice_finish_run_ai"));
      return;
    }
    const apiKey = this.settings.providerApiKey.trim();
    const baseUrl = this.settings.providerBaseUrl.trim();
    const model = this.settings.providerModelId.trim();
    if (!apiKey || !baseUrl || !model) {
      this.log("ai_draft_rejected", { reason: "provider_not_configured" });
      this.finishRunNotice(this.translate("notice_provider_configure_all"));
      return;
    }

    let runIdForLog: string | undefined;
    const startedAt = Date.now();
    try {
      const profile = await this.loadProfile();
      const effectiveProfile: Profile = profile ?? createDefaultProfile(this.settings.outputDirectory);
      const store = new VaultLedgerStore(this.app.vault.adapter, effectiveProfile.outputDirectory);
      const latest = await store.loadLatestLedger();
      if (!latest) {
        this.rejectAiDraft("no_completed_run", this.translate("notice_no_collection_ai"));
        return;
      }
      runIdForLog = latest.runId;
      if (latest.status === "running") {
        this.rejectAiDraft("run_active", this.translate("notice_latest_run_active"));
        return;
      }
      const input = await store.loadDraftInput(latest.runId);
      if (!input) {
        this.rejectAiDraft("input_missing_or_invalid", this.translate("notice_draft_input_missing"));
        return;
      }
      const date = input.generatedAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        this.rejectAiDraft("invalid_generated_at", this.translate("notice_invalid_generated_at"));
        return;
      }
      this.log("ai_draft_started", { runId: latest.runId, provider: "anthropic-compatible", model });
      this.showRunNotice(this.translate("notice_ai_generating"));
      if (input.items.length === 0) {
        this.rejectAiDraft("no_candidates", this.translate("notice_no_ai_candidates"));
        return;
      }
      const aiMaxItems = typeof effectiveProfile.filter.aiMaxItems === "number" ? effectiveProfile.filter.aiMaxItems : 15;
      const aiMinimumScore = typeof effectiveProfile.filter.aiMinimumScore === "number" ? effectiveProfile.filter.aiMinimumScore : 70;
      const request = buildAnthropicRankingRequest(baseUrl, apiKey, model, input, {
        sources: effectiveProfile.sources.map((source) => {
          const guide = getSourceGuide(source, this.getLocale());
          return {
            sourceId: source.sourceId,
            label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : source.sourceId,
            kind: source.kind,
            introduction: guide.intro,
            keywords: guide.keywords
          };
        })
      });
      const response = await this.requestProvider(request.url, request.headers, request.body, "POST", PROVIDER_TIMEOUTS_MS.aiDraft);
      if (response.status < 200 || response.status >= 300) {
        this.failAiDraft(latest.runId, model, startedAt, "http_error", response.status);
        return;
      }
      const responseText = extractAnthropicText(response.text);
      if (!responseText) {
        this.failAiDraft(latest.runId, model, startedAt, "empty_or_invalid_response");
        return;
      }
      const scores = parseAiScores(responseText, input.items.length);
      if (!scores) {
        this.failAiDraft(latest.runId, model, startedAt, "invalid_ranking_response");
        return;
      }
      const selected = selectAiRankedItems(input.items, scores, aiMinimumScore, aiMaxItems);
      const rankedInput = createAiRankedDraftInput(input, selected.map((entry) => entry.item), aiMaxItems);
      const scoreMap = new Map(selected.map((entry) => [entry.item.url, entry.score]));
      const rankedDraft = renderAiRankedDraft(rankedInput, {
        model,
        minimumScore: aiMinimumScore,
        candidateCount: input.items.length,
        scores: scoreMap
      });
      const ranking = createAiRankingArtifact({
        input,
        model,
        generatedAt: new Date().toISOString(),
        minimumScore: aiMinimumScore,
        maxItems: aiMaxItems,
        scores,
        selected
      });
      const candidate = {
        schemaVersion: "v1" as const,
        title: `Trending Radar ${date}`,
        markdown: appendFactAppendix(input, rankedDraft.markdown),
        writerId: `provider-ranking:${model}`,
        writerVersion: "v1",
        writerFallback: false
      };
      const validation = validateExternalWriterOutput(input, candidate);
      if (!validation.ok) {
        this.failAiDraft(latest.runId, model, startedAt, "fact_anchor_validation_failed");
        return;
      }
      const rankingFile = await store.saveAiRanking(latest.runId, ranking);
      const writerOutputFile = await store.saveWriterOutput(latest.runId, validation.output);
      const draftFile = await store.saveDailyDraft(date, validation.output.markdown);
      this.log("ai_draft_succeeded", { runId: latest.runId, provider: "anthropic-compatible", model, elapsedMs: Date.now() - startedAt, candidateCount: input.items.length, selectedCount: selected.length, minimumScore: aiMinimumScore, rankingFile, writerOutputFile, draftFile });
      this.finishRunNotice(this.translate("notice_ai_applied", { model, count: selected.length }));
    } catch (error) {
      const code = classifyProviderError(error);
      this.failAiDraft(runIdForLog, model, startedAt, code);
    }
  }

  private async requestProvider(url: string, headers: Record<string, string>, body?: string, method: "GET" | "POST" = "POST", timeoutMs = 60_000): Promise<{ status: number; text: string }> {
    // A configured Provider is an explicit user opt-in and may be an enterprise
    // gateway whose public hostname resolves to a private address. Source
    // adapters retain the private-network guard; this request intentionally does
    // not reuse it.
    new URL(url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        requestUrl({ url, method, headers, ...(body === undefined ? {} : { body }), throw: false }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("provider_timeout")), timeoutMs); })
      ]);
      return { status: response.status, text: response.text };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private rejectAiDraft(reason: string, message: string): void {
    this.log("ai_draft_rejected", { reason });
    this.finishRunNotice(message);
  }

  private failAiDraft(runId: string | undefined, model: string, startedAt: number, code: string, status?: number): void {
    this.log("ai_draft_failed", { provider: "anthropic-compatible", ...(runId ? { runId } : {}), model, elapsedMs: Date.now() - startedAt, code, ...(status !== undefined ? { status } : {}) });
    const suffix = status !== undefined ? ` (HTTP ${status})` : "";
    this.finishRunNotice(this.translate("notice_ai_failed", { suffix }));
  }

  async cancelCurrentRun(): Promise<void> {
    if (!this.activeRun) {
      if (this.runStarting) {
        this.cancelRequested = true;
        this.activeController?.abort();
        this.log("run_cancel_requested", { phase: "preparing" });
        this.showRunNotice(this.translate("notice_cancel_requested"));
        return;
      }
      this.log("cancel_rejected", { reason: "no_active_run" });
      new Notice(this.translate("notice_no_active_run"));
      return;
    }
    this.cancelRequested = true;
    this.activeController?.abort();
    this.log("run_cancel_requested", { runId: this.activeRun.ledger.runId });
    this.activeRun.ledger = cancelRun(this.activeRun.ledger);
    await this.activeRun.store.saveLedger(this.activeRun.ledger);
    this.showRunNotice(this.translate("notice_cancel_requested"));
  }

  async applyExternalDraft(): Promise<void> {
    if (this.activeRun || this.runStarting) {
      this.log("external_draft_rejected", { reason: "run_active" });
      this.showRunNotice(this.translate("notice_finish_run_external"));
      return;
    }
    this.showRunNotice(this.translate("notice_external_checking"));
    try {
      const profile = await this.loadProfile();
      const effectiveProfile: Profile = profile ?? createDefaultProfile(this.settings.outputDirectory);
      const store = new VaultLedgerStore(this.app.vault.adapter, effectiveProfile.outputDirectory);
      const latest = await store.loadLatestLedger();
      if (!latest) {
        this.rejectExternalDraft("no_completed_run", this.translate("notice_no_run_external"));
        return;
      }
      if (latest.status === "running") {
        this.rejectExternalDraft("run_active", this.translate("notice_latest_run_active"));
        return;
      }
      const input = await store.loadDraftInput(latest.runId);
      const candidate = await store.loadWriterOutput(latest.runId);
      if (!input) {
        this.rejectExternalDraft("input_missing_or_invalid", this.translate("notice_draft_input_missing"));
        return;
      }
      if (candidate === undefined) {
        this.rejectExternalDraft("output_missing_or_invalid", this.translate("notice_external_output_missing"));
        return;
      }
      const validation = validateExternalWriterOutput(input, candidate);
      if (!validation.ok) {
        this.rejectExternalDraft("validation_failed", this.translate("notice_external_rejected", { reason: validation.reason }));
        return;
      }
      const date = input.generatedAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        this.rejectExternalDraft("invalid_generated_at", this.translate("notice_invalid_generated_at"));
        return;
      }
      const draftFile = await store.saveDailyDraft(date, validation.output.markdown);
      this.log("external_draft_applied", { runId: latest.runId, writerId: validation.output.writerId, draftFile });
      this.finishRunNotice(this.translate("notice_external_applied", { writerId: validation.output.writerId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("external_draft_rejected", { reason: "error", message });
      this.finishRunNotice(this.translate("notice_external_failed", { message }));
    }
  }

  private rejectExternalDraft(reason: string, message: string): void {
    this.log("external_draft_rejected", { reason });
    this.finishRunNotice(message);
  }

  private showRunNotice(message: string): void {
    if (this.runNoticeTimer) clearTimeout(this.runNoticeTimer);
    this.runNoticeTimer = null;
    if (this.runNotice) {
      this.runNotice.setMessage(message);
      return;
    }
    this.runNotice = new Notice(message, 0);
  }

  private finishRunNotice(message: string): void {
    this.showRunNotice(message);
    this.runNoticeTimer = setTimeout(() => {
      this.runNotice?.hide();
      this.runNotice = null;
      this.runNoticeTimer = null;
    }, 8_000);
  }

  private log(event: string, details: Record<string, unknown> = {}): void {
    console.info(`[Trending Radar] ${event}`, details);
  }

  async loadProfile(): Promise<Profile | undefined> {
    if (!this.settings.profilePath.trim()) return undefined;
    const path = validateVaultRelativePath(this.settings.profilePath, "profilePath");
    if (!await this.app.vault.adapter.exists(path)) return undefined;
    const raw = await this.app.vault.adapter.read(path);
    return parseProfile(JSON.parse(raw));
  }

  async createProfile(): Promise<Profile> {
    const path = validateVaultRelativePath(this.settings.profilePath.trim() || DEFAULT_PROFILE_PATH, "profilePath");
    if (await this.app.vault.adapter.exists(path)) throw new Error(`Profile already exists: ${path}`);
    const profile = createDefaultProfile(this.settings.outputDirectory);
    await this.app.vault.adapter.write(path, `${JSON.stringify(profile, null, 2)}\n`);
    this.settings.profilePath = path;
    await this.saveSettings();
    return profile;
  }

  async updateProfile(mutate: (draft: Profile) => void): Promise<Profile> {
    let updated: Profile | undefined;
    const previous = this.profileWriteQueue.catch(() => undefined);
    this.profileWriteQueue = previous.then(async () => {
      const current = await this.loadProfile();
      if (!current) throw new Error("Create or select a Profile before editing it.");
      updated = reviseProfile(current, mutate);
      const path = validateVaultRelativePath(this.settings.profilePath, "profilePath");
      await this.app.vault.adapter.write(path, `${JSON.stringify(updated, null, 2)}\n`);
      this.settings.outputDirectory = updated.outputDirectory;
      await this.saveSettings();
    });
    await this.profileWriteQueue;
    return updated!;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private createFetchContext(signal: AbortSignal): FetchContext {
    return {
      signal,
      now: () => new Date().toISOString(),
      request: async (url, headers = {}) => {
        if (signal.aborted) throw new Error("cancelled");
        const target = new URL(url);
        const addresses = await lookup(target.hostname, { all: true });
        if (addresses.length === 0 || addresses.some((entry) => isPrivateNetworkHost(entry.address))) {
          throw new Error("source resolved to a private or unavailable network address");
        }
        const timeoutMs = 15_000;
        const response = await new Promise<Awaited<ReturnType<typeof requestUrl>>>((resolve, reject) => {
          const onAbort = () => reject(new Error("cancelled"));
          const timer = setTimeout(() => reject(new Error(`request timeout after ${timeoutMs}ms`)), timeoutMs);
          signal.addEventListener("abort", onAbort, { once: true });
          requestUrl({ url, method: "GET", headers, throw: false }).then(resolve, reject).finally(() => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
          });
        });
        if (signal.aborted) throw new Error("cancelled");
        return { status: response.status, headers: response.headers, text: response.text };
      }
    };
  }
}

function formatRunSummary(ledger: RunLedger, translate: (key: TranslationKey, values?: Record<string, string | number>) => string): string {
  const failures = Object.entries(ledger.sources)
    .filter(([, source]) => source.error)
    .map(([sourceId, source]) => `${sourceId} [${source.error?.stage}] ${source.error?.message}`);
  return failures.length > 0
    ? translate("run_summary_failures", { status: ledger.status, failures: failures.join("; ") })
    : translate("run_summary", { status: ledger.status });
}

function classifyProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "provider_timeout") return "timeout";
  if (message === "provider_network_blocked") return "network_blocked";
  if (message.toLowerCase().includes("invalid url")) return "invalid_url";
  return "network_error";
}
