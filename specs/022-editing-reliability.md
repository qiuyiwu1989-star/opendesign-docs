# 022: Everyday editing reliability

## Intent
Close the local editing loop with direct manipulation, concise version-bound review and a portable backup. User authorized defining this phase and parallel implementation on 2026-09-07.

## Scope / parallel ownership
1. Editor agent: pointer/resize correctness, keyboard micro-adjustments and cancellation. Own slides-bridge.ts, slide-geometry.ts and their tests only.
2. Review agent: concise comments, selection-to-input focus, pending/resolved filtering, locate/reply/resolve. Own ReviewPanel.tsx, review.css and new review-view helper/tests only.
3. Backup agent: bounded saved-document + review export/restore with validation and atomic insert under fresh IDs. Own store.ts, project-backup.ts, BackupMenu.tsx, backup.css and corresponding tests only.
4. Main agent: App integration, browser QA, task/roadmap/acceptance records, combined tests and local commit.

## Non-goals
No cloud/realtime/voice/AI, deployment, public push, credentials, data deletion, database schema changes or arbitrary HTML execution. No snapping or multi-select. No old private fixtures in the public source tree.

## Acceptance
- [x] One pointer gesture commits one change; cancel restores prior placement; scaling does not shift the fixed corner. Existing complex-layout locks remain. Cancellation is automated coverage; physical mid-gesture cancellation remains a device gate.
- [x] Compact review UI preserves version anchors, unsent inputs on failures, dirty guards, replies and resolve/reopen behavior. Selection focuses the new comment input.
- [x] Backup includes saved versions and their comments; explicitly excludes unfinished inputs and temporary drafts. User is prompted to save before backup when dirty.
- [x] Restore validates schema, byte/count limits and all version/anchor references before writing; no source scripts execute. Fresh document/version/thread/message IDs; all records inserted atomically without overwrites.
- [x] Backup export uses a consistent IndexedDB read snapshot. JSON is a project backup, not a share-ready HTML or offline asset bundle.
- [x] Run all unit tests, typecheck and both builds. Browser check actual drag/resize, review save/reload, and downloaded-backup restore where supported. Distinguish automated/physical gates explicitly.

## Status
Local implementation complete. 176 tests across 25 files, typecheck and both builds pass. Browser evidence and remaining device gates are in docs/ACCEPTANCE.md. Not pushed or deployed.
