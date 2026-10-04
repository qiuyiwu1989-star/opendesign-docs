## 当前产品原则（用户确认：2026-09-19）

现阶段全部按免费使用开发，包括 Docs、Library/设计总监、Studio 与 Connect。收费方案、付费分层、支付和商业化账号门槛后置，不进入当前开发排期。身份、配额和权限若需要，应服务于安全、资源管理与协作，而非付费解锁。历史收费候选仅为旧讨论，不代表当前计划。

## 2026-09-18 开发者平台落点

- 已交付：公开 SDK、独立 MCP/REST 临时交接、开发者接入页、OpenAPI、AI 接入说明；免费试运行，无需账号。
- 接下来：先完成深脑真实生产按钮联调，积累教育/企业两个来源场景；再引入开发者账号/API Key、项目额度与不含文档正文的用量记录、临时链接主动撤销。
- 后续：有明确跨设备需求时接持久存储/COS与权限；团队协作、长期保留、更高额度作为高级收费候选。当前没有支付或定价承诺。
- Library → Design Director → Studio → Docs 的产品路径保持；Connect 是所有来源交付到 Docs 的公共接入层，不把 MCP 当作自动抓站或 AI 生成服务。

---

# Roadmap — current sequence and historical phases

Goal: HTML → direct editing → saved revision → shared review → revision and delivery.

## Current direction — 2026-09-16

Overall product definition: [OpenDesign 产品定义与发展路径](PRODUCT-STRATEGY.md). Library curates useful design evidence; Design Director gives contextual judgments; Studio creates through conversation; Docs refines and delivers. Connect links these capabilities to education, enterprise products and external Agents.

1. **Now:** finish real DeepBrain/Docs integration; specs036–037 SDK/MCP handoff are locally verified, public availability remains a separate deployment/acceptance step.
2. **Next:** define version/source/ownership and change-proposal contracts with Studio, while closing real editor reliability gaps. Initial return to Studio is an explicit new baseline, not automatic overwrite of human edits.
3. **Later:** identity, permissions, long-term storage and team review only after product trial demonstrates the need. Voice/realtime and comprehensive PPTX compatibility remain later.

The sections below are historical local phases, not a statement that spec024 is still current. See TASKS.md and ACCEPTANCE.md for the latest implemented state. Dates and staffing for the broader product work are not committed.

## Historical local phase — spec024 complete

Local WOFF/WOFF2 repair is available for conservative top-level inline font-face declarations. Preserve the original CSS descriptors and replace only the font source after acknowledgment and decode. Actual WOFF2 undo/save/refresh and long-document rendering were checked. Next proposed asset work is complex backgrounds/picture handling; font compatibility expansion still needs representative fixtures. Cloud/voice and deployment remain separate decisions.

## Previous local phase — spec023

Static resource diagnostics and local standalone-image repair now work in both views. The panel stays collapsed, distinguishes preview isolation from local-file dependencies, and does not load external resources. Real replacement/undo/version/refresh checks passed; this is not full CSS or font compatibility. Proposed next asset work: local font embedding and complex backgrounds/picture, subject to a bounded compatibility spec. Physical device/fullscreen gates remain in TASKS.md.

## Previous local phase — spec022

User approved defining and executing the next phase in parallel. Goal: dependable everyday editing, not more top-level screens.

| Owner | Now | Acceptance dependency |
| --- | --- | --- |
| Editor agent | Gesture cancellation, stable scaling, rapid keyboard adjustments | Main's browser drag/resize and undo checks |
| Review agent | Compact anchored comments, focus, reply/resolve workflow | Main's version-bound save/reload checks |
| Backup agent | Portable saved versions + comments, restore as new copy | Validated atomic storage and downloaded-file round trip |
| Main | Integration and combined regression | All three agent results; no production changes |

Portable backup moves forward from v0.2 because HTML-only export omits review context and version history. Asset diagnostics remain next; cloud identity, voice and real-time editing stay later. Unfinished input and temporary drafts are explicitly outside this first backup format.

This is one acceptance-driven local iteration, not a calendar release promise. Ship only the tested slice; record physical-device gaps separately. Push and deploy require their own approval.

| Version | Outcome | Gate |
| --- | --- | --- |
| v0.1 Alpha | Reliable local editing | Pointer/fullscreen acceptance plus edit/save/reload/download/reimport |
| v0.2 Beta | Everyday usability | Asset diagnostics, portable project backup; target-user task completion |
| v0.3 Review | Asynchronous cloud collaboration | Verified identity, version-bound comments, conflict detection, revocable permissions |
| v0.4 Voice | Short anchored voice comments | Explicit recording, playback, permission denial and save-failure recovery |
| v1.0 | Stable team delivery | Two complete acceptance rounds, candidate trial, backup and rollback verification |

Versions are targets, not shipped feature claims or deadline promises. Plan 1–2 week iterations around one user outcome, reserve time for independent QA and user trial, and approve deployments separately.

Realtime co-editing, heavy built-in Agents, full PPTX compatibility and whole-session recording are deferred. External generators should integrate through controlled document import/change proposals, not overwrite human revisions.
