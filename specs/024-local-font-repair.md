# 024: Local font repair

## Intent
Continue the agreed local-font phase. In the existing resource panel, replace an explicit inline @font-face source with a local WOFF/WOFF2. Preserve family, weight, style and surrounding source rather than restyling the document.

## Scope and boundaries
- Conservative source-span detection of top-level @font-face blocks in inline STYLE elements only. Ambiguous/escaped/nested/duplicate declarations are not edited.
- Require explicit embedding-rights confirmation. A checkbox is user acknowledgment, not an automated license check.
- Verify font signature/header limits, reject collections, and decode with browser FontFace before applying. Limit file to 2 MiB, declared expanded font size to 12 MiB, final HTML to 5 MiB; browser validation is not a complete independent font-security audit.
- Embed bytes into that face's src only, preserving other descriptors. Do not install fonts into the OS or globally add them to the application document.
- Guard async completion against source/context/read-only changes. Existing undo, draft, saved-version, export and backup routes retain the exact embedded HTML.

## Non-goals
No remote fetch, font discovery, TTF/OTF conversion, collections, automatic whole-document font switching, glyph coverage guarantees, arbitrary CSS rewriting, bundled third-party font redistribution, cloud features, deployment or push.

## Acceptance
- [x] Tests for conservative spans, exact source preservation, invalid/truncated/mismatched/oversize fonts, browser decode rejection and stale results.
- [x] Explicit local chooser and license acknowledgment; no repair in review mode or with pending edits.
- [x] Real local WOFF2 decoding in preview, undo/redo, saved version and refresh checked; no claim based solely on tests. WOFF1 real-file browser acceptance remains open.
- [x] All tests, typecheck and both builds pass. Remaining compatibility gaps are recorded in docs/ACCEPTANCE.md.

## Status
Local implementation complete under user continuation of the proposed local font work. No push or deployment. See acceptance record for evidence and boundaries.
