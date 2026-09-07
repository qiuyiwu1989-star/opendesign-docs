# Tasks

## Now
- No active implementation. Next cycle: native editor interaction acceptance.

## Next
- [ ] Complete native pointer drag/resize, region annotation and fullscreen acceptance.
- [ ] Close v0.1 reliability gaps before adding snapping or multi-selection.
- [ ] Confirm v0.2 scope: asset diagnostics and portable project backup.
- [ ] Define cloud review identity, version anchors and revocable sharing before implementation.

## Done
- Spec021: content-first full-viewport presentation, compact idle-hiding controls, keyboard focus/Space fixes. 147 tests and both builds pass; browser geometry, idle/wake, keyboard navigation and return-to-editor verified. Local only; not pushed or deployed.
- Standalone public repository published under MIT (spec020): fresh install, 144 tests, typecheck and both builds pass; initial remote commit and read-only CI run 34105351817 verified.
- Upstream editor baseline: local editing, drafts, versions, page workflow, isolated presentation and selection/focus fixes (upstream 8213e82; 144 tests recorded).

## Blocked / limits
- Native pointer tools previously could not operate the browser window; gesture unit tests do not close this gate.
- No cloud sharing, voice annotation or production deployment in this snapshot.
