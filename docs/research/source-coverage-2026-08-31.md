# Trending Radar 来源覆盖研究（2026-08-31）

## 结论摘要

当前 `chinese-tech-v2` 的 9 个直连 RSS 已覆盖中文科技、AI、开源和开发者内容，但还缺少三类“时代趋势”信号：

1. **代码与开发者热度**：仓库增长、问答热度、包下载量。GitHub 和 Hacker News 已有可用官方入口；Stack Exchange、npm、Dev.to 也有公开 API，但当前插件没有对应 adapter。
2. **AI 研究与全球产业**：arXiv、OpenAI 官方 RSS、全球科技媒体 RSS 可补足中文媒体的时延和二次转述。Hugging Face 的 trending API 本轮未在时限内响应，应先观察，不作为稳定源。
3. **社区与聚合热度**：Google News RSS 可作发现层；Reddit、Google Trends、GDELT 等入口受超时、限流或动态接口影响，不能当作稳定事实源。

建议继续采用三层模型：

- **稳定事实层**：官方 RSS 或无需密钥的官方 API，纳入默认 profile 前需连续 smoke 验证。
- **可选扩展层**：自托管 RSSHub、网页转 RSS、社区聚合；用户自担上游结构变化和服务可用性。
- **发现层**：Google News 等聚合结果只用于扩大候选，需标记聚合来源、降低权重并接受重复/重定向。

本次仅做只读探测，未接入任何新源。HTTP 状态和响应类型是 **2026-08-31 当日证据**，不代表长期 SLA。

## 已核实、适合优先纳入的入口

| 领域 | 来源与一手入口 | 探测结果（2026-08-31） | 认证/风险 | 适配判断 |
|---|---|---|---|---|
| 开源代码趋势 | GitHub REST Search Repositories：<https://api.github.com/search/repositories?q=topic:ai&sort=stars&order=desc&per_page=1>；文档：<https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-repositories> | HTTP 200，JSON，返回 `total_count` 和仓库条目 | 匿名可用但有速率限制；带 token 会提高配额，不能写入共享 Profile | 现有 `github` adapter 可承载；应以明确 query/排序和低频运行控制配额 |
| 开发者社区 | Hacker News Firebase API：<https://hacker-news.firebaseio.com/v0/topstories.json>；文档：<https://github.com/HackerNews/API> | HTTP 200，JSON，返回 top story ID 列表 | 无认证；需再请求 item 详情，存在请求数量和瞬时波动 | 现有 `hn` adapter 可承载；适合全球开发者热度 |
| 独立开发社区 | Lobsters RSS：<https://lobste.rs/rss> | HTTP 200，`application/rss+xml`，约 46 KB | 公开 RSS；社区主题窄，不能代表大众趋势 | 现有 `rss` adapter 可直接验证；作为开发者补充源 |
| 中文开发者社区 | SegmentFault feeds：<https://segmentfault.com/feeds> | HTTP 200，Atom，约 97 KB | 公开入口；页面/条目结构可能变化，主题质量需长期观察 | 现有 `rss` adapter 可直接探测；候选中文 v3 |
| AI 研究 | arXiv API：<https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=1>；文档：<https://info.arxiv.org/help/api/user-manual.html> | HTTP 200，Atom，返回 `cs.AI` 条目 | 无认证；有请求频率建议，论文量大且重复/预印本噪声高 | 现有 `rss` parser 可解析 Atom；建议按分类和时间窗口限量 |
| AI 官方动态 | OpenAI Blog RSS：<https://openai.com/blog/rss.xml> | HTTP 200，XML，约 700 KB | 无认证；Feed 较大，需使用 `limit` 和去重 | 现有 `rss` adapter 可直接验证；是官方一手动态，不等于全行业趋势 |
| 全球科技商业 | TechCrunch RSS：<https://techcrunch.com/feed/> | HTTP 200，`application/rss+xml` | 公开 RSS；商业/融资和产品新闻占比高，可能重复转载 | 现有 `rss` adapter 可直接验证；作为全球产业层 |
| 全球消费科技 | The Verge RSS：<https://www.theverge.com/rss/index.xml> | HTTP 200，Atom/XML | 公开 RSS；消费电子与文化内容较多，应靠 topics/排序筛选 | 现有 `rss` adapter 可直接验证 |
| 全球深度科技 | Ars Technica RSS：<https://feeds.arstechnica.com/arstechnica/index> | HTTP 200，RSS/XML | 公开 RSS；更新频率高，可能挤占日报名额 | 现有 `rss` adapter 可直接验证，需 per-source limit |
| 开发者内容热度 | DEV API：<https://dev.to/api/articles?top=1&per_page=1>；文档：<https://developers.forem.com/api> | HTTP 200，JSON | 当前无需认证；API 条款、限流和字段变化需持续监控 | 需要新增 JSON adapter，不能伪装成 RSS |
| 问答热度 | Stack Exchange API：<https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=1>；文档：<https://api.stackexchange.com/docs> | HTTP 200，JSON；返回 hot question 条目 | 无密钥也可调用但有 quota/backoff；站点需明确指定 | 需要新增 JSON adapter；适合作为开发问题信号 |
| 包生态热度 | npm Downloads API：<https://api.npmjs.org/downloads/range/last-week/react>；说明：<https://github.com/npm/download-counts> | HTTP 200，JSON，返回每日下载量 | 无认证；必须先有包名列表，下载量不等于质量或趋势 | 需要包名发现/配置契约，暂不适合作为通用 source |

