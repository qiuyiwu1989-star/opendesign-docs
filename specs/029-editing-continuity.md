# Spec029 — Quiet controls, predictable editing

## Intent
Continue the agreed local reliability phase: select, edit, move and cancel without surprise, with Keynote-like contextual controls and minimal prose.

## Scope
- Measure the initial drag threshold in iframe viewport coordinates, before converting to page coordinates. Sub-threshold jitter must not create edits at small zoom.
- Ignore editor keyboard shortcuts while IME composition is active in both trusted bridges.
- Escape cancels pending inspector text/style/position edits, without writing source or history; ordinary input and composition remain intact.
- Collapse precise placement/nudge controls by default. Preserve pending inputs while collapsed, expose their pending state, and keep cancellation reachable after reopening.
- Hide unusable placement controls for incompatible objects. Disable arrangement while editing text directly.

## Acceptance
- Automated bridge regressions for jitter, meaningful drag, composition and cancellation; typecheck and both bundle budgets pass.
- Isolated browser QA for direct editing, Escape, staged cancellation, compact placement, real pointer movement and undo.
- Inspect the three supplied decks and course document; record actual save/reload/export evidence separately from parser tests and compatibility limits.
- No original sample modifications, private samples in Git, storage clearing, user-tab refresh, public push or deployment.

## Non-goals
No arbitrary HTML layout conversion, multi-select, snapping, cloud collaboration, voice or Agent generation. Native IME/device/fullscreen acceptance remains separate from simulated event tests.

## Status
Implementation and local automated/source-delivery acceptance complete. 239 tests and both build budgets pass; real VR-deck save/reload/download/reimport passed. Physical-pointer/native IME acceptance remains open because this browser's drag automation produced no confirmed movement. See docs/ACCEPTANCE.md. No public push or deployment.
