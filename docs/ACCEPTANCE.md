# Acceptance record

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
