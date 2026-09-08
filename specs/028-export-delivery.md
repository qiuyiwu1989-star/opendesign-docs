# Spec028 — Compact, consistent HTML delivery

## Intent
Continue the existing spec026 export acceptance work and the user's space-efficient UI direction. Both views should prepare current source after flushing direct edits, then expose one clear download action without shrinking the canvas.

## Scope
- Shared toolbar export popover replaces the two full-width export banners.
- Concise source-preservation warning; never claim that preparing or clicking a download proves on-disk delivery.
- Preserve pending-edit guards and URL invalidation/revocation on edits/unmount.
- Shared exact-source Blob preparation and safe, bounded HTML filename.
- Verify exported source round-trip with automated tests; attempt actual UI download/reimport in an isolated QA tab, without controlling the user's active native document.

## Acceptance
- Typecheck, all tests and both build bases/budgets pass.
- Both views open/close download tools without canvas reflow; keyboard close/focus works.
- Prepared source preserves scripts, styles, embedded assets and Unicode; no preview bridge or editor annotations are added.
- Staged sidebar edits cannot download stale prepared source; committed edits invalidate the link.
- Record browser-specific on-disk verification separately from Blob and UI tests.

## Non-goals
No cloud upload, file system permission expansion, direct overwrite of original files, sanitized public sharing, schema change, deployment or public push. No new collaboration/AI features. Local build updates retain old chunks and do not refresh active user pages.

## Status
Complete locally. 233 tests and both build configurations/budgets pass. Real picture download/reimport/edit/save/refresh/redownload and font payload download/reimport verified; font decode/browser matrix remains separate. See docs/ACCEPTANCE.md. No push/deployment.
