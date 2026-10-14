# Canvas version evolution — local prototype, 2026-10-13

User intent: retain the author's full frame and page order, show generated HTML as a derived version inside the canvas instead of only handing out a detached file.

## Delivered
- Top-level Versions entry: persisted original snapshots, derived faithful HTML, exact parent IDs, timestamps, page counts and change notes.
- Capture entire work before rendering; keep all page IDs/order and image bytes. Render fixed page bounds through SVG. Only existing BR repair is applied to derived scenes. Raster source illustrations remain raster; this is not semantic HTML reconstruction of their contents.
- Preview is sandboxed; standalone download embeds page SVGs and image data. Source JSON downloads can be restored and edited. Continue-editing first checkpoints the current canvas.
- Development-only loopback API stores immutable records under ignored `.local/thinking-versions`. Atomic temp-file rename; no cloud sync/deployment.
- Canvas draft migrated to separate IndexedDB with transactional expected-token write checks. Legacy localStorage retained. Stale writers pause instead of overwriting.

## Evidence
- Before code changes, downloaded the actual browser work: 12 pages, approximately 17 MB. Preserved separate recovery file outside repository. Hot reload exposed the older 8-page localStorage copy; checkpointed it before restoring 12-page source.
- In native browser, restored complete 12 pages, generated faithful version, inspected all 12 pages in overview, refreshed browser, verified 12-page workspace persisted and version history reloaded with HTML preview.
- Full page ID order and image files match original; text changes confined to diagram BR normalization and wrapping on page 11.
- 9 focused tests: parent immutability/order validation, export count/escape/order, workspace regression, IndexedDB stale-writer protection. Typecheck, Vite build and bundle budgets passed.

## Boundaries
- Current editing remains browser-profile-local. Immutable version records shared only through this running local service; no multi-device or live draft sync.
- HTML playback is view-only; editing resumes from stored canvas scene. No side-by-side diff, semantic image extraction, background AI generation or production deployment.
- Closing a tab before asynchronous save completes remains a risk; rely on saved status or an explicit version checkpoint.
