import type { Locale } from "./i18n.js";
import type { SourceConfig, SourceKind } from "./types.js";

interface SourceGuideDefinition {
  intro: Record<Locale, string>;
  keywords: readonly string[];
}

export interface SourceGuide {
  intro: string;
  keywords: string[];
}

function defineGuide(en: string, zh: string, keywords: readonly string[]): SourceGuideDefinition {
  return { intro: { en, "zh-CN": zh }, keywords };
}

export const BUILT_IN_SOURCE_GUIDES = {
  "cn-sspai": defineGuide(
    "A Chinese community covering productivity tools, digital life, and consumer technology.",
    "关注效率工具、数字生活与消费科技的中文内容社区。",
    ["效率工具", "数字生活", "消费科技"]
  ),
  "cn-solidot": defineGuide(
    "Chinese technology news and discussions spanning software, the internet, science, and security.",
    "覆盖软件、互联网、科学与安全动态的中文科技资讯站。",
    ["科技新闻", "互联网", "软件", "安全"]
  ),
  "cn-infoq": defineGuide(
    "Chinese professional technology coverage for software architecture, cloud, AI, and engineering practice.",
    "面向专业开发者的软件架构、云计算、AI 与工程实践资讯。",
    ["软件架构", "云计算", "AI", "工程实践"]
  ),
  "cn-qbitai": defineGuide(
    "Chinese AI media tracking research, models, products, companies, and industry developments.",
    "追踪 AI 研究、模型、产品、公司和产业进展的中文科技媒体。",
    ["AI", "大模型", "研究", "产业"]
  ),
  "cn-oschina": defineGuide(
    "Chinese open-source news covering project releases, developer tools, and the local software ecosystem.",
    "聚焦开源项目发布、开发工具与国内软件生态的中文资讯。",
    ["开源", "项目发布", "开发工具", "软件生态"]
  ),
  "cn-cnblogs": defineGuide(
    "A broad Chinese developer blogging community with practical programming and engineering articles.",
    "覆盖广泛的中文开发者博客社区，以编程经验和工程实践文章为主。",
    ["开发者博客", "编程", "工程实践", ".NET"]
  ),
  "cn-ithome": defineGuide(
    "High-volume Chinese technology news covering devices, software, platforms, chips, and major companies.",
    "高频覆盖数码硬件、软件平台、芯片与科技公司的中文科技资讯。",
    ["数码硬件", "软件", "芯片", "科技公司"]
  ),
  "cn-meituan-tech": defineGuide(
    "The official Meituan engineering blog, with in-depth articles on large-scale systems, AI, data, and production practice.",
    "美团官方技术博客，提供大规模系统、AI、数据与生产工程实践的深度文章。",
    ["工程实践", "大规模系统", "AI", "数据"]
  ),
  "cn-ruanyifeng-weekly": defineGuide(
    "A weekly Chinese technology digest curated by Ruan Yifeng, covering developer tools, AI, products, and notable projects.",
    "阮一峰策展的中文科技周刊，覆盖开发工具、AI、产品与值得关注的项目。",
    ["科技周刊", "开发工具", "AI", "项目发现"]
  ),
  "cn-ifanr": defineGuide(
    "Chinese technology media focused on products, consumer trends, mobility, and technology business.",
    "关注科技产品、消费趋势、出行与科技商业的中文媒体。",
    ["科技产品", "消费趋势", "汽车", "商业"]
  ),
  "cn-segmentfault": defineGuide(
    "A Chinese developer community for technical articles, programming questions, and engineering knowledge.",
    "汇集技术文章、编程问答与工程知识的中文开发者社区。",
    ["技术文章", "编程问答", "开发者社区"]
  ),
  "global-lobsters": defineGuide(
    "A community-curated link feed centered on programming, computing, and open-source engineering.",
    "由社区筛选的编程、计算机技术与开源工程链接流。",
    ["programming", "computing", "open source"]
  ),
  "global-openai-blog": defineGuide(
    "Official OpenAI announcements about research, models, products, safety, and company updates.",
    "OpenAI 官方发布，涵盖研究、模型、产品、安全与公司动态。",
    ["OpenAI", "模型", "研究", "产品"]
  ),
  "global-google-ai": defineGuide(
    "Official Google AI and Gemini updates covering research, models, developer tools, and products.",
    "Google AI 官方动态，覆盖研究、Gemini 模型、开发工具与产品。",
    ["Google AI", "Gemini", "研究", "开发工具"]
  ),
  "global-techcrunch": defineGuide(
    "Global technology business news focused on startups, funding, products, and major platform companies.",
    "聚焦创业公司、融资、科技产品与大型平台企业的全球科技商业媒体。",
    ["startup", "融资", "产品", "科技商业"]
  ),
  "global-verge": defineGuide(
    "Technology and culture coverage spanning consumer devices, platforms, AI, media, and policy.",
    "覆盖消费电子、平台、AI、媒体文化与科技政策的综合科技媒体。",
    ["消费电子", "平台", "AI", "科技政策"]
  ),
  "global-ars": defineGuide(
    "In-depth reporting and analysis on computing, science, security, policy, and emerging technology.",
    "提供计算机、科学、安全、政策与新兴技术的深度报道和分析。",
    ["深度科技", "科学", "安全", "政策"]
  ),
  "global-wired": defineGuide(
    "Technology, science, security, and culture reporting with a focus on consequential emerging trends.",
    "关注新兴趋势影响的科技、科学、安全与文化深度报道。",
    ["深度科技", "科学", "安全", "趋势"]
  ),
  "global-medium-ai": defineGuide(
    "Community-published AI and engineering essays from Medium's topic feed; quality varies by author.",
    "Medium AI 主题订阅中的社区文章，适合发现实践观点，但作者和质量差异较大。",
    ["AI 实践", "工程文章", "社区观点", "发现层"]
  ),
  "global-hackernoon": defineGuide(
    "A broad technology publication and community feed spanning AI, software, startups, and security.",
    "覆盖 AI、软件、创业与安全的技术社区媒体，适合作为发现层而非权威源。",
    ["技术媒体", "AI", "软件", "发现层"]
  ),
  "global-product-hunt": defineGuide(
    "Official Product Hunt feed for newly launched products and startup discovery.",
    "Product Hunt 官方产品发布流，用于发现新产品和早期创业项目。",
    ["产品发现", "创业", "发布", "早期项目"]
  ),
  "global-v2ex": defineGuide(
    "A Chinese developer community feed with discussions about software, tools, products, and practice.",
    "中文开发者社区讨论流，覆盖软件、工具、产品与实践；可达性和内容稳定性需持续观察。",
    ["开发者社区", "软件", "工具", "中文讨论"]
  ),
  "research-arxiv-cs-ai": defineGuide(
    "Recent arXiv papers in the Artificial Intelligence category (cs.AI).",
    "arXiv 人工智能分类（cs.AI）的最新论文。",
    ["论文", "人工智能", "cs.AI"]
  ),
  "research-arxiv-cs-lg": defineGuide(
    "Recent arXiv papers in the Machine Learning category (cs.LG).",
    "arXiv 机器学习分类（cs.LG）的最新论文。",
    ["论文", "机器学习", "cs.LG"]
  ),
  "global-github-ai": defineGuide(
    "Popular public GitHub repositories matching the Profile's AI query.",
    "按当前 Profile 的 AI 查询发现高热度公开 GitHub 仓库。",
    ["GitHub", "AI", "开源仓库"]
  ),
  "global-hn-top": defineGuide(
    "Top-ranked Hacker News stories, with strong signals from technology, startups, and programming.",
    "Hacker News 热门条目，主要反映科技、创业与编程社区关注。",
    ["technology", "startup", "programming"]
  ),
  "cn-google-news-ai": defineGuide(
    "Google News aggregation for Chinese coverage matching AI, large-model, and Agent queries.",
    "聚合命中 AI、大模型与 Agent 查询的中文 Google News 报道。",
    ["新闻聚合", "AI", "大模型", "Agent"]
  ),
  "cn-rsshub-self-hosted": defineGuide(
    "An opt-in placeholder for a self-hosted RSSHub route; replace its URL before enabling it.",
    "自托管 RSSHub 路由占位项；需先替换 URL，再手动启用。",
    ["RSSHub", "自托管", "可选来源"]
  ),
  "github-changelog": defineGuide(
    "Official GitHub product and platform change announcements.",
    "GitHub 官方产品与平台更新公告。",
    ["GitHub", "产品更新", "开发平台"]
  ),
  "github-obsidian-plugins": defineGuide(
    "Public GitHub repositories matching the example query for Obsidian plugins.",
    "匹配 Obsidian 插件示例查询的公开 GitHub 仓库。",
    ["GitHub", "Obsidian", "插件"]
  ),
  "hn-top": defineGuide(
    "Top-ranked Hacker News stories used by the example Profile.",
    "示例 Profile 使用的 Hacker News 热门条目。",
    ["technology", "startup", "programming"]
  ),
  "manual-article": defineGuide(
    "An example single-page source for extracting one public article.",
    "用于提取单篇公开文章的示例网页来源。",
    ["公开网页", "单篇文章", "示例"]
  ),
  "chinese-provider": defineGuide(
    "An example RSSHub-compatible route that must be replaced with a real public endpoint.",
    "需要替换为真实公开端点的 RSSHub-compatible 示例路由。",
    ["RSSHub", "示例", "待配置"]
  )
} satisfies Record<string, SourceGuideDefinition>;

