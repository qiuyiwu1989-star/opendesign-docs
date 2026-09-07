# Tasks

## Now
- Spec026 loading optimization ready for trial. Actual repaired-HTML download/reimport acceptance remains open; no public push or deployment.

## Next
- [ ] Extend representative pointer/region checks to touch devices, physical mid-gesture cancellation and native fullscreen.
- [ ] Close v0.1 reliability gaps before adding snapping or multi-selection.
- [ ] Resume actual repaired-HTML download/reimport acceptance when a downloaded file is available or the native browser is free for testing; do not treat prepared Blob links as delivered files.
- [ ] Complex backgrounds and broader WOFF1, variable/CJK font and nested-CSS compatibility need representative acceptance before expansion. Static picture unification is now covered; preserving multiple responsive candidates is not.
- [ ] Define cloud review identity, version anchors and revocable sharing before implementation.

## Done
- Spec026 loading slice: slide editing and resource tools load on demand, with concise loading/error/retry states. Resource checks mount on first expansion and stay mounted when collapsed. Static entry closure 439,623 bytes (12.2% below spec025); slide closure 484,024 bytes. Build budgets count transitive imports, not only the entry filename. 228 tests and both builds pass; built-app repair/save/reload/view-switch checks passed. Download acceptance is separately open.
- Spec025: one compact grouped picture diagnostic, explicit unification/cancel, source-span replacement with candidate removal, layout attributes preserved, conservative malformed/scripted rejection, async version/context guard and keyboard focus return. Real replacement in both views, undo/redo, save/refresh and read-only original review verified. 224 tests / 29 files and both builds pass. Local only.
- Spec024: local WOFF/WOFF2 repair for recognizable inline font-face declarations, with rights acknowledgment, bounded header checks and browser decode. Exact src replacement preserves descriptors, versions and backups. Real WOFF2 ready → undo not-ready → redo/save/refresh ready verified; long-document rendering and old-version read-only controls checked. No remote fetching or font redistribution in the repository.
- Spec023: compact static resource diagnostics, local IMG replacement and shared narrow CSS-image syntax repair; preserve source/undo/drafts/versions. Actual PNG replacement in both views, slide undo/redo, save/refresh and original-version read-only behavior verified. Fixed refresh choosing the first database row instead of the current per-tab document. 188 tests plus both builds pass. Local only.
- Spec022: three parallel tracks delivered gesture fixes, concise review and portable saved-version/comment backups. 176 tests, typecheck and both builds pass. Real drag, vertical resize, undo, review refresh and downloaded JSON cross-browser restore verified. Fixed stale iframe repaint after undo. Local only.
- Spec021: content-first full-viewport presentation, compact idle-hiding controls, keyboard focus/Space fixes. 147 tests and both builds pass; browser geometry, idle/wake, keyboard navigation and return-to-editor verified. Local only; not pushed or deployed.
- Standalone public repository published under MIT (spec020): fresh install, 144 tests, typecheck and both builds pass; initial remote commit and read-only CI run 34105351817 verified.
- Upstream editor baseline: local editing, drafts, versions, page workflow, isolated presentation and selection/focus fixes (upstream 8213e82; 144 tests recorded).

## Blocked / limits
- Resource inspection is static and partial, not a decode/network success report. Font import covers explicit top-level inline declarations; picture repair covers conservative static unification only. Complex CSS, scripted pictures and responsive art-direction preservation remain excluded. Delayed-result guards have unit coverage; no forced browser race or WOFF1 real-file acceptance yet.
- Spec026: in-app HTML download click/media-download action did not yield a confirmed file in Downloads. Native file chooser could not be driven in this pass; the native window then changed to the user's course document, so interaction stopped. No repaired-HTML on-disk or reimport claim. Prior native JSON backup acceptance remains valid, not a substitute for this HTML gate.
- Deferred loading failure callback has automated coverage; a real failed-network chunk/retry was not fault-injected. Bundle reduction is not a page-speed percentage. Preview at localhost:5181 is a local build, not deployment; leave it running while the user has a document there.
- Region annotations retain their original version/viewport; changed layout width may prevent precise positioning and produces a warning.
- No cloud sharing, voice annotation or production deployment in this snapshot.