## 已探测但不宜作为默认稳定源

| 来源 | 一手入口 | 结果/限制 | 结论 |
|---|---|---|---|
| Hugging Face Models trending | <https://huggingface.co/api/models?sort=trending&direction=-1&limit=1>；文档：<https://huggingface.co/docs/hub/api> | 本轮请求 20 秒超时；无法证明稳定性 | 暂不纳入默认；可由用户自托管缓存后作为扩展源 |
| Reddit MachineLearning RSS | <https://www.reddit.com/r/MachineLearning/.rss>；API 文档：<https://www.reddit.com/dev/api/> | 本轮 12 秒超时；可能受限流、地域和 User-Agent 策略影响 | 不作为稳定基线；仅在自有代理/缓存下试用 |
| Google Trends daily RSS | <https://trends.google.com/trends/trendingsearches/daily/rss?geo=CN> | 本轮请求超时；Google Trends 没有承诺的通用公开趋势 API | 只能作为人工/第三方发现线索，不直接接入 |
| GDELT DOC API | <https://api.gdeltproject.org/api/v2/doc/doc?query=artificial%20intelligence&mode=artlist&format=json&maxrecords=1>；介绍：<https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/> | 本轮请求超时；公共服务吞吐和查询复杂度会影响响应 | 可选发现层，需缓存、超时和失败可见性 |
| Google News 中文聚合 | <https://news.google.com/rss/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD+OR+%E5%A4%A7%E6%A8%A1%E5%9E%8B+OR+%22AI+Agent%22&hl=zh-CN&gl=CN&ceid=CN:zh-Hans> | 已有仓库 smoke 证据：HTTP 200、20 条、0 丢弃 | 聚合、重复、重定向和媒体质量不稳定 | 保持 `chinese-third-party-v1` 的 discovery 定位，不升格为事实源 |
| Gitee Explore | <https://gitee.com/explore/all.atom>；API 入口：<https://gitee.com/api/v5/swagger> | 本轮返回 HTTP 405；Explore 页面不是可确认的公开 Atom 接口 | 不直接接入；若后续确认官方 API 的排序/趋势语义，再单独立票 |
| V2EX | <https://www.v2ex.com/index.xml> | 本轮超时 | 不纳入默认；可通过用户自托管 RSSHub/缓存扩展 |

## 覆盖缺口与优先级

### P0：不增加 adapter 也能验证的 RSS/API

1. **SegmentFault**：补中文开发者社区，与掘金、博客园、开源中国形成互补；先观察重复率和有效命中数。
2. **arXiv `cs.AI`/`cs.LG`**：补研究前沿，但必须限量、按关键词筛选，避免论文洪水。
3. **OpenAI Blog、Lobsters、TechCrunch、The Verge、Ars Technica**：补全球官方动态、开发者讨论和科技产业；建议建立独立 `global-tech` profile，不把全球媒体混入中文基线。

### P1：需要明确新契约的 JSON API

- GitHub Search 的仓库增长/最近更新时间，而不只是 stars 排序；现有 adapter 可能需要确认字段语义。
- Stack Exchange hot questions、DEV top articles、npm downloads。它们不是 RSS，接入前应新增明确 `source kind`、配额、分页、限流和失败码测试，不能把 JSON endpoint 塞进 RSS 配置。

### P2：第三方或自托管扩展

- Hugging Face、Reddit、V2EX、Gitee Explore、Google Trends、GDELT：先由用户控制的 RSSHub/缓存/代理做稳定性验证；仓库默认 Profile 不携带 Cookie、API key 或绕过反爬逻辑。

## 安全和质量边界

- 本研究没有爬取 Tophub；Tophub 只能作为分类/发现参考，不能作为事实源。
- “HTTP 200”只证明一次可达，不证明内容完整、排序合理或长期可用。默认纳入前至少需要连续多日 smoke、失败率、重复率、主题命中率和最终入选数证据。
- 任何需要账号、Cookie、私有 token 或隐式认证头的入口，都不得写入共享 Profile；应由用户本地配置并保持失败可见。
- 来源数量继续增加前，先解决每源最低/最高配额、多样性和质量排序，否则高频综合源会吞掉日报名额。

## 参考探测命令

以下命令仅执行 GET 和只读解析，不写入上游：

```powershell
Invoke-WebRequest 'https://api.github.com/search/repositories?q=topic:ai&sort=stars&order=desc&per_page=1'
Invoke-WebRequest 'https://hacker-news.firebaseio.com/v0/topstories.json'
Invoke-WebRequest 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=1'
Invoke-WebRequest 'https://segmentfault.com/feeds'
```

