# Decisions

- 2026-09-07: User authorized planning and parallel implementation of the next development phase. Spec022 concentrates on everyday local editing: gesture correctness, concise review, and portable saved-version/comment backups. Main integration adds forced iframe revision on repaint so undo cannot leave stale visuals. These are implementation choices within that scope, not authorization for deployment or public push. Cloud, voice and AI remain deferred.
- 2026-09-07: Project JSON backup is distinct from HTML export: retain saved versions and their comments, exclude temporary drafts/unsent input, validate limits and references, restore atomically under fresh IDs as a named copy. Preserve the original document and existing database schema.

- 2026-09-07: User requested presentation prioritize original content over a large bottom control area. Use proportional full-viewport fitting and a compact floating toolbar; hide it after 2.2 seconds idle while keeping keyboard-focused controls available. Do not crop or rewrite slide content (spec021).

- 2026-09-07: User authorized an independent public GitHub repository following the OpenDesign Docs proposal. Keep OpenDesign branding, extract the existing app without old repository history, preserve MIT source attribution, and do not deploy or change production. Reason: separate contribution and release boundaries without rewriting the editor. Independent repository is the forward development target; legacy checkout remains intact during handoff.
