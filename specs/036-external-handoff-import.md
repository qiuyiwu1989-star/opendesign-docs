# Spec036 — External HTML handoff

Status: implemented and locally accepted 2026-09-16. Not deployed. See incoming handoff receipt and docs/ACCEPTANCE.md.

## Outcome
DeepBrain or another web application opens `#handoff=v1`, transfers one HTML document using the incoming v1 READY/PAYLOAD/RESULT contract, and receives success only after IndexedDB commits. Docs asks for explicit import confirmation showing the actual origin, normalized filename and UTF-8 size. Documents remain browser-local independent copies.

## Contract
- Only the captured opener can send; reject opaque/non-HTTP(S) origins. Match a fresh nonce, bind the first valid envelope to its origin and consume it before confirmation. Ignore duplicate/mismatched messages.
- READY contains only protocol version and nonce, sent to `*`. Payload/result use exact origins. Source listens before opening a new window synchronously from a click. Handle blocked windows and incompatible COOP without changing security policy.
- Clear the handoff hash once consumed by initialization. Wait at most 15 seconds for payload; stop this timer before confirmation. Refresh does not restart import. Clean up listeners/timers on completion/unmount.
- Share file/transfer content and filename validation: nonempty valid Unicode, <=5 MiB UTF-8, bounded filename with paths/control characters removed and HTML suffix. File decoding additionally uses fatal UTF-8 decoding.
- Reuse the existing unsaved-work guard. Return rejected on cancellation, storage on commit failure. Serialize imports and prevent a delayed completion from discarding newer edits.
- Origin label belongs to the original version; do not migrate/clear schema v3. Optional generator/sourceUrl are untrusted, bounded metadata, not identity and never fetched. v1 does not persist sourceUrl.

## Static chart slice
Support exact-source whole-figure deletion and sibling reordering for a conservative static SVG vocabulary. Preserve inline evidence links; forbid active content, external references, ambiguous markup and identity-bearing deletion. Do not duplicate charts or edit SVG internals. Long documents retain normal flow.

## Gates
Protocol unit tests for success, rejection, wrong source/nonce, duplicates, timeout, invalid and oversized input, storage errors. Real two-origin browser handoff, refresh, sample rendering (five charts/light/dark/anchors), edit/review/save/export/file-chooser reimport and dirty-work rejection. Both builds and existing bundle budgets. Record evidence and remaining limits in acceptance and incoming receipt. Deployment is a separate owner decision.

## Browser finding
Safari could retain an obsolete srcdoc context during rapid review-runtime/channel changes. Keying the preview iframe by its authenticated channel fixed the observed readiness/annotation failure; real Safari review creation then passed. Existing source-span editing and script isolation are unchanged.
