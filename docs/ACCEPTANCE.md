# Acceptance record

## Spec022: everyday editing reliability (2026-09-07)

- Final automated gate: 176 tests across 25 files, typecheck, `/docs/` build, domain-root build and whitespace checks pass. Includes backup validation/atomic failure/collision coverage, stale rounded placement acknowledgments, cancellation and review draft retention. No schema migration.
- Public two-page demo at 1440 × 900: actual pointer drag, vertical-only corner resize and repeated arrow/Shift-arrow adjustment exercised. Vertical resize produced scale 1.021; subsequent nudges accumulated correctly. Save and refresh retained the second saved version.
- Real drag → undo uncovered stale iframe rendering: original source was already equal to `renderSource`, so setting it again did not remount. A repaint revision now regenerates the preview channel. Repeated real drag → undo → reselect verified zero offsets and original scale. This specific integration regression has browser evidence, not a new component-level automated test.
- Local review: selection focused input; comment/reply persisted after refresh; resolving while a reply was unsent retained the draft across filtering; reopening restored pending state. Failure/conflict behavior has automated coverage, not newly forced browser-failure coverage.
- Downloaded an actual JSON backup in the native browser from the public demo with one saved version and one synthetic comment. The file was 2,370 bytes and passed format validation. Restored that downloaded file through the in-app file chooser as a suffixed independent copy; its version and comment were present while the original remained in the library. Multi-version/reference remapping and atomic non-overwrite behavior have automated coverage.
- Actual region drag created a second comment; locate was exercised. Region positioning remains version/viewport-dependent: opening the library changes preview width and can correctly produce the existing precision warning. Responsive anchor relocation is not claimed.
- Limits: the in-app browser download event timed out; its download-to-disk path is not certified. Native browser download plus cross-browser import was verified instead. Physical mid-gesture Escape, touch hardware and native OS fullscreen remain separate gates. Checks use a representative public demo, not arbitrary imported HTML.
- Local implementation only. No public push, production deployment, cloud sharing or voice recording in this phase.

## Spec021: content-first presentation (2026-09-07)

- Local tests: 147 across 23 files; typecheck, `/docs/` build and domain-root build pass.
- Browser geometry at 1440 × 900: stage 1440 × 900; 16:9 frame 1440 × 810 centered with 45px top/bottom letterboxing. Toolbar is an absolute overlay, not reserved layout height.
- At 1080 × 1920: frame 1080 × 607.5, centered without crop. Portrait black space is aspect-ratio letterboxing, not a controls footer.
- Confirmed idle class/opacity 0; pointer click wakes it; Tab reveals controls and keeps them visible while focused beyond the idle interval. Shift+Tab reaches exit; Space activates exit; Escape restores editor focus and the current page.
- Browser fullscreen event path hides the redundant fullscreen button. Physical OS fullscreen exit, denied-fullscreen fallback and real touch hover behavior have not been newly certified by this pass. Existing native editor drag/resize and region annotation gates remain separate.
- Imported source, export, data schema and production services were not changed. This iteration is local, not a pushed/deployed release.

## Inherited baseline

The upstream spec019 record reports 144 tests across 22 files, typecheck and builds passing. Browser checks cover local edits, version save/reload, actual HTML download/reimport, isolated presentation keyboard navigation and selection/focus synchronization.

These are inherited records, not fresh standalone browser acceptance. Native pointer drag/resize, region-drag comments and native fullscreen remain open gates. Windowed presentation fallback has been checked upstream. Arbitrary HTML compatibility is not claimed.

## Standalone extraction

Verified on 2026-09-07 with Node 24.16.0: fresh `npm ci`, 144 tests across 22 files, typecheck, `/docs/` build and domain-root build all passed. The 78 staged files passed whitespace checks and a credential/private-path pattern scan; the lockfile uses only registry.npmjs.org. This pattern scan is not a full security audit.

Public remote verified: `qiuyiwu1989-star/opendesign-docs`, visibility public, default branch `main`, license MIT. Unauthenticated repository access returned HTTP 200. Initial snapshot `85dd53813c26b9c4699585eb5527cd853adf998e` matched local and remote. Read-only [CI run 34105351817](https://github.com/qiuyiwu1989-star/opendesign-docs/actions/runs/34105351817) passed. No deployment workflow or secrets were configured by this extraction.

No user documents, source browser databases, private acceptance files or old repository history are distributed. Extraction does not migrate browser storage or change the live site.
