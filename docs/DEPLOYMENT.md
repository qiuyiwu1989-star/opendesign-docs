# Production alpha — 2026-09-08

URL: https://doc.opendesign.cc/

User explicitly requested deploying the current version. Delivered source: `9820591`, activated 2026-09-08T05:44:52Z. This is a usable alpha, not completion of the broader v0.1 browser/device acceptance matrix. Keep it stable during the user's trial. No GitHub push was performed.

## Release and rollback

Static root build only; no backend or shared-service restart. Existing nginx configuration, CSP and certificate were retained. Release archive SHA256: `8ecdf214da7bb5ff20942c17fd17ff802dd35511f5ae06163e28c2b14e28c58b`. Every deployed entry/asset matched the locally built bytes.

The release uses the existing atomic `current` symlink convention. Release label: `20260908-9820591`. Legacy hashed assets remain available for already-open clients. The preceding activation and original v1 release were retained.

Prepared rollback label: `20260908-f98750c-ready-rollback`, based on `f98750c` plus the same authenticated readiness-handshake fix. Archive SHA256: `2145f6dec1d8eceb7f3855845c2a303555c8ac9befd668d5baaca179f5e32ae8`. Its tests/typecheck/build pass, but a live browser rollback drill was not performed.

Do not roll back to the original v1 application after a browser has upgraded its local database. Use the prepared schema-v3-compatible build. For an authorized rollback, resolve and validate the prepared rollback symlink on the host, create a separate temporary current link, then atomically replace current; never delete releases or clear browser storage. Recheck assets and actual edit/save/reload/download behavior afterward.

## User data and migration

Documents, drafts, versions and annotations remain in IndexedDB in the current browser and origin. They are not uploaded or synchronized. Localhost documents do not automatically appear on the public domain. Use the old page's Backup and Restore flow to export a project backup, then import it on the public domain. Export HTML alone does not include version history and comments. Do not clear browser data before making backups.

## Acceptance and limits

See ACCEPTANCE.md, spec030: native edit, applied text, formal version save, refresh persistence and actual downloaded HTML passed. Initial deployment QA found and fixed a frame readiness race; HTTP 200 alone did not suffice. 240 tests pass; entry and slides JS closures remain under 450,000 and 490,000 bytes.

Physical drag/resize after the recent threshold change, native IME, touch, broader browser coverage and full production presentation navigation remain separate gates. Source/asset compatibility is conservative, not support for arbitrary scripted HTML. Native QA stopped when the user switched to unrelated browser work; no user tab was closed or refreshed. The synthetic example record and its verified download were retained.

HTTPS was valid at deployment (certificate expiry 2026-12-05); this release did not reconfigure or certify automatic renewal. Health and access-log checks were bounded deployment checks, not a scheduled monitor.
