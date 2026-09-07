# Spec027 — Content-first resource tools

## Intent
The user reports that the reading/status strip and full-width collapsed resource panel waste canvas space. Keep auxiliary tools available without reserving document height, using concise Keynote-like progressive disclosure.

## Scope
- Shared toolbar resource entry in long-document and slide views; bounded, theme-aware native auto popover, no canvas reflow.
- Remove redundant long-document mode/count row. Preserve review version/local-only status near the document title; editing help/count in the edit control tooltip.
- Keep resource repair, lazy loading, mounted inputs after dismissal, async guards and all source/version behavior unchanged.
- Escape, outside-click and explicit close; keyboard-accessible trigger and focus return. Fit narrow viewports and reposition on resize.

## Acceptance
- Collapsed tools do not mount the diagnostic body and take no separate row.
- Opening/closing tools leaves the canvas rectangle unchanged in both views.
- Escape and close return focus; inputs survive closing/reopening; review repair remains disabled.
- Popup fits the viewport; use application surface/text tokens, no hard white strip.
- Unit tests, typecheck, both build configurations/bundle budgets and real browser checks.

## Boundaries
Local only: no deployment, public push, storage reset or automatic refresh of the user's active document. Preserve old hashed assets when updating the running built preview. Actual repaired-HTML download/reimport and touch coverage remain separate open gates.

## Implementation reference
Use the browser's auto-popover top layer for light dismissal and keyboard behavior: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using . Modern Popover API browsers are required; older browser fallback is not added in this slice.
