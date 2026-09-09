# Spec033 — Inspector fidelity and delivery closure

Continue the approved local editing foundations. Production and GitHub remain unchanged.

## Goal

Make the compact long-document inspector tell the truth about the selected object, and close the destructive-action path without adding modal chrome.

## Delivered behavior

- Read literal inline text size, color, weight and alignment from the currently selected safe object. A different selected object must not inherit the previous object's control values.
- Show `未指定` or `混合` when the source does not contain one supported literal value. Do not present a browser default or inferred stylesheet value as source truth.
- Keep style reading source-only and conservative: no computed CSS, stylesheet cascade, relative-unit resolution, CSS variable evaluation or DOM serialization.
- Delete a guarded independent block directly, with existing undo/redo, saved-version and exact-source export behavior. No blocking confirmation dialog; the action remains reversible before save and historical versions remain immutable.
- Keep the Moveable/Selecto coordinate investigation isolated under `experiments/`; no production gesture-engine migration in this version.

## Gates

- Source-level tests cover supported literals, mixed text runs, declaration order, `!important`, shorthand ambiguity, malformed styles and stale/forged objects.
- Real browser verifies delete, undo, save, refresh and on-disk exact-source download. Download reimport remains a separate UI gate unless the chooser is actually completed.
- Full regression, typecheck, both base-path builds and existing bundle budgets pass. Production dependencies remain unchanged.

## Non-goals

- No computed-style inspector, rich-text range formatting, arbitrary DOM editing or long-document free placement.
- No deployment, GitHub push, cloud sharing, permissions, voice comments or schema migration.
