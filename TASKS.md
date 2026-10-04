# Tasks

## 当前主线（2026-10-04）

- 当前公网基线：`20260929T052906Z-handoff`，Studio 匿名免费 AI、PostgreSQL 与独立 Worker 已发布；正式账号、跨设备与 Studio 完整画布编辑仍待交付。[发布回执](docs/releases/20260929T052906Z-handoff.md)。
- 本轮按用户授权并行执行：主任务整理 GitHub 同步与集成；工作台子任务整合直接编辑；账号子任务核实既有身份能力并定义认领契约；可靠性子任务交付定期备份工具和隔离验证。
- GitHub 实时 API 核对：本轮开始时远端 main 为 `438f7c3`，本地 HEAD 为 `236da0f`，9 月中下旬主要代码尚未提交。公网源码快照不是 GitHub 同步证明，推送后需独立核对远端提交。
- 发布验收已有实际下载及数据库恢复证据；原生文件选择器重导入、中文输入法和完整排版操作仍需补齐。610 测试是 9 月 29 日基线，不能代替本轮验证。
- 旧计划中的数据库、持久 Worker 和匿名公网发布待办已被上述发布回执取代；既有浏览器/JSON 数据未执行整体迁移，不把正式账号视作已完成。
- 本轮首批实现：Studio 本地对象排版（图层/样式/顺序、撤销重做、保存新版本、演示页适配预览）；当前身份作品分页列表后端；定期备份脚本与 systemd 模板。正式登录、前端云端列表、画布直接拖动、生产备份安装仍待后续批次。
- 账号方案见 [身份接入](docs/STUDIO-IDENTITY-PLAN-20261004.md)，备份交付见 [备份说明](docs/STUDIO-BACKUP-20261004.md)。收费、完整 PPTX 往返及任意 HTML 全对象自由拖动后置。
- 本批本地集成验收：84 文件 / 618 项测试、类型与域名/后端构建、5 项备份隔离测试通过；浏览器课程字号编辑→撤销重做→保存→刷新通过。
- 第二批继续：云端作品列表 UI 与重新鉴权打开、恢复原操作记录；演示页画布点击选中与图层双向联动；统一服务端可信身份解析。生产默认仍匿名，正式登录和认领未开启。第二批不包含拖动手势或生产发布。
- 第二批集成验收：87 文件 / 634 项测试、类型与构建通过；隔离浏览器企业样例列表找回→编辑→保存→刷新读回、画布点击选择与属性输入保护通过。
- 下方为历史任务与证据，历史版本号不代表当前公网版本。

