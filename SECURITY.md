# Security boundaries

This is a local-first alpha, not a hardened public HTML hosting service.

- Treat imported HTML as untrusted. Imported scripts and external assets do not execute/load in the isolated preview.
- Export deliberately preserves original source, including scripts and links. Never serve arbitrary exported HTML on an authenticated application origin.
- Local comments have display names, not verified identities. There are no cloud access-control guarantees in this version.
- Do not include private documents, tokens or production logs in public issues. Report a minimal synthetic reproduction. For confidential issues use GitHub private vulnerability reporting if enabled; otherwise contact the repository owner without posting sensitive details publicly.
- Release gates include real browser pointer/fullscreen checks, data persistence and security regression tests. Passing CI alone does not prove arbitrary HTML compatibility.
