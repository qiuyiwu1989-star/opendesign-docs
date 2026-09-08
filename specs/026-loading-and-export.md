# 026: On-demand tools and repaired HTML delivery

## Intent
Continue the agreed loading/download acceptance slice. Opening a document should not initialize repair tools until requested; long documents should not load the slide editor. Keep the existing simple controls and data boundaries.

## Scope
- Lazy-load slide editing and the collapsed resource tools. Keep loaded tools mounted when collapsed so asynchronous state is not silently discarded.
- Show concise loading/error states with explicit retry; keep document navigation outside the failed feature boundary. Do not clear storage or automatically reload unsaved work.
- Measure the sum of entry JS plus static imports, not just a renamed entry chunk. Add an executable build-budget check, keep Vite warnings enabled.
- Download an actual repaired synthetic HTML through the UI, inspect on-disk source, and reimport through the UI. Verify embedded image/font resources and original/version integrity within available browser support.

## Non-goals
No dependency upgrade, server/CDN changes, schema migration, deployment, push, cloud collaboration or broad editor rewrite. Bundle size is not a measured page-speed percentage. Real device/fullscreen acceptance is separate.

## Acceptance
- [x] On-demand initialization, loading state, error/retry callback and static closure budget tests/checks. No browser network-failure injection.
- [x] Both build bases build and pass budgets; `/docs/` built-app source persistence/editing and view switching checked in browser.
- [x] Real HTML download, on-disk inspection and reimport of repaired synthetic source; completed in spec028 on 2026-09-08. Download event observation is unreliable; actual files were verified independently. Font payload preservation is verified, not broad font rendering compatibility.
- [x] 228 tests and both builds pass; loading slice documented for local commit.

## Status
Loading slice complete locally. Initial download acceptance was blocked; spec028 subsequently closed representative on-disk image/font payload delivery and reimport. See docs/ACCEPTANCE.md for the historical limitation and new evidence. No push/deployment.

Reference: [React lazy](https://react.dev/reference/react/lazy).
