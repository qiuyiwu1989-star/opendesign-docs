# 020: Standalone public repository

## Intent
Publish OpenDesign Docs as an independent, runnable public GitHub repository using the existing editor baseline.

## Non-goals
No production deployment, database changes, old Git history, private samples, curated website assets, credential rotation or editor feature expansion.

## Acceptance
- [x] Standalone npm ci, tests, typecheck and both base-path builds pass.
- [x] Only allowlisted app files, public fixtures and reviewed documentation are staged; scan for private paths/credentials.
- [x] Original source license and attribution retained.
- [ ] Remote owner/name/visibility/default branch verified; pushed commit matches local snapshot.
- [ ] Read-only GitHub CI checked; no deploy workflow or secrets configured.

## Status
Approved by user's explicit request to create a public GitHub repository; execution in progress.
