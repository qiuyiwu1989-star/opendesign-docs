# OpenDesign Docs

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
Independent extraction from upstream 576ccbe; spec020. MIT source attribution preserved. First public snapshot is alpha, not a production deployment. See TASKS.md and docs/ACCEPTANCE.md for verification status.

Spec021: content-first presentation uses a full-viewport stage with compact auto-hiding overlay controls. Preserve proportional fitting; never reserve footer height for presentation controls. Local implementation does not imply production deployment.

Spec022: gesture reliability, compact local review and saved-project JSON backup/restore implemented. 176 tests pass with both builds. Real pointer/undo, review persistence and cross-browser downloaded-backup restore verified on the public demo. Restore creates fresh IDs atomically; never overwrite an existing document. Drafts and unsent inputs are excluded. Undo must repaint even when the source string equals the original iframe source. See acceptance record for browser/device limits. Local only, not pushed or deployed.

Spec023: common static resource diagnostics and local standalone IMG repair available in both views. Never confuse preview-blocked resources with network-verified broken links. No remote fetching; subsequent local font and picture support is bounded below. Repair uses existing image validation and source spans; guard async reads against changed context. Session storage remembers only the per-tab document ID, with safe fallback. 188 tests and both builds passed at that stage; actual image replacement/version persistence and readonly review checked. Local only.

Spec024 adds local WOFF/WOFF2 repair for conservative top-level inline font-face src spans. Explicit embedding-rights acknowledgment, 2 MiB file/12 MiB declared expansion/5 MiB HTML limits, browser decode and immutable prepared handles. Never fetch remote fonts or add them globally to document.fonts. Font change may alter line wrapping; descriptor preservation is not pixel preservation. Real WOFF2 load/undo/save/refresh checked; WOFF1 only automated validation coverage so far. 198 tests and both builds pass. Local only; see acceptance record.

Spec025 adds explicit static picture unification in the same resource panel. Require confirmation before choosing a bitmap; remove plain source candidates, preserve wrapper and IMG style/dimension/alt spans. Reject ambiguous or parse-recovered markup, events and identity-bearing candidate nodes. Source-specific dimensions/crops are intentionally lost; do not promise pixel preservation. Async repair checks source, context key, epoch and disabled state. 224 tests and both builds pass, real two-view replacement and immutable-version behavior checked. Main JS 500.80 kB minified triggers a warning; splitting is next. Local only, no push/deployment.
