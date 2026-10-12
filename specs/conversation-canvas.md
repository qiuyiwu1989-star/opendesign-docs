# Conversation canvas prototype — 2026-10-12

Branch: feat/conversation-canvas. Local prototype only; no production deployment.

Purpose: express ideas on an Excalidraw board, prepare selected structured context for an external agent, receive version-bound additive suggestions, accept or discard, then hand selected text to Docs.

The canvas is lazy-loaded. Existing HTML source, document storage, Studio and review are unchanged. Canvas data uses a separate localStorage key. Download .excalidraw for backup; storage failure is visible. Bridge is Vite development-only, loopback-only and rejects foreign browser origins. It stores transient contexts/proposals in memory, scoped by a random per-mount board ID. No automatic model call or public collaboration is claimed.

GET /api/thinking-canvas/context?board=ID reads objects, selection, instruction and revision. POST /proposal?board=ID accepts {id,baseRevision,message,notes:[{id,text,x,y}]}. Browser polls for suggestions. Acceptance verifies the current scene revision, appends notes and creates an undo boundary. Images persist in the browser; context currently sends scene elements, not image binaries. Download visual snapshot is manual. Selection-to-Docs exports escaped text as a separate document, not a layout-faithful PPT conversion.

Acceptance: draw/edit; reload retains scene; submit prompt; external agent reads; posts proposal; user applies and undoes; stale suggestion rejected; selected text opens as independent Docs document; initial bundle budget remains enforced.

Limitations: one local saved board per origin, no conversation history or automatic screenshots, no cross-device sync, no production bridge. Do not advertise a complete realtime AI chat product.

## Observed verification
- 2026-10-12: Chromium browser flow exercised actual text entry, context API read, proposal POST, acceptance, toolbar undo, reload persistence and selected-text handoff to Docs. Single undo directly after acceptance removes added notes; subsequent selection actions may occupy Excalidraw history entries.
- Typecheck/domain-independent build and existing bundle gates passed (initial 424149 bytes; slides closure 488099 bytes). Backup menu is lazy-loaded to preserve the existing budget; budgets were not raised.
- Focused model/loading/backup suite: 23 passed.
- Full suite: 592 tests passed; 12 PostgreSQL suites failed because embedded Postgres cannot load libicudata.77.dylib on this host. These failures prevent claiming full-suite success.
- Installation audit reported 19 dependency findings including inherited dependencies; no production release is intended. Dependency remediation and production bridge design remain release gates.
- GET /api/thinking-canvas/boards discovers in-memory board IDs for the local agent. The agent fetches context and posts a version-bound proposal; no API key is involved in this transport.
