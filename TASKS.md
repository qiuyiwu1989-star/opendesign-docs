# Tasks

## Now
- Spec022 local implementation and scoped acceptance complete; ready for user trial. Push/deployment are separate approvals.

## Next
- [ ] Extend representative pointer/region checks to touch devices, physical mid-gesture cancellation and native fullscreen.
- [ ] Close v0.1 reliability gaps before adding snapping or multi-selection.
- [ ] Define the next asset-diagnostics slice: explain missing fonts/images without executing imported scripts or silently fetching external resources.
- [ ] Define cloud review identity, version anchors and revocable sharing before implementation.

## Done
- Spec022: three parallel tracks delivered gesture fixes, concise review and portable saved-version/comment backups. 176 tests, typecheck and both builds pass. Real drag, vertical resize, undo, review refresh and downloaded JSON cross-browser restore verified. Fixed stale iframe repaint after undo. Local only.
- Spec021: content-first full-viewport presentation, compact idle-hiding controls, keyboard focus/Space fixes. 147 tests and both builds pass; browser geometry, idle/wake, keyboard navigation and return-to-editor verified. Local only; not pushed or deployed.
- Standalone public repository published under MIT (spec020): fresh install, 144 tests, typecheck and both builds pass; initial remote commit and read-only CI run 34105351817 verified.
- Upstream editor baseline: local editing, drafts, versions, page workflow, isolated presentation and selection/focus fixes (upstream 8213e82; 144 tests recorded).

## Blocked / limits
- In-app-browser download event did not complete; actual JSON download was verified in a native browser and restored through the in-app browser. In-app download compatibility remains unverified.
- Region annotations retain their original version/viewport; changed layout width may prevent precise positioning and produces a warning.
- No cloud sharing, voice annotation or production deployment in this snapshot.