## Now
- [x] Spec042 场景样板已发布 20260919T131308Z-handoff：教师 9 页＋活动单、企业 8 页，文档库可免费创建副本；两演示样板改字→保存刷新→下载重导入通过，336 tests。真实投影/打印/目标用户评审另跟进。
- [x] A 批次资源样本闭环与发布：20260919T103501Z-handoff，PNG/WebP/WOFF/WOFF2 真实替换→保存刷新→下载重导入；四资源字节一致。含图片解码超时和比例提示。广泛字体/原生 IME/手势/深脑验收仍独立跟进。
- 下一轮明确按三批交付：A 资源保真与候选上线 → B 教师/企业两个可编辑样板 → C Studio 最小创作流程；每批完成标准见 docs/NEXT-WORK-PLAN.md。A 代表样本与 B 场景入口已交付，下一主线执行 C，全部免费。
- [x] 图片解码超时本地候选：15 秒退出，两条解码路径释放资源，迟到位图关闭；336 tests 与生产构建通过。随后已发布并完成代表图片/字体导出再导入，见 specs/041-resource-decode-reliability.md。
- [x] Spec040 本地候选：手柄实时比例提示、缩小与极限尺寸回归通过；Safari 实际 100%→98.5% 验证。随后已随 20260919T103501Z-handoff 发布，详见 specs/040-keyboard-resize.md。
- [x] Spec040 免费键盘缩放已发布 20260919T063449Z-handoff；329 tests，候选 Safari 实际按键/撤销重做/保存刷新通过，线上构建一致。鼠标手势验收未替代。
- 用户决定：现阶段所有产品能力按免费使用开发，收费/付费分层后置。
- [x] Spec039 长文目录已发布 20260919T062545Z-handoff；公网 12 章节列表与证据定位验证通过，详见 specs/039-document-outline.md。
- 下一阶段执行顺序见 [NEXT-WORK-PLAN](docs/NEXT-WORK-PLAN.md)：发布验收收尾 → 编辑/资源体验 → 教育与企业场景 → Studio 最小循环 → Connect 项目身份。外部联调阻塞不阻止独立体验工作。
- [x] Spec038 失焦/连续输入防护已发布 20260919T052742Z-handoff；327 tests、候选 Safari 长文/演示编辑保存刷新、线上构建一致性及 MCP health 通过。原生 IME 与发布后 UI 复核尚未关闭。
- [x] Spec038 第二批本地修复：compositionstart → focusout → compositionend 不再提交候选；等待最终输入期间保护 Escape/flush/编辑目标。322 tests，构建通过，详见 specs/038-input-save-reliability.md。后续已随 20260919T052742Z-handoff 发布。
- [x] Spec038 第一批保存防护已发布（20260918T155207Z-handoff）；320 tests、报告编辑保存下载再导入、文件仅标题变化通过。
- [ ] Spec038 剩余：原生中文输入法确认/取消及失焦时序验收；Safari 原生文件选择器自动化失败待定位。P0 尚未整体关闭。
- [x] 编辑器顶部与文档库增加 MCP 接入入口，公网 Safari 点击后新开 /integrate/#mcp；原文档保留。release 20260918T130600Z-handoff。
- 下一阶段按 docs/EDITOR-OPTIMIZATION-PLAN.md：P0 输入/保存可靠性与交付闭环 → P1 编辑手感/资源/效率 → P2 审阅协作与 Studio 局部 AI。
- [x] 2026-09-18 Docs receiver/SDK publicly deployed and Safari handoff/edit/save/reload/actual download verified. 316 tests pass. See docs/incoming/2026-09-18-opendesign-public-ready.md.
- [x] Reviewed DeepBrain 2026-09-16 status; authored four-question reply in docs/incoming/2026-09-16-opendesign-reply-to-deepbrain.md. Added and passed bytes metadata compatibility tests (handoff suite 20 tests). Button reportedly deployed disabled upstream; next gate is enablement mechanism, nine-chart fixture and public acceptance, not reimplementing the button.
- [x] Owner approved the overall sequence; created docs/EXECUTION-PLAN.md and two synthetic scenario briefs. Immediate gate: locate the actual DeepBrain web-report release baseline before integrating its button.
- [x] Drafted the 2026-09-16 overall product definition and proposed Library/Design Director/Studio/Docs/Connect path in docs/PRODUCT-STRATEGY.md; product roadmap only, not implementation or runtime-migration approval.
- [ ] Walk through a teacher course and enterprise proposal against the proposed Director outputs; then scope the first Studio conversational creation loop and a bounded DSH comparison. Keep Docs integration as the immediate delivery priority.
- [x] Spec037 local: browser SDK (IIFE/ESM), developer demo, stateless MCP + REST temporary handoff service. 313 tests / 44 files and both builds pass. Real MCP link cancel/retry/import/cleanup and edit/save/reload checked; website SDK demo import checked. See docs/OPEN-INTEGRATION.md.
- [x] Spec037 public pilot: independent Node/systemd MCP + REST at /connect/, official client initialize/list/call, browser import/save/download and successful-import cleanup verified. 318 tests pass. See docs/MCP-DEPLOYMENT.md.
- [ ] Developer platform next: account/API-key identity, per-project quota and metadata-only usage, revocable handoffs, then persistence/COS and team capabilities; no billing in current pilot.
- [x] Spec036 local: external single-HTML handoff, explicit source confirmation, shared import validation, persisted-origin label, accurate completion/rejection and guarded static SVG figure operations. 303 tests and both builds/budgets pass; two-origin import, edit/review, real Safari download and chooser reimport checked. See incoming 2026-09-15 receipt.
- [ ] Spec036 remaining production gate: DeepBrain deploys its fix/config, then verify its real production button against the now-live Docs receiver before opening the button to users.
- [x] Spec035: sequential review labels, marker-to-anchor highlight/focus and a compact accessible line-icon language for frequent toolbar actions.
- [x] Spec034: shared one-source parse snapshot plus reproducible 100/400/near-5-MiB long-document benchmark.
- [ ] Spec034 browser gates: isolated gesture request/save/reload passed at 100/75/50%. Downloaded deletion-file reimport awaits explicit local-file upload authorization; native pointer remains separate.
- Current production: https://doc.opendesign.cc/, release `20260919T131308Z-handoff`, activated 2026-09-19 21:14 +08, plus independent MCP runtime `20260918-pilot-r2`. Previous static releases retained for rollback. Older deployment/project-memory records are historical.