const FALLBACK_INTROS: Record<SourceKind, Record<Locale, string>> = {
  rss: {
    en: "A public RSS or Atom feed configured by this Profile.",
    "zh-CN": "当前 Profile 配置的公开 RSS 或 Atom 订阅源。"
  },
  url: {
    en: "A public web page collected as a single article.",
    "zh-CN": "作为单篇文章采集的公开网页。"
  },
  github: {
    en: "Public GitHub repositories matching the configured query.",
    "zh-CN": "匹配已配置查询的公开 GitHub 仓库。"
  },
  hn: {
    en: "Stories from the configured public Hacker News list.",
    "zh-CN": "来自已配置 Hacker News 公共榜单的条目。"
  },
  "rsshub-compatible": {
    en: "A public RSSHub-compatible feed configured by this Profile.",
    "zh-CN": "当前 Profile 配置的公开 RSSHub-compatible 订阅源。"
  }
};

const FALLBACK_KEYWORDS: Record<SourceKind, readonly string[]> = {
  rss: ["RSS", "公开订阅"],
  url: ["公开网页", "单篇文章"],
  github: ["GitHub", "公开仓库"],
  hn: ["Hacker News", "社区热榜"],
  "rsshub-compatible": ["RSSHub", "公开订阅"]
};

function embeddedIntro(source: SourceConfig, locale: Locale): string | undefined {
  if (typeof source.description === "string" && source.description.trim()) return source.description.trim();
  const localized = source.description;
  if (localized && typeof localized === "object" && !Array.isArray(localized)) {
    const value = (localized as Record<string, unknown>)[locale];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function embeddedKeywords(source: SourceConfig): string[] | undefined {
  if (!Array.isArray(source.keywords)) return undefined;
  const keywords = source.keywords
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return keywords.length > 0 ? keywords : undefined;
}

export function hasBuiltInSourceGuide(sourceId: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_SOURCE_GUIDES, sourceId);
}

export function getSourceGuide(source: SourceConfig, locale: Locale): SourceGuide {
  const known = BUILT_IN_SOURCE_GUIDES[source.sourceId as keyof typeof BUILT_IN_SOURCE_GUIDES];
  return {
    intro: embeddedIntro(source, locale) ?? known?.intro[locale] ?? FALLBACK_INTROS[source.kind][locale],
    keywords: [...(embeddedKeywords(source) ?? known?.keywords ?? FALLBACK_KEYWORDS[source.kind])]
  };
}
