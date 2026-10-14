# Private, single-owner canvas sync

Node 24 built-ins. One configured owner account; all workspace and version routes require authentication. This is private cross-computer persistence, not public sharing or concurrent collaborative merging. Use a single service process against a dedicated data directory. The UI must explicitly let the user upload local work or open the saved workspace; never silently replace a nonempty local workspace.

## Configuration

Root-owned `/etc/opendesign-thinking.env` (mode 0600, excluded from source):

```ini
THINKING_CLOUD_ORIGIN=https://your-domain.example
THINKING_CLOUD_USERNAME=your-login
THINKING_CLOUD_PASSWORD_HASH=scrypt$YOUR_SALT$YOUR_HASH
THINKING_CLOUD_DATA_DIR=/var/lib/opendesign-thinking
THINKING_CLOUD_PORT=5206
```

Generate the hash locally without a password in shell history (Bash):

```bash
read -r -s -p 'New password (14+ characters): ' canvas_password
printf '%s' "$canvas_password" | node_modules/.bin/tsx services/thinking-cloud/password.ts
unset canvas_password
```

Place only the generated hash in the environment file. No actual password or hash is supplied in this repository. Create the unprivileged service account and the data directory owned by it. Build the bundled server, install the example systemd unit, and add the Nginx routes inside the existing HTTPS host. The account password is separate from existing site accounts. Credentials are not accepted over cross-origin mutation requests. Cookies are Secure, HttpOnly, SameSite=Strict and host-only. Restart invalidates sessions; the data persists.

## Protocol

- `GET /api/thinking-cloud/session`: `{authenticated,username?}`
- `POST /api/thinking-cloud/login`: `{username,password}`, sets session cookie
- `POST /api/thinking-cloud/logout`: clears and revokes session
- `GET /api/thinking-cloud/workspace`: `{revision,library,updatedAt?}`; null revision/library for an empty account
- `PUT /api/thinking-cloud/workspace`: `{expectedRevision,library}`; returns stored envelope. HTTP 409 means another computer saved; user must reload/reconcile rather than retry with a new revision blindly.
- Authenticated existing `/api/thinking-canvas/versions` GET/POST is supported. Development context sharing is not enabled; localhost links do not work for remote Agents.

Mutations require `Origin` matching the configured origin exactly. Requests and responses are `no-store`. Max workspace body 120,000,000 bytes. Each save retains an immutable full JSON history revision, then atomically replaces and fsyncs the current workspace. Disk failure returns 500 and never acknowledges an unsaved update. In-process serialization enforces compare-and-swap. A SQLite exclusive writer lock rejects a second process using the same data directory; normal close or process termination releases it. **Run one service instance per data directory.** Back up the entire data directory independently; history has no automatic pruning and needs disk monitoring. This service does not synchronize Docs document content, only the canvas workspace and its metadata plus explicitly saved presentation versions.

Test: `node_modules/.bin/vitest run services/thinking-cloud/server.test.ts --maxWorkers=1`.
