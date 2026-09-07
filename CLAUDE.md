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

Spec023: common static resource diagnostics and local standalone IMG repair available in both views. Never confuse preview-blocked resources with network-verified broken links. No remote fetching/font loading; complex CSS/picture remains unsupported. Repair uses existing image validation and source spans; guard async reads against changed context. Session storage remembers only the per-tab document ID, with safe fallback. 188 tests and both builds pass; actual image replacement/version persistence and readonly review checked. Local only.
