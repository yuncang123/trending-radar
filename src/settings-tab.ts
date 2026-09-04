import { Modal, Notice, PluginSettingTab, Setting, setIcon, type App } from "obsidian";
import type TrendingRadarPlugin from "./main.js";
import { SOURCE_KINDS, type Profile, type SourceConfig, type SourceKind } from "./types.js";
import { createDefaultProfile } from "./profile-editor.js";
import type { TranslationKey, Translator } from "./i18n.js";
import { captureScrollPosition, restoreScrollPosition, type ScrollPositionSnapshot } from "./settings-scroll.js";
import { availableTopicSuggestionGroups, type TopicSuggestionGroupId } from "./topic-suggestions.js";
import { getSourceGuide } from "./source-guide.js";

const SOURCE_GROUPS: Array<{ kinds: SourceKind[]; labelKey: "source_group_feeds" | "source_group_web" | "source_group_github" | "source_group_hn" }> = [
  { kinds: ["rss", "rsshub-compatible"], labelKey: "source_group_feeds" },
  { kinds: ["url"], labelKey: "source_group_web" },
  { kinds: ["github"], labelKey: "source_group_github" },
  { kinds: ["hn"], labelKey: "source_group_hn" }
];

const TOPIC_SUGGESTION_LABEL_KEYS: Record<TopicSuggestionGroupId, TranslationKey> = {
  ai: "suggestion_group_ai",
  "models-and-companies": "suggestion_group_models_and_companies",
  development: "suggestion_group_development",
  industry: "suggestion_group_industry"
};

function createSection(parent: HTMLElement, icon: string, title: string, description: string): HTMLElement {
  const section = parent.createDiv({ cls: "trending-radar-section" });
  const heading = section.createDiv({ cls: "trending-radar-section-heading" });
  const iconEl = heading.createSpan({ cls: "trending-radar-section-icon" });
  setIcon(iconEl, icon);
  const copy = heading.createDiv();
  copy.createEl("h3", { text: title });
  copy.createEl("p", { text: description });
  return section;
}

function sourceName(source: SourceConfig): string {
  return typeof source.label === "string" && source.label.trim() ? source.label.trim() : source.sourceId;
}

function sourceSummary(source: SourceConfig, t: Translator): string {
  if (source.kind === "github") return t("source_summary_github", { query: String(source.query ?? t("source_summary_url_missing")) });
  if (source.kind === "hn") return t("source_summary_hn", { mode: String(source.mode ?? "topstories") });
  if (source.kind === "url") return String(source.url ?? t("source_summary_url_missing"));
  return source.kind === "rss"
    ? t("source_summary_rss", { url: String(source.url ?? t("source_summary_url_missing")) })
    : t("source_summary_rsshub", { url: String(source.url ?? t("source_summary_url_missing")) });
}

function renderSourceDescription(setting: Setting, source: SourceConfig, locale: "en" | "zh-CN", t: Translator): void {
  const guide = getSourceGuide(source, locale);
  setting.descEl.empty();
  setting.descEl.createDiv({ cls: "trending-radar-source-intro", text: guide.intro });
  const keywords = setting.descEl.createDiv({ cls: "trending-radar-source-keywords" });
  keywords.createSpan({ cls: "trending-radar-source-keywords-label", text: t("source_keywords") });
  for (const keyword of guide.keywords) keywords.createSpan({ cls: "trending-radar-source-keyword", text: keyword });
  setting.descEl.createDiv({ cls: "trending-radar-source-technical", text: `${source.sourceId} · ${sourceSummary(source, t)}` });
}