## Next
- [x] Non-modal guarded delete, undo, save, refresh and exact-source download verified on a fresh isolated origin. The actual downloaded file equals the public demo source with only the selected paragraph removed and contains no preview metadata.
- [ ] Complete chooser-driven reimport of the newly downloaded deletion result. Exact on-disk source verification is complete but is not a substitute for reimport.
- [x] Approved foundations scope: long-document image/block operations, contextual insertion/style controls and bounded Moveable/Selecto trial (spec032). The experiment is not a production gesture migration.
- [ ] Before gesture migration, finish real pointer drag/resize at 50/75/100% zoom. Request-driven move plus save/reload passes across all three zoom levels and preserves scale/rotation; this is not native-pointer acceptance. Keep the libraries out of production.
- [ ] Existing development-only Vitest 3.2.7 advisory GHSA-82fw-gwwq-j7x9: separately verify a patched major-version upgrade. No force-fix or exposed test server; npm audit found no production dependency issue this round.
- [ ] Recheck physical drag/resize after spec029 threshold change. This round's browser drag automation produced no confirmed movement; bridge event tests are not native-pointer acceptance. Verify native Chinese IME candidate cancellation as well.
- [ ] Extend representative pointer/region checks to touch devices, physical mid-gesture cancellation and native fullscreen.
- [ ] Close v0.1 reliability gaps before adding snapping or multi-selection.
- [ ] Extend delivery acceptance to additional browsers and font decode verification; representative on-disk PNG/WOFF2 payload delivery and reimport are now checked.
- [ ] Complex backgrounds and broader WOFF1, variable/CJK font and nested-CSS compatibility need representative acceptance before expansion. Static picture unification is now covered; preserving multiple responsive candidates is not.
- [ ] Define cloud review identity, version anchors and revocable sharing before implementation.

## Later roadmap
- [ ] P1 delivery matrix: real WOFF1/WOFF2/CJK font and PNG/WebP decode, save, download and reimport across representative browsers.
- [x] P1 performance baseline: reproducible 100/400-object and near-5-MiB benchmark; one-source read snapshot prevents repeated full parses and tools remain lazy.
- [ ] P1 concise UX/accessibility pass: keyboard order, focus return, labels, narrow/touch layouts and native fullscreen.
- [ ] P2 collaboration architecture: identity, anchored comments, permissions, revocable share links and audit history before cloud writes.
- [ ] P2 voice comments only after collaboration ownership, attachment retention and consent rules are explicit.

## Done
- Spec035 review wayfinding: document markers and inspector anchors now share stable `1…n` labels; marker selection restores the source highlight and focuses the matching thread. Undo/redo/resource/export/save use consistent compact line icons while mode names stay explicit. Three-comment browser QA and marker `2` locate passed. See spec and acceptance record.
- Spec034 performance slice: shared read-only parse snapshot and `npm run benchmark:long`; near-5-MiB cold catalog 162.1 ms and warm selected-object operations 1.0 ms on the acceptance host. Request gesture/save/reload matrix passed at 100/75/50%. See spec and acceptance record.
- Spec033: source-only selected-style readback never invents defaults; direct guarded delete is undoable and survives save/refresh. Real downloaded HTML matches the intended single-block removal exactly. See spec and acceptance record.
- Spec031: real Bento marker rendering adaptation with MIT notice; compact persistent text/region markers, click-through to threads, resolved-state visibility; exact selected-version export and safe standalone read-only review snapshots. Mixed text runs preserve original tags and legacy leaf IDs. Extracted LongEditor to an on-demand module and kept review runtime lazy. See acceptance for exported-file checks and viewport/pointer limits.
- Spec029: collapse precise placement/nudges, hide unsupported arrangement controls, cancel staged text/style/position with Escape, guard IME shortcuts and direct-text/arrangement conflicts. 239 tests / 32 files and both build budgets pass. Four private HTML samples pass source-span audit; real 10-page VR deck edit/save/refresh/download/reimport retains exact expected HTML. Pointer/device acceptance remains separate. Local only.
- Spec028: unified no-reflow export popover, bounded filenames and exact-source Blob helper. Fixed dismissed export reopening after transient pending-text selection state. 233 tests, typecheck and both build budgets pass. Real PNG download/reimport/edit/save/refresh/redownload, pending-edit blocking and old-link invalidation verified. Actual WOFF2 payload file/reimport checked; no broad font decode claim. Local preview :5179 restored; no user page auto-refresh.
- Spec027: resources now open from both toolbars in a bounded, theme-aware popover; removed the long-document mode/count row, preserving review identity in title status. Lazy tools and inputs remain mounted after dismissal. 229 tests, typecheck and both build configurations/budgets pass. Real two-view no-reflow geometry, Escape/focus return, iframe light dismissal, preserved font checkbox and read-only review verified. Existing preview updated without clearing old chunks or refreshing the user's document. Narrow placement has unit coverage, not touch-device acceptance.
- Spec026 loading slice: slide editing and resource tools load on demand, with concise loading/error/retry states. Resource checks mount on first expansion and stay mounted when collapsed. Static entry closure 439,623 bytes (12.2% below spec025); slide closure 484,024 bytes. Build budgets count transitive imports, not only the entry filename. 228 tests and both builds pass; built-app repair/save/reload/view-switch checks passed. Download acceptance is separately open.
- Spec025: one compact grouped picture diagnostic, explicit unification/cancel, source-span replacement with candidate removal, layout attributes preserved, conservative malformed/scripted rejection, async version/context guard and keyboard focus return. Real replacement in both views, undo/redo, save/refresh and read-only original review verified. 224 tests / 29 files and both builds pass. Local only.
- Spec024: local WOFF/WOFF2 repair for recognizable inline font-face declarations, with rights acknowledgment, bounded header checks and browser decode. Exact src replacement preserves descriptors, versions and backups. Real WOFF2 ready → undo not-ready → redo/save/refresh ready verified; long-document rendering and old-version read-only controls checked. No remote fetching or font redistribution in the repository.
- Spec023: compact static resource diagnostics, local IMG replacement and shared narrow CSS-image syntax repair; preserve source/undo/drafts/versions. Actual PNG replacement in both views, slide undo/redo, save/refresh and original-version read-only behavior verified. Fixed refresh choosing the first database row instead of the current per-tab document. 188 tests plus both builds pass. Local only.
- Spec022: three parallel tracks delivered gesture fixes, concise review and portable saved-version/comment backups. 176 tests, typecheck and both builds pass. Real drag, vertical resize, undo, review refresh and downloaded JSON cross-browser restore verified. Fixed stale iframe repaint after undo. Local only.
- Spec021: content-first full-viewport presentation, compact idle-hiding controls, keyboard focus/Space fixes. 147 tests and both builds pass; browser geometry, idle/wake, keyboard navigation and return-to-editor verified. Local only; not pushed or deployed.
- Standalone public repository published under MIT (spec020): fresh install, 144 tests, typecheck and both builds pass; initial remote commit and read-only CI run 34105351817 verified.
- Upstream editor baseline: local editing, drafts, versions, page workflow, isolated presentation and selection/focus fixes (upstream 8213e82; 144 tests recorded).

