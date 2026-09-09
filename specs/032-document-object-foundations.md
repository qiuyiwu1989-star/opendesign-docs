# Spec032 — Long-document object foundations

Continue the approved local foundations scope. Production stays frozen; no GitHub push or deployment.

## Non-goals

- No free-position canvas, multi-selection, snapping or group transforms in long-document mode.
- No arbitrary DOM reparenting, script execution, remote asset fetch, cloud collaboration or schema change.
- The Moveable/Selecto experiment is not a production dependency decision.

## Delivered behavior

- Compact contextual object tools load only in edit mode. Select on the page or choose an enclosing block from the list.
- Reuse `object-edit` for formatting, guarded clone/delete and validated local image replacement through an optional object catalog. No document wrapping, schema migration or new editor model.
- Insert text or local PNG/JPEG/WebP after a valid block. Move complete siblings in document flow, preserving separators and references. Do not convert long documents into absolute-position canvases.
- IDs and references can move intact, but cannot be duplicated/deleted by guarded actions. Scripted/malformed structures, foreign namespaces, unsupported parents, direct text and comments remain explicit boundaries. The list covers up to 400 supported objects; text editing is separate.
- Keep pending-edit guards, source checks, undo/redo, drafts, versions and export separation. Invalidate late image completion on source/selection/mode change or unmount. Rebuild source-offset selection after direct text edits; preserve scroll. Preview metadata never enters source exports.

## Bounded dependency experiment

`npm run lab:gestures` builds into a new temporary directory. `experiments/gestures` imports development-only Moveable 0.53.0 and Selecto 1.26.3, bundled inside an opaque-origin sandbox. The authenticated parent bridge uses our placement source patcher. These packages are not imported by the production app. A generated public PNG fixture exercises real browser decoding.

Observed: Selecto click selection, Moveable request events, retained original rotation, source writeback and saved-source restoration. Scaling reported 1.096; a subsequent requested rightward 10px movement on the scaled/rotated target wrote 9.1px. This exposes a coordinate-contract mismatch requiring reconciliation with our CSS individual translate/scale. Automated mouse drag produced no confirmed move. **Do not replace the production gesture engine yet.** No touch, group or native-pointer acceptance claim.

References: [Moveable](https://github.com/daybrush/moveable), [Selecto](https://github.com/daybrush/selecto), [Bento manifest](https://github.com/nyblnet/bento/blob/01000838496ec863ba1035eae12a8a4943020cdc/slides/package.json). This is package reuse, not migration of Bento Store or its entire editor.

## Gates

Source/markup/reference/stale/size/history tests; typecheck including experiments; full regression; both base-path builds and unchanged budgets. Real import/edit/insert/move/save/reload/image decode/replace/download/byte comparison/reimport. Native and cross-browser gates are recorded independently.

## Status

Implemented locally. The non-modal delete/undo/save/refresh/download browser path is closed by spec033. Download reimport and any gesture-engine migration remain separate follow-ups.
