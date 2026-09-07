# Acceptance record

## Inherited baseline

The upstream spec019 record reports 144 tests across 22 files, typecheck and builds passing. Browser checks cover local edits, version save/reload, actual HTML download/reimport, isolated presentation keyboard navigation and selection/focus synchronization.

These are inherited records, not fresh standalone browser acceptance. Native pointer drag/resize, region-drag comments and native fullscreen remain open gates. Windowed presentation fallback has been checked upstream. Arbitrary HTML compatibility is not claimed.

## Standalone extraction

Verified on 2026-09-07 with Node 24.16.0: fresh `npm ci`, 144 tests across 22 files, typecheck, `/docs/` build and domain-root build all passed. The 78 staged files passed whitespace checks and a credential/private-path pattern scan; the lockfile uses only registry.npmjs.org. This pattern scan is not a full security audit.

Public remote verified: `qiuyiwu1989-star/opendesign-docs`, visibility public, default branch `main`, license MIT. Unauthenticated repository access returned HTTP 200. Initial snapshot `85dd53813c26b9c4699585eb5527cd853adf998e` matched local and remote. Read-only [CI run 34105351817](https://github.com/qiuyiwu1989-star/opendesign-docs/actions/runs/34105351817) passed. No deployment workflow or secrets were configured by this extraction.

No user documents, source browser databases, private acceptance files or old repository history are distributed. Extraction does not migrate browser storage or change the live site.