function sourceKindLabel(t: Translator, kind: SourceKind): string {
  if (kind === "rss") return "RSS";
  if (kind === "rsshub-compatible") return "RSSHub-compatible";
  if (kind === "url") return t("source_group_web");
  if (kind === "github") return t("source_group_github");
  return t("source_group_hn");
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function modalSource(draft: Record<string, unknown>, t: Translator): SourceConfig {
  const sourceId = String(draft.sourceId ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(sourceId)) throw new Error(t("source_id_invalid"));
  const kind = draft.kind as SourceKind;
  if (!SOURCE_KINDS.includes(kind)) throw new Error(t("source_kind_invalid"));
  const source: SourceConfig = { sourceId, kind, enabled: draft.enabled !== false };
  const label = String(draft.label ?? "").trim();
  if (label) source.label = label;
  if (kind === "rss" || kind === "rsshub-compatible" || kind === "url") {
    const url = String(draft.url ?? "").trim();
    if (!url) throw new Error(t("source_url_required"));
    source.url = url;
  }
  if (kind === "rss" || kind === "rsshub-compatible") source.limit = boundedInteger(draft.limit, 20, 1, 100);
  if (kind === "github") {
    const query = String(draft.query ?? "").trim();
    if (!query) throw new Error(t("github_query_required"));
    source.query = query;
    source.limit = boundedInteger(draft.limit, 20, 1, 100);
    source.pages = boundedInteger(draft.pages, 1, 1, 3);
  }
  if (kind === "hn") {
    source.mode = String(draft.mode ?? "topstories");
    source.limit = boundedInteger(draft.limit, 20, 1, 100);
  }
  return source;
}

class SourceEditorModal extends Modal {
  private readonly draft: Record<string, unknown>;

  constructor(
    app: App,
    source: SourceConfig | undefined,
    private readonly existingIds: Set<string>,
    private readonly t: Translator,
    private readonly onSaveSource: (source: SourceConfig) => Promise<void>
  ) {
    super(app);
    this.draft = source ? JSON.parse(JSON.stringify(source)) as Record<string, unknown> : { sourceId: "", label: "", kind: "rss", enabled: true, url: "", limit: 20 };
    if (source) this.existingIds.delete(source.sourceId);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("trending-radar-source-modal");
    contentEl.createEl("h2", { text: this.draft.sourceId ? this.t("modal_edit_source") : this.t("modal_add_source") });
    contentEl.createEl("p", { cls: "setting-item-description", text: this.t("modal_source_desc") });

    new Setting(contentEl).setName(this.t("source_id")).setDesc(this.t("source_id_desc")).addText((text) => text
      .setPlaceholder(this.t("source_id_placeholder"))
      .setValue(String(this.draft.sourceId ?? ""))
      .onChange((value) => { this.draft.sourceId = value.trim(); }));
    new Setting(contentEl).setName(this.t("display_name")).setDesc(this.t("display_name_desc")).addText((text) => text
      .setPlaceholder(this.t("display_name_placeholder"))
      .setValue(String(this.draft.label ?? ""))
      .onChange((value) => { this.draft.label = value; }));
    new Setting(contentEl).setName(this.t("source_type")).addDropdown((dropdown) => {
      for (const kind of SOURCE_KINDS) dropdown.addOption(kind, sourceKindLabel(this.t, kind));
      dropdown.setValue(String(this.draft.kind ?? "rss")).onChange((value) => {
        this.draft.kind = value;
        this.render();
      });
    });
    new Setting(contentEl).setName(this.t("enabled")).addToggle((toggle) => toggle
      .setValue(this.draft.enabled !== false)
      .onChange((value) => { this.draft.enabled = value; }));

    const kind = this.draft.kind as SourceKind;
    if (kind === "rss" || kind === "rsshub-compatible" || kind === "url") {
      new Setting(contentEl).setName(this.t("url")).setDesc(kind === "rsshub-compatible" ? this.t("url_rsshub_desc") : this.t("url_public_desc")).addText((text) => text
        .setPlaceholder(this.t("url_placeholder"))
        .setValue(String(this.draft.url ?? ""))
        .onChange((value) => { this.draft.url = value.trim(); }));
    }
    if (kind === "github") {
      new Setting(contentEl).setName(this.t("repository_query")).setDesc(this.t("repository_query_desc")).addText((text) => text
        .setPlaceholder(this.t("repository_query_placeholder"))
        .setValue(String(this.draft.query ?? ""))
        .onChange((value) => { this.draft.query = value; }));
      new Setting(contentEl).setName(this.t("pages")).setDesc(this.t("pages_desc")).addText((text) => text
        .setValue(String(this.draft.pages ?? 1))
        .onChange((value) => { this.draft.pages = value; }));
    }
    if (kind === "hn") {
      new Setting(contentEl).setName(this.t("story_list")).addDropdown((dropdown) => dropdown
        .addOptions({ topstories: this.t("top_stories"), newstories: this.t("new_stories"), beststories: this.t("best_stories"), askstories: this.t("ask_hn"), showstories: this.t("show_hn") })
        .setValue(String(this.draft.mode ?? "topstories"))
        .onChange((value) => { this.draft.mode = value; }));
    }
    if (kind !== "url") {
      new Setting(contentEl).setName(this.t("item_limit")).setDesc(this.t("item_limit_desc")).addText((text) => text
        .setValue(String(this.draft.limit ?? 20))
        .onChange((value) => { this.draft.limit = value; }));
    }

    const errorEl = contentEl.createDiv({ cls: "trending-radar-modal-error" });
    const actions = contentEl.createDiv({ cls: "trending-radar-modal-actions" });
    const cancel = actions.createEl("button", { text: this.t("cancel") });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: this.t("save_source") });
    save.addEventListener("click", () => void (async () => {
      try {
        const source = modalSource(this.draft, this.t);
        if (this.existingIds.has(source.sourceId)) throw new Error(this.t("source_id_duplicate", { sourceId: source.sourceId }));
        await this.onSaveSource(source);
        this.close();
      } catch (error) {
        errorEl.setText(error instanceof Error ? error.message : String(error));
      }
    })());
  }
}

