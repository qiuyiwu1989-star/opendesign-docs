# OpenDesign Docs

Start with `docs/PROJECT-MEMORY.md`, the owner-confirmed current handoff. Latest work: Spec035 makes review labels sequential and restores the selected anchor highlight plus matching thread focus. Frequent toolbar actions now use one compact self-authored line-icon language while reading/edit/review remain explicit text modes. Spec034's cached source inspection and performance benchmark remain intact. Source `438f7c3` is pushed and deployed; native pointer and chooser reimport remain open. See specs 032–035, TASKS and acceptance.

## Goal
Preserve HTML visual expression while enabling direct editing, versioned review and reliable delivery. Library supplies references; Studio generates; Docs edits and reviews. Do not require an Agent backend.

## Stack
Standalone React, TypeScript, Vite, parse5, Vitest. Browser IndexedDB `opendesign-docs` schema v3. No workspace imports or server credentials.

## Rules
- Local development and public source publication are distinct from deployment.
- Preserve originals, immutable versions, drafts and comments. Never clear browser storage as a migration shortcut.
- Only safe source-span edits. Imported scripts cannot run in previews. Exported original HTML is not sanitized sharing output.
- G3: specs, tests and real acceptance evidence. Representative pointer checks passed; broader device/fullscreen gates remain open.
- No secrets, private samples or production configuration in Git.
- Explicit approval required for deployment, production changes and destructive operations.

## Current state
Spec034 one-source parse sharing removes repeated large-document parsing while preserving exact-source guards. The reproducible benchmark covers 100 and 400-object documents plus a near-5-MiB case. 275 tests / 39 files, typecheck and both build/bundle gates passed for release source `438f7c3`. The isolated Moveable adapter has browser request/save/reload evidence at 100/75/50%, but no native-pointer migration approval. Spec033/032 continue to provide truthful style readback, reversible delete and long-document block/image operations. The specific deletion download still needs an explicitly authorized chooser reimport.

Production alpha: `438f7c3`, release `20260910-438f7c3`, deployed at https://doc.opendesign.cc/ on 2026-09-10 with explicit user authorization. GitHub CI run `34442209094` passed; production edit/save/reload and review-comment creation were checked. The previous schema-compatible release and legacy assets remain available for rollback. No server database, shared-service restart or CSP relaxation occurred. User trial now takes priority over feature expansion. Historical local-only statements below describe earlier stages; `docs/DEPLOYMENT.md` still needs release-record reconciliation.

Spec029: compact contextual placement controls, Escape cancellation for staged text/style/position and IME-aware keyboard handling in both preview bridges. Initial slide drag threshold is 4 iframe-viewport CSS pixels, measured before page zoom conversion (not a claim about physical screen pixels under outer iframe scaling). Arrangement is disabled during direct text editing. 239 tests and both bundle budgets pass. Real VR-deck text/keyboard position save-refresh-download-reimport passed with exact-source file verification. This round's automated pointer drag produced no confirmed movement; physical drag/resize and native IME acceptance remain open. Local only; no user-tab reload, public push or deployment.

Spec028: shared toolbar export popover replaces both full-width banners. Flush edits before exact-source Blob creation; preserve pending-edit guards, invalidate/revoke old URLs, and never report download success from a click alone. Same-URL availability changes must not reopen dismissed tools. 233 tests and both build budgets pass. Actual repaired PNG download/reimport/edit/save/refresh/redownload verified; WOFF2 payload download/reimport verified, fresh decode status inconclusive. Local preview :5179 restored after prior servers stopped, without refreshing any user page; :5180 is development QA. No push/deployment.

Spec027: resource repair is a toolbar popover in both views, not a full-width row. Long-document mode/count guidance no longer reserves canvas height; review version/local-only identity remains in title status. Preserve native auto-popover dismissal, lazy mounted tools and source/version guards. Modern Popover API browsers required; narrow geometry unit-tested, touch/browser matrix still open. 229 tests, typecheck and both build budgets pass. localhost:5181 updated with old hashed assets retained; never automatically reload the user's active page. Local only.

Independent extraction from upstream 576ccbe; spec020. MIT source attribution preserved. First public snapshot is alpha, not a production deployment. See TASKS.md and docs/ACCEPTANCE.md for verification status.

Spec021: content-first presentation uses a full-viewport stage with compact auto-hiding overlay controls. Preserve proportional fitting; never reserve footer height for presentation controls. Local implementation does not imply production deployment.

Spec022: gesture reliability, compact local review and saved-project JSON backup/restore implemented. 176 tests pass with both builds. Real pointer/undo, review persistence and cross-browser downloaded-backup restore verified on the public demo. Restore creates fresh IDs atomically; never overwrite an existing document. Drafts and unsent inputs are excluded. Undo must repaint even when the source string equals the original iframe source. See acceptance record for browser/device limits. Local only, not pushed or deployed.

Spec023: common static resource diagnostics and local standalone IMG repair available in both views. Never confuse preview-blocked resources with network-verified broken links. No remote fetching; subsequent local font and picture support is bounded below. Repair uses existing image validation and source spans; guard async reads against changed context. Session storage remembers only the per-tab document ID, with safe fallback. 188 tests and both builds passed at that stage; actual image replacement/version persistence and readonly review checked. Local only.

Spec024 adds local WOFF/WOFF2 repair for conservative top-level inline font-face src spans. Explicit embedding-rights acknowledgment, 2 MiB file/12 MiB declared expansion/5 MiB HTML limits, browser decode and immutable prepared handles. Never fetch remote fonts or add them globally to document.fonts. Font change may alter line wrapping; descriptor preservation is not pixel preservation. Real WOFF2 load/undo/save/refresh checked; WOFF1 only automated validation coverage so far. 198 tests and both builds pass. Local only; see acceptance record.

Spec025 adds explicit static picture unification in the same resource panel. Require confirmation before choosing a bitmap; remove plain source candidates, preserve wrapper and IMG style/dimension/alt spans. Reject ambiguous or parse-recovered markup, events and identity-bearing candidate nodes. Source-specific dimensions/crops are intentionally lost; do not promise pixel preservation. Async repair checks source, context key, epoch and disabled state. 224 tests and both builds pass, real two-view replacement and immutable-version behavior checked. Main JS 500.80 kB minified triggers a warning; splitting is next. Local only, no push/deployment.

Spec026 loading slice: defer SlidesEditor and ResourcePanelBody, not just their filenames. Resource shell is collapsed and does not parse source until first opened; once activated it stays mounted across collapse. Explicit retry replaces the lazy identity only on request, navigation remains outside the feature boundary, no automatic reload/storage changes. Entry/static closure now 439,623 bytes; slides without tools 484,024 bytes, enforced by check:bundle in both builds. 228 tests pass. Real built-app asset/save/reload checks passed; repaired HTML download/reimport remains unverified. Local preview :5181 is being used in the native browser; do not disturb that document or restart it for QA.