## Blocked / limits
- Resource inspection is static and partial, not a decode/network success report. Font import covers explicit top-level inline declarations; picture repair covers conservative static unification only. Complex CSS, scripted pictures and responsive art-direction preservation remain excluded. Delayed-result guards have unit coverage; no forced browser race or WOFF1 real-file acceptance yet.
- Spec026 historical download blocker superseded by spec028: direct UI clicks now produced confirmed files and file-chooser reimport worked. The automation download-event wait still timed out, and downloadMedia alone produced no second file; neither API result is a delivery signal. Fresh font decode status is still inconclusive despite intact WOFF2 data.
- Deferred loading failure callback has automated coverage; a real failed-network chunk/retry was not fault-injected. Bundle reduction is not a page-speed percentage. Old :5179/:5180/:5181 listeners were stopped on 2026-09-08; restored built preview :5179 and development QA :5180. Browser documents are origin-specific; do not clear or silently migrate them. Local preview is not deployment.
- Region annotations retain their original version/viewport; changed layout width may prevent precise positioning and produces a warning.
- No cloud sharing or voice annotation. Production serves the local-first editor; documents remain in browser storage, not on the server.

## Studio 当前候选（2026-09-19）
- [x] Spec043 本地：需求→确认大纲→结构草稿→单处差异确认→版本恢复→Docs 新副本；浏览器通过基本流程，340 tests，全量构建通过。
- [x] 多任务、IndexedDB 原子版本检查、旧草稿迁移、独立 JSON 备份恢复、未保存输入保护；全量 346 tests，最终增量 10 tests 与生产构建通过。
- [ ] 尚未发布、尚未接 AI；浏览器原生确认阻塞后已改页内确认，仍需完整交互/备份恢复/导出重导入与真实双窗口验收，详见 specs/043-studio-draft-workflow.md。公网仍是 20260919T131308Z-handoff。

## Studio 第一阶段交付（2026-09-20）
- [x] 多任务、备份恢复、未保存保护、双窗口冲突拒绝覆盖及另存新任务。
- [x] Docs 手改副本保留、实际下载与重导入、长内容版式边界验收。
- [x] 公网发布 `20260920T042056Z-handoff`；源码哈希与回滚已记录，MCP 未重启。
- [x] 公网 Safari 创建初稿、刷新恢复、转入五页 Docs 并本机保存通过。
- 下一阶段：真实 AI 生成，当前仍为免费非 AI 结构草稿。