class DeleteSourceModal extends Modal {
  constructor(app: App, private readonly source: SourceConfig, private readonly t: Translator, private readonly onDelete: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.t("delete_source_title") });
    this.contentEl.createEl("p", { text: this.t("delete_source_desc", { name: sourceName(this.source) }) });
    const actions = this.contentEl.createDiv({ cls: "trending-radar-modal-actions" });
    actions.createEl("button", { text: this.t("cancel") }).addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { cls: "mod-warning", text: this.t("delete_source_action") });
    remove.addEventListener("click", () => void (async () => {
      await this.onDelete();
      this.close();
    })());
  }
}

class ConfirmCancelRunModal extends Modal {
  constructor(app: App, private readonly t: Translator, private readonly onConfirm: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.t("confirm_cancel_title") });
    this.contentEl.createEl("p", { text: this.t("confirm_cancel_desc") });
    const actions = this.contentEl.createDiv({ cls: "trending-radar-modal-actions" });
    actions.createEl("button", { text: this.t("keep_running") }).addEventListener("click", () => this.close());
    const cancel = actions.createEl("button", { cls: "mod-warning", text: this.t("confirm_cancel") });
    cancel.addEventListener("click", () => void (async () => {
      await this.onConfirm();
      this.close();
    })());
  }
}

export class TrendingRadarSettingTab extends PluginSettingTab {
  private renderGeneration = 0;
  private pendingScrollSnapshot: ScrollPositionSnapshot | null = null;

  constructor(app: App, private readonly plugin: TrendingRadarPlugin) {
    super(app, plugin);
  }

  private get t(): Translator {
    return this.plugin.translate.bind(this.plugin);
  }

  display(): void {
    const generation = ++this.renderGeneration;
    this.pendingScrollSnapshot = captureScrollPosition(this.containerEl);
    this.containerEl.empty();
    this.containerEl.addClass("trending-radar-settings");
    this.containerEl.createDiv({ cls: "trending-radar-loading", text: this.t("loading_settings") });
    void this.render(generation);
  }

