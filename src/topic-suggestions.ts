export type TopicSuggestionGroupId = "ai" | "development" | "industry";

export interface TopicSuggestionGroup {
  id: TopicSuggestionGroupId;
  topics: readonly string[];
}

export const TOPIC_SUGGESTION_GROUPS: readonly TopicSuggestionGroup[] = [
  {
    id: "ai",
    topics: ["AI", "Agent", "MCP", "大模型", "LLM", "机器学习", "machine learning", "RAG", "多模态", "推理模型", "具身智能"]
  },
  {
    id: "development",
    topics: ["开源", "open source", "开发工具", "developer tools", "编程", "coding", "GitHub", "CLI", "API", "SDK"]
  },
  {
    id: "industry",
    topics: ["产品", "product", "创业", "startup", "融资", "芯片", "机器人", "robotics", "云计算", "安全"]
  }
];

export function availableTopicSuggestionGroups(selectedTopics: readonly string[]): TopicSuggestionGroup[] {
  const selected = new Set(selectedTopics.map((topic) => topic.trim().toLowerCase()));
  return TOPIC_SUGGESTION_GROUPS
    .map((group) => ({
      id: group.id,
      topics: group.topics.filter((topic) => !selected.has(topic.toLowerCase()))
    }))
    .filter((group) => group.topics.length > 0);
}
