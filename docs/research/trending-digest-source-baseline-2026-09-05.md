# Trending Digest 来源基线（2026-09-05）

这份记录修正了此前把某几天日报的 `sources` 行当作默认来源的误读。截图和本地
Trending Digest `data.json` 显示，旧插件当时配置的是 25 个来源开关，按以下六组呈现：

| 分组 | 旧插件来源 |
|---|---|
| 代码平台 | GitHub Trending、npm 热门包 |
| AI 平台 | Hugging Face、arXiv 论文 |
| 技术社区 | Hacker News、Medium、Reddit r/ML、DEV.to、V2EX 热门、Substack、Hashnode、HackerNoon、Ars Technica、Wired、X/Twitter AI/Tech |
| AI 官方 | OpenAI Blog、Anthropic News、Google AI Blog |
| 中文社区 | 知乎热榜、少数派、36 氪资讯、B 站热门 |
| 产品发现 | Product Hunt、TechCrunch、The Verge |

这是旧插件的用户配置基线，不代表每个来源都已经适合 Trending Radar 的稳定默认采集。
Trending Radar 遵循“事实入口先过稳定性和适配器门槛，价值排序再交给 AI”的边界。

## 已补入 Trending Radar 的稳定入口

以下来源由现有 RSS、GitHub 或 Hacker News 适配器直接承载。默认 v2 Profile 只启用其中
阅读性价比更高的一组，其余保留为可选发现源：

| 旧插件来源 | Trending Radar sourceId | 入口 | 默认 | 备注 |
|---|---|---|---|---|
| GitHub Trending | `global-github-ai` | GitHub 官方 REST Search | 开 | 当前以 AI 主题和 stars 排序作为稳定热度基线，不冒充 GitHub Trending 页面 |
| Hacker News | `global-hn-top` | Hacker News 官方 Firebase/Algolia | 开 | 社区热度信号，保留原始 points/comments |
| arXiv | `research-arxiv-cs-ai`、`research-arxiv-cs-lg` | arXiv 官方 Atom API | 开 | 研究信号，需靠主题和 AI 评分去重 |
| OpenAI Blog | `global-openai-blog` | OpenAI 官方 RSS | 开 | 一手公告，不等于全行业趋势 |
| Google AI Blog | `global-google-ai` | Google 官方 AI RSS | 开 | 已核验 `https://blog.google/technology/ai/rss/` |
| Ars Technica | `global-ars` | 官方 RSS | 开 | 深度科技、安全和政策报道 |
| Wired | `global-wired` | 官方 RSS | 开 | 深度科技/科学/安全，更新频率较低但阅读价值高 |
| TechCrunch | `global-techcrunch` | 官方 RSS | 开 | 全球产业和融资信号，仍需 AI 过滤营销噪声 |
| The Verge | `global-verge` | 官方 RSS | 关 | 消费电子和文化内容较多，保留为产品发现扩展 |
| Medium | `global-medium-ai` | Medium 官方主题 RSS | 关 | 社区文章质量差异大，适合发现层 |
| HackerNoon | `global-hackernoon` | 官方 RSS | 关 | 主题宽、社区稿比例高，适合发现层 |
| Product Hunt | `global-product-hunt` | 官方 Atom feed | 关 | 产品发布信号，不作为事实权威源 |
| V2EX | `global-v2ex` | 官方 Atom feed | 关 | 当前可访问，但历史上有超时，先保持 opt-in |

## 暂不接入的旧插件来源

这些来源仍保留在历史基线中，但当前仓库不把网页抓取、需要新 JSON adapter 的接口或不稳定
第三方转接当作默认事实源：

| 来源 | 暂不接入原因 |
|---|---|
| npm 热门包 | 需要包名发现、下载量窗口和趋势契约；Downloads API 不能直接等同“热门包” |
| Hugging Face | Trending API 稳定性尚未证明，不能把一次超时包装成默认能力 |
| Reddit r/ML | RSS/API 受限流、地域和 User-Agent 策略影响，需用户自有代理或缓存 |
| DEV.to | 官方 JSON API 需要新增 adapter、分页、限流和字段测试，不能塞入 RSS 配置 |
| Anthropic News | 当前未核验到稳定官方 RSS；保留为待核验，不抓新闻页列表 |
| Substack、Hashnode | 没有统一的全站趋势 RSS；通常需要具体刊物/作者 URL |
| X/Twitter AI/Tech | 官方访问和认证边界不适合写入共享 Profile |
| 知乎热榜、36 氪资讯、B 站热门 | 动态/JSON 接口和反爬策略需要专用 adapter 与连续 smoke，不能伪装成 RSS |

旧插件配置中的这些来源仍可作为未来适配器任务的输入，但不应被误报为当前 Trending
Radar 已覆盖。Tophub 只用于分类和发现参考，本仓库不抓取 Tophub。
