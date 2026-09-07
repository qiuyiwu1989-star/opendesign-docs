# 023: Resource diagnostics and local image repair

## Intent
Continue the agreed asset-diagnostics phase: explain why imported HTML looks incomplete without adding a large dashboard. A collapsed resource panel works in both document and slide views.

## Scope
- Static diagnosis of image references, common CSS URL/font references and linked stylesheets. Distinguish preview policy restrictions, unpackaged local paths and missing/unsupported references; never describe unrequested remote URLs as verified broken.
- Replace a supported standalone IMG with a validated local PNG/JPEG/WebP, preserving surrounding HTML and existing dimensions/styles. Responsive candidates are explicitly removed; picture/SVG remain restricted. Runtime script behavior is not rewritten or guaranteed.
- Reuse the existing narrow embedded CSS image syntax repair in both views. All repairs are explicit, undoable working-copy edits and enter the existing draft/version/export loop.
- Compact, bounded UI and clear unhandled cases. No new dependencies.
- QA correction: refresh previously selected the first database row, not the current document. Remember only its ID per tab, safely falling back when storage is unavailable or the document no longer exists.

## Non-goals
No network probes/downloads, imported script execution, remote font loading, cloud storage, bulk relinking, offline asset bundles, arbitrary CSS rewriting, deployment or public push. Static inspection cannot establish successful image decoding or complete CSS compatibility.

## Acceptance
- [x] Static tests cover remote/local/embedded/missing references, common CSS URLs/fonts, inert contexts, responsive images and source-span safety.
- [x] Replacement validates content and size, preserves unrelated source, rejects stale/ambiguous targets and unsupported containers.
- [x] UI invalidates async uploads on source/mode/version changes, blocks pending-input conflicts, and permits undo/save/export through existing editor paths. Epoch/source/disabled checks are implemented; an artificially delayed decode race has not been browser-injected in this pass.
- [x] Unit tests, typecheck and both builds pass. Browser verifies resource panel and real local image replacement with undo/save/refresh; untested gates remain explicit.

## Status
Local implementation complete. 188 tests across 27 files, typecheck and both builds pass. Real image decoding, undo/redo, saved versions in both views, refresh selection and review read-only behavior checked on the synthetic fixture. See docs/ACCEPTANCE.md. No push or deployment.
