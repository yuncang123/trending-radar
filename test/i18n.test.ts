import test from "node:test";
import assert from "node:assert/strict";
import { createTranslator, resolveLocale } from "../src/i18n.js";

test("resolveLocale honors explicit language preferences", () => {
  assert.equal(resolveLocale("zh-CN", "en-US"), "zh-CN");
  assert.equal(resolveLocale("en", "zh-CN"), "en");
});

test("resolveLocale maps Chinese browser languages in auto mode", () => {
  assert.equal(resolveLocale("auto", "zh-CN"), "zh-CN");
  assert.equal(resolveLocale("auto", "zh-TW"), "zh-CN");
  assert.equal(resolveLocale("auto", "en-US"), "en");
  assert.equal(resolveLocale("auto", ""), "en");
});

test("translator interpolates values in both locales", () => {
  assert.equal(createTranslator("en")("section_sources_desc", { enabled: 2, total: 5 }), "2 of 5 sources enabled. Add any public source supported by an adapter.");
  assert.equal(createTranslator("zh-CN")("section_sources_desc", { enabled: 2, total: 5 }), "已启用 2/5 个来源。可添加适配器支持的任意公开来源。");
});

test("Chinese translator renders the provider guidance in Chinese", () => {
  assert.equal(createTranslator("zh-CN")("provider_manual_model"), "可手动输入模型 ID，或点击刷新从当前 Provider 加载模型。");
});

test("Chinese translator renders the topic suggestion library", () => {
  const translate = createTranslator("zh-CN");
  assert.equal(translate("suggested_topics"), "可选关注主题");
  assert.equal(translate("suggestion_group_ai"), "AI 与智能体");
  assert.equal(translate("add_topic_desc"), "会在标题和摘录中进行不区分大小写的匹配。");
});

test("Chinese translator labels source keywords", () => {
  assert.equal(createTranslator("zh-CN")("source_keywords"), "关键词");
});

test("run guidance keeps the external Writer out of the regular settings flow", () => {
  const description = createTranslator("zh-CN")("section_run_desc");
  assert.equal(description, "先采集确定性候选，再用已配置的 AI Provider 评分筛选。");
  assert.equal(description.includes("外部 Writer"), false);
});

test("unknown translation keys are returned without blocking rendering", () => {
  const translate = createTranslator("en") as unknown as (key: "missing_key") => string;
  assert.equal(translate("missing_key"), "missing_key");
});
