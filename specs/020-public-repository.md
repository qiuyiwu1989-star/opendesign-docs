# 020: Standalone public repository

## Intent
Publish OpenDesign Docs as an independent, runnable public GitHub repository using the existing editor baseline.

## Non-goals
No production deployment, database changes, old Git history, private samples, curated website assets, credential rotation or editor feature expansion.

## Acceptance
- [x] Standalone npm ci, tests, typecheck and both base-path builds pass.
- [x] Only allowlisted app files, public fixtures and reviewed documentation are staged; scan for private paths/credentials.
- [x] Original source license and attribution retained.
- [x] Remote owner/name/visibility/default branch verified; pushed commit matches local snapshot.
- [x] Read-only GitHub CI checked; no deploy workflow or secrets configured.

## Status
Completed on 2026-09-07. Public repository: https://github.com/qiuyiwu1989-star/opendesign-docs. Initial snapshot 85dd53813c26b9c4699585eb5527cd853adf998e matches remote main; CI run 34105351817 passed. Independent product acceptance gaps remain tracked separately.
