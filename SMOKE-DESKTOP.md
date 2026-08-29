# Trending Radar Obsidian Desktop Smoke

## 测试环境

- 日期：2026-08-28
- Obsidian Desktop：`1.13.7`
- 隔离测试 Vault：`<isolated-vault>`
- 插件安装目录：`<isolated-vault>/.obsidian/plugins/trending-radar/`
- Profile：`trending-radar-profile.json`，`profileId=example`，`version=v5`
- 启用源：`github-changelog`、`github-obsidian-plugins`、`hn-top`、`hn-long-a`、`hn-long-b`
- 未启用但已配置：手动 URL `manual-article`、中文 `rsshub-compatible` `chinese-provider`

## 验收记录

### 手动运行、失败可见与恢复

1. `2026-08-28T10-30-29-377Z-v4w8kh`：RSS/GitHub 成功，HN `TIMEOUT`；Developer Console 记录 `source_failed`，整体 `partial`，失败文件写入该运行目录。
2. `2026-08-28T11-48-55-245Z-ox5yj3`：仅重跑 HN 并成功，证明失败源按源粒度恢复。
3. `2026-08-28T11-49-18-929Z-zfylab`：三个源均 `source_reused`，证明版本匹配的成功源不会重复抓取。
4. `2026-08-28T13-51-00-521Z-3ynq0z`：Profile `v4` 增加长时 HN 源后，RSS/GitHub 复用，三个 HN 源重新抓取并完成；随后 `v5` 运行继续覆盖五源。

### 进程中断

- `2026-08-28T13-50-20-736Z-rxzhnv`：关闭 Obsidian 时已有 RSS/GitHub 成功，`hn-top` 正在运行；磁盘上的 `run.json` 保留 `status=running`，`hn-long-a/b` 为 `pending`。
- 重新打开 Obsidian 后运行 `2026-08-28T13-51-00-521Z-3ynq0z`：已成功源被复用，未完成 HN 源从源头重跑并完成。结果没有丢失，但旧运行账本没有自动收口。

### CLI 自动化中断验证

- Obsidian CLI：`1.13.7 (installer 1.13.4)`；命令 `trending-radar:run-manual`、`trending-radar:cancel-run` 可见。
- CLI 触发运行 `2026-08-28T15-22-50-298Z-ykicfh`，确认进入 `hn-top` 后执行 `obsidian restart`，等待 35 秒使 30 秒 lease TTL 过期。
- 随后 CLI 触发运行 `2026-08-28T15-24-55-930Z-d3uz4a`：旧账本自动变为 `status=interrupted`、`finishedAt` 已写入、`lease=null`；新运行复用 RSS/GitHub/HN-top，并重跑 HN 长源，最终 `status=completed`。
- `dev:errors` 返回 `No errors captured.`；无需手工关闭窗口或点击设置页按钮。

### 取消运行

- `2026-08-28T14-08-22-419Z-3508d1`：设置页点击 `Cancel run`。
- 结果：`status=partial`、`cancelRequested=true`；`github-changelog` 与 `github-obsidian-plugins` 复用成功结果，`hn-top`、`hn-long-a`、`hn-long-b` 记录 `cancelled`，错误码为 `CANCELLED`。
- 无活动运行时再次点击取消按钮显示 `Trending Radar: no active run.`，没有新增运行或修改账本。

## 结论

- Desktop 插件可加载；设置页 `Run now` / `Cancel run` 可用；右上角 Notice 和 Developer Console 都能看到逐源状态与失败原因。
- 结果文件和运行账本直接落盘，关闭预览不会丢失已完成源；恢复粒度为源，未完成源从源头重跑。
- 部分失败和取消不会静默变成空日报，整体状态会保留为 `partial`。

## 遗留与未验证

- 旧 `running` 收口、lease 过期接管和源级恢复已通过 CLI 自动化验证；第二实例互斥已由单元测试覆盖。
- CLI 的 `dev:console` 需要先开启 `dev:debug`，因此本次以 Vault 账本和 `dev:errors` 作为自动化证据；逐源控制台日志已在此前真机 smoke 中验证。
- 日报筛选、核查和 Markdown Writer 不属于本 smoke 票。