  private async render(generation: number): Promise<void> {
    let profile: Profile | undefined;
    let profileError: string | undefined;
    try {
      profile = await this.plugin.loadProfile();
    } catch (error) {
      profileError = error instanceof Error ? error.message : String(error);
    }
    if (generation !== this.renderGeneration) return;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("trending-radar-settings");
    this.renderOutput(containerEl, profile, profileError);
    this.renderProvider(containerEl);
    if (profile) {
      this.renderSources(containerEl, profile);
      this.renderTopics(containerEl, profile);
      this.renderFilters(containerEl, profile);
    } else {
      const unavailable = createSection(containerEl, "radar", this.t("section_profile_controls_title"), this.t("section_profile_controls_desc"));
      unavailable.createDiv({ cls: "trending-radar-empty", text: profileError ?? this.t("no_profile_selected") });
    }
    this.renderActions(containerEl);
    restoreScrollPosition(this.pendingScrollSnapshot);
    this.pendingScrollSnapshot = null;
  }

  private renderOutput(parent: HTMLElement, profile: Profile | undefined, profileError: string | undefined): void {
    const section = createSection(parent, "folder-output", this.t("section_output_title"), this.t("section_output_desc"));
    new Setting(section).setName(this.t("profile_path")).setDesc(profileError ?? (profile ? this.t("profile_loaded", { profileId: profile.profileId, version: profile.version }) : this.t("profile_path_desc"))).addText((text) => text
      .setPlaceholder(this.t("profile_path_placeholder"))
      .setValue(this.plugin.settings.profilePath)
      .onChange(async (value) => {
        this.plugin.settings.profilePath = value.trim();
        await this.plugin.saveSettings();
      })).addButton((button) => button.setButtonText(profile || profileError ? this.t("reload") : this.t("create")).setIcon(profile || profileError ? "refresh-cw" : "file-plus-2").onClick(() => void (async () => {
        try {
          if (!profile && !profileError) await this.plugin.createProfile();
          this.display();
        } catch (error) {
          new Notice(this.t("notice_profile_error", { message: error instanceof Error ? error.message : String(error) }));
        }
      })()));
    if (profile) {
      let outputDirectory = profile.outputDirectory;
      new Setting(section).setName(this.t("output_directory")).setDesc(this.t("output_directory_desc")).addText((text) => text
        .setValue(outputDirectory)
        .onChange((value) => { outputDirectory = value.trim(); }))
        .addButton((button) => button.setButtonText(this.t("save")).setIcon("save").onClick(() => void this.changeProfile((draft) => { draft.outputDirectory = outputDirectory || this.plugin.settings.outputDirectory || "Trending Radar"; })));
    }
    new Setting(section).setName(this.t("language")).setDesc(this.t("language_desc")).addDropdown((dropdown) => dropdown
      .addOptions({ auto: this.t("language_auto"), "zh-CN": this.t("language_zh"), en: this.t("language_en") })
      .setValue(this.plugin.settings.language)
      .onChange(async (value) => {
        this.plugin.settings.language = value as typeof this.plugin.settings.language;
        await this.plugin.saveSettings();
        this.display();
      }));
  }

