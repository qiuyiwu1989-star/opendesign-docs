# 025: Explicit responsive image repair

## Intent
Continue local resource repair without expanding the editor chrome. A supported static picture can be deliberately unified to one validated embedded bitmap in both editor views.

## Boundaries
- Only explicit, well-formed HTML picture wrappers with direct source children followed by exactly one img. Reject duplicate attributes, event handlers, ambiguous nesting and other child elements.
- Show one grouped diagnostic. Choosing repair reveals an inline acknowledgment: all screen sizes will use the same image. Do not apply automatically.
- Remove plain source candidate elements and the img src/srcset spans; embed the selected bitmap in img src. Keep picture wrapper, img dimensions/styles/alt, comments and unrelated bytes. Reject source elements with identity, event or non-image-selection attributes. Candidate-specific dimensions/crops no longer apply, so layout must be reviewed.
- Reuse validated local PNG/JPEG/WebP import, final 5 MiB limit, async context guard and existing history/version routes. No network fetch, script execution or full-tree serialization.

## Non-goals
Preserving art direction or multiple candidate densities after unification; arbitrary CSS background repair; dynamic picture templates; cloud, deployment or public push. Existing single-background slide-object replacement stays unchanged.

## Acceptance
- [x] Conservative targeting, duplicate/malformed/inert rejection, exact spans, validation and size tests.
- [x] Confirmation/cancel and original-review read-only behavior checked in browser. Source/context/epoch/disabled late-result guards tested; no forced browser race.
- [x] Real chooser in both views, decoded preview, undo/redo, save/refresh and original-version preservation in browser.
- [x] Exact saved-source/backup round trip in tests, all 224 tests and both builds. New repaired HTML download/reimport remains a separate gate.

## Status
Local implementation ready for trial. No public push or deployment. See docs/ACCEPTANCE.md for remaining gates.

Reference: [HTML picture/source semantics](https://html.spec.whatwg.org/multipage/embedded-content.html#the-picture-element). Removing candidates is explicit; do not leave invalid source elements without required srcset.
