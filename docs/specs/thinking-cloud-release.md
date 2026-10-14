# Canvas cloud persistence candidate — 2026-10-14

Status: implemented and locally verified; NOT deployed. Production URL remains the previous release.

## Scope

Single configured owner account, manual save/open across computers. Workspace includes pages, drawings, images, discussions and project metadata. Independent Docs documents are not synchronized. Presentation versions have authenticated server storage. This is not realtime collaboration or automatic conflict merging.

- Local IndexedDB save remains active.
- Opening cloud data first persists pending local edits and atomically backs up the prior library under `before-cloud-load`; the File menu can restore it.
- Cloud saves compare the loaded revision. A stale writer receives 409 and retains local edits.
- Dedicated service data directory, atomic writes, immutable history, and exclusive process lock.
- HTTPS host-only session cookie, exact Origin checks, login throttling, no anonymous workspace reads.
- Production Agent handoff downloads page JSON and copies instructions. Local development context URLs are not exposed anonymously online.

## Evidence

- TypeScript check passed.
- 30 targeted tests across 11 canvas/cloud test files passed.
- Two independent browsers at isolated localhost port 5196: first save, second-browser login/load/save, then first-browser stale save visibly rejected while preserving its local data.
- Tested only synthetic empty workspaces; user artwork was not uploaded.
- Full repository baseline has unrelated failures, including embedded PostgreSQL requiring missing ICU 77. Do not claim the full suite passes.

## Deployment blocker

GitHub branch push is available. Repository CI has no existing cloud deployment workflow. Existing OrcaTerm sessions are disconnected; reconnect requires the account's WeChat MFA. Other open OrcaTerm has no connected session; VNC is disconnected. Direct SSH authentication previously failed. No new credentials or broader access were created.

Existing intended host: doc.opendesign.cc, server 146.56.239.22. Historic static root: /var/www/doc.opendesign.cc/current; must verify live before changes.

## Release after authenticated deployment access is available

1. Build static frontend for the domain root (`vite build --base=/`) and the bundled cloud service (`tsx scripts/build-thinking-cloud.ts`) with Node 24.
2. Verify live Nginx host and existing service routes, snapshot configs and current release symlink.
3. Install cloud bundle with a dedicated unprivileged systemd service and private writable data directory. Configure owner credentials outside Git; see services/thinking-cloud/README.md. Reuse the HTTPS host with the supplied Nginx route example.
4. Validate Nginx configuration before reload. Keep old release available for rollback.
5. Verify HTTPS login, anonymous request rejection, two-browser save/load/conflict, restart persistence, and backup restore on production with a disposable account/workspace before migrating user data.
6. Publish the actual verified URL only after these checks. GitHub Pages alone cannot run the cloud service.

Rollback: restore previous static symlink and Nginx config, stop the new service, validate/reload Nginx. Preserve the data directory and history; never remove cloud data during rollback.