  private renderProvider(parent: HTMLElement): void {
    const section = createSection(parent, "key-round", this.t("section_provider_title"), this.t("section_provider_desc"));
    new Setting(section).setName(this.t("api_key")).setDesc(this.t("api_key_desc")).addText((text) => {
      text.setValue(this.plugin.settings.providerApiKey).onChange(async (value) => {
        this.plugin.settings.providerApiKey = value;
        this.plugin.clearProviderModels();
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.inputEl.spellcheck = false;
    });
    new Setting(section).setName(this.t("api_base_url")).setDesc(this.t("api_base_url_desc")).addText((text) => text
      .setPlaceholder(this.t("api_base_url_placeholder"))
      .setValue(this.plugin.settings.providerBaseUrl)
      .onChange(async (value) => {
        this.plugin.settings.providerBaseUrl = value.trim();
        this.plugin.clearProviderModels();
        await this.plugin.saveSettings();
      }));
    const modelSetting = new Setting(section).setName(this.t("model_id")).setDesc(this.plugin.describeProviderModelState()).addText((text) => text
      .setPlaceholder(this.t("model_placeholder"))
      .setValue(this.plugin.settings.providerModelId)
      .onChange(async (value) => {
        this.plugin.settings.providerModelId = value.trim();
        this.plugin.clearProviderModels();
        await this.plugin.saveSettings();
    })).addExtraButton((button) => button.setIcon("refresh-cw").setTooltip(this.t("refresh_models")).onClick(() => void this.plugin.refreshProviderModels()))
      .addExtraButton((button) => button.setIcon("badge-check").setTooltip(this.t("verify_model")).onClick(() => void this.plugin.verifyProviderModel()));
    const modelInput = modelSetting.controlEl.querySelector("input");
    if (modelInput) {
      modelInput.setAttribute("list", "trending-radar-provider-models");
      const datalist = modelSetting.controlEl.createEl("datalist", { attr: { id: "trending-radar-provider-models" } });
      for (const model of this.plugin.getProviderModels()) datalist.createEl("option", { attr: { value: model.id, label: model.ownedBy ?? "" } });
    }
  }

  private renderSources(parent: HTMLElement, profile: Profile): void {
    const enabled = profile.sources.filter((source) => source.enabled).length;
    const section = createSection(parent, "radar", this.t("section_sources_title"), this.t("section_sources_desc", { enabled, total: profile.sources.length }));
    const toolbar = section.createDiv({ cls: "trending-radar-toolbar" });
    const add = toolbar.createEl("button", { cls: "mod-cta" });
    setIcon(add, "plus");
    add.createSpan({ text: this.t("add_source") });
    add.addEventListener("click", () => new SourceEditorModal(this.app, undefined, new Set(profile.sources.map((source) => source.sourceId)), this.t, async (source) => {
      await this.changeProfile((draft) => { draft.sources.push(source); });
    }).open());
    const enableAll = toolbar.createEl("button");
    setIcon(enableAll, "check-check");
    enableAll.createSpan({ text: this.t("enable_all") });
    enableAll.addEventListener("click", () => void this.changeProfile((draft) => { draft.sources = draft.sources.map((source) => ({ ...source, enabled: true })); }));
    const disableAll = toolbar.createEl("button");
    setIcon(disableAll, "circle-off");
    disableAll.createSpan({ text: this.t("disable_all") });
    disableAll.addEventListener("click", () => void this.changeProfile((draft) => { draft.sources = draft.sources.map((source) => ({ ...source, enabled: false })); }));

    if (profile.sources.length === 0) {
      const empty = section.createDiv({ cls: "trending-radar-empty" });
      empty.createDiv({ text: this.t("no_sources") });
      const seed = empty.createEl("button", { cls: "mod-cta" });
      setIcon(seed, "library-big");
      seed.createSpan({ text: this.t("add_recommended_sources") });
      seed.addEventListener("click", () => void this.changeProfile((draft) => {
        const recommended = createDefaultProfile(draft.outputDirectory);
        draft.sources.push(...recommended.sources);
        if (draft.topics.length === 0) draft.topics = [...recommended.topics];
        if (!draft.filter.sections) draft.filter = { ...recommended.filter, ...draft.filter, sections: recommended.filter.sections };
        if (draft.templateId === "default") draft.templateId = recommended.templateId;
      }));
    }
    for (const group of SOURCE_GROUPS) {
      const sources = profile.sources.filter((source) => group.kinds.includes(source.kind));
      if (sources.length === 0) continue;
      const details = section.createEl("details", { cls: "trending-radar-source-group" });
      details.open = true;
      const groupEnabled = sources.filter((source) => source.enabled).length;
      details.createEl("summary", { text: `${this.t(group.labelKey)} (${groupEnabled}/${sources.length})` });
      const grid = details.createDiv({ cls: "trending-radar-source-grid" });
      for (const source of sources) {
        const card = grid.createDiv({ cls: `trending-radar-source-card${source.enabled ? " is-enabled" : ""}` });
        const sourceSetting = new Setting(card).setName(sourceName(source));
        renderSourceDescription(sourceSetting, source, this.plugin.getLocale(), this.t);
        sourceSetting.addToggle((toggle) => toggle
          .setValue(source.enabled)
          .onChange((value) => void this.changeProfile((draft) => {
            const current = draft.sources.find((entry) => entry.sourceId === source.sourceId);
            if (current) current.enabled = value;
          })))
          .addExtraButton((button) => button.setIcon("pencil").setTooltip(this.t("edit_source", { name: sourceName(source) })).onClick(() => new SourceEditorModal(this.app, source, new Set(profile.sources.map((entry) => entry.sourceId)), this.t, async (edited) => {
            await this.changeProfile((draft) => {
              const index = draft.sources.findIndex((entry) => entry.sourceId === source.sourceId);
              if (index >= 0) draft.sources[index] = edited;
            });
          }).open()))
          .addExtraButton((button) => button.setIcon("trash-2").setTooltip(this.t("delete_source", { name: sourceName(source) })).onClick(() => new DeleteSourceModal(this.app, source, this.t, async () => {
            await this.changeProfile((draft) => { draft.sources = draft.sources.filter((entry) => entry.sourceId !== source.sourceId); });
          }).open()));
      }
    }
  }

  private renderTopics(parent: HTMLElement, profile: Profile): void {
    const section = createSection(parent, "focus", this.t("section_topics_title"), this.t("section_topics_desc"));
    const chips = section.createDiv({ cls: "trending-radar-topic-list" });
    for (const topic of profile.topics) {
      const chip = chips.createDiv({ cls: "trending-radar-topic" });
      chip.createSpan({ text: topic });
      const remove = chip.createEl("button", { attr: { "aria-label": this.t("remove_topic", { topic }) } });
      setIcon(remove, "x");
      remove.addEventListener("click", () => void this.changeProfile((draft) => { draft.topics = draft.topics.filter((entry) => entry !== topic); }));
    }
    if (profile.topics.length === 0) chips.createSpan({ cls: "trending-radar-empty-inline", text: this.t("no_topics") });
    let topic = "";
    const addSetting = new Setting(section).setName(this.t("add_topic")).setDesc(this.t("add_topic_desc")).addText((text) => {
      text.setPlaceholder(this.t("topic_placeholder")).onChange((value) => { topic = value.trim(); });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.addTopic(topic, profile);
        }
      });
    }).addButton((button) => button.setButtonText(this.t("add")).setIcon("plus").onClick(() => void this.addTopic(topic, profile)));
    addSetting.controlEl.addClass("trending-radar-topic-input");

    const suggestions = section.createDiv({ cls: "trending-radar-topic-suggestions" });
    new Setting(suggestions).setName(this.t("suggested_topics")).setHeading();
    suggestions.createEl("p", { text: this.t("suggested_topics_desc") });
    const groups = availableTopicSuggestionGroups(profile.topics);
    if (groups.length === 0) {
      suggestions.createDiv({ cls: "trending-radar-empty-inline", text: this.t("no_suggested_topics") });
      return;
    }
    for (const group of groups) {
      const groupEl = suggestions.createDiv({ cls: "trending-radar-topic-suggestion-group" });
      groupEl.createDiv({ cls: "trending-radar-topic-suggestion-label", text: this.t(TOPIC_SUGGESTION_LABEL_KEYS[group.id]) });
      const list = groupEl.createDiv({ cls: "trending-radar-topic-suggestion-list" });
      for (const suggestedTopic of group.topics) {
        const button = list.createEl("button", {
          cls: "trending-radar-topic-suggestion",
          text: suggestedTopic,
          attr: {
            type: "button",
            "aria-label": this.t("add_suggested_topic", { topic: suggestedTopic })
          }
        });
        button.addEventListener("click", () => void this.addTopic(suggestedTopic, profile));
      }
    }
  }

  private renderFilters(parent: HTMLElement, profile: Profile): void {
    const section = createSection(parent, "list-filter", this.t("section_filters_title"), this.t("section_filters_desc"));
    const maxItems = boundedInteger(profile.filter.maxItems, 50, 1, 100);
    new Setting(section).setName(this.t("filter_max_items")).setDesc(this.t("filter_max_items_desc")).addSlider((slider) => slider
      .setLimits(1, 100, 1)
      .setDynamicTooltip()
      .setValue(maxItems)
       .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, maxItems: value }; }, false)));
    const maxAgeHours = boundedInteger(profile.filter.maxAgeHours, 24, 24, 24 * 30);
    new Setting(section).setName(this.t("filter_max_age")).setDesc(this.t("filter_max_age_desc")).addSlider((slider) => slider
      .setLimits(24, 24 * 30, 24)
      .setDynamicTooltip()
      .setValue(maxAgeHours)
      .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, maxAgeHours: value }; }, false)));
    new Setting(section).setName(this.t("filter_require_published_at")).setDesc(this.t("filter_require_published_at_desc")).addToggle((toggle) => toggle
      .setValue(profile.filter.requirePublishedAt !== false)
      .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, requirePublishedAt: value }; })));
    const aiMaxItems = boundedInteger(profile.filter.aiMaxItems, 15, 1, 30);
    new Setting(section).setName(this.t("filter_ai_max_items")).setDesc(this.t("filter_ai_max_items_desc")).addSlider((slider) => slider
      .setLimits(1, 30, 1)
      .setValue(aiMaxItems)
      .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, aiMaxItems: value }; }, false)));
    const aiMinimumScore = boundedInteger(profile.filter.aiMinimumScore, 70, 0, 100);
    new Setting(section).setName(this.t("filter_ai_minimum_score")).setDesc(this.t("filter_ai_minimum_score_desc")).addSlider((slider) => slider
      .setLimits(0, 100, 5)
      .setValue(aiMinimumScore)
      .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, aiMinimumScore: value }; }, false)));
    new Setting(section).setName(this.t("filter_require_topic")).setDesc(this.t("filter_require_topic_desc")).addToggle((toggle) => toggle
      .setValue(profile.filter.requireTopicMatch === true)
      .onChange((value) => void this.changeProfile((draft) => { draft.filter = { ...draft.filter, requireTopicMatch: value }; })));
  }

  private renderActions(parent: HTMLElement): void {
    const section = createSection(parent, "play", this.t("section_run_title"), this.t("section_run_desc"));
    const active = this.plugin.isRunActive();
    new Setting(section)
      .setName(active ? this.t("run_cancel") : this.t("run_collect"))
      .setDesc(active ? this.t("run_cancel_desc") : this.t("run_collect_desc"))
      .addButton((button) => {
        button.setButtonText(active ? this.t("cancel_run") : this.t("run_now")).setIcon(active ? "square" : "play");
        if (active) {
          button.setWarning().onClick(() => new ConfirmCancelRunModal(this.app, this.t, () => this.plugin.cancelCurrentRun()).open());
        } else {
          button.setCta().onClick(() => void this.plugin.runManual());
        }
      });
    new Setting(section).setName(this.t("run_ai")).setDesc(this.t("run_ai_desc")).addButton((button) => button.setButtonText(this.t("generate_draft")).setIcon("sparkles").onClick(() => void this.plugin.generateAiDraft()));
    new Setting(section).setName(this.t("last_run")).setDesc(this.plugin.settings.lastRunSummary || this.t("no_run_recorded"));
  }

  private async addTopic(topic: string, profile: Profile): Promise<void> {
    const normalized = topic.trim();
    if (!normalized || profile.topics.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) return;
    await this.changeProfile((draft) => { draft.topics.push(normalized); });
  }

  private async changeProfile(mutate: (draft: Profile) => void, redisplay = true): Promise<void> {
    try {
      await this.plugin.updateProfile(mutate);
      if (redisplay) this.display();
    } catch (error) {
      new Notice(this.t("notice_profile_error", { message: error instanceof Error ? error.message : String(error) }));
    }
  }
}
