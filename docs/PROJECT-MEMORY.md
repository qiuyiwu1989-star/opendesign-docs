# OpenDesign Docs project memory

- Last confirmed: 2026-09-10
- Confirmed by: project owner
- Repository: https://github.com/qiuyiwu1989-star/opendesign-docs
- Production: https://doc.opendesign.cc/

## Read this first

OpenDesign Docs is an independent, open-source, local-first HTML document container. It imports existing HTML without flattening its visual expression, then supports human editing, immutable versions, review and delivery in two views:

- **Long document:** preserve normal document flow and readable reflow.
- **Presentation:** provide a bounded free canvas and presentation controls.

Library supplies design references, Studio generates material, and Docs is the human editing, review and delivery surface. Docs does not require an Agent backend.

## Confirmed current state

- Git `main` and `origin/main`: `438f7c3`.
- Production release: `20260910-438f7c3`.
- GitHub CI run `34442209094`: passed.
- Verified release suite: 275 tests across 39 files, typecheck, domain build, bundle budgets and production dependency audit.
- Production root and `/healthz` returned HTTP 200 after activation.
- Production browser acceptance covered direct text edit, version save, reload recovery and local review comment creation. Sequential review labels and marker-to-anchor navigation also have browser evidence.
- Documents, versions and comments remain in browser IndexedDB. They are not cloud-synchronized.

## Delivered capability

- Layout-preserving HTML import and sandboxed preview.
- Direct text editing with mixed-format preservation.
- Long-document object selection, truthful supported-style readback, safe sibling reorder, reversible deletion and image operations.
- Presentation text/image insertion, movement, scaling, duplication, deletion, page operations and proportional presentation mode.
- Undo/redo, local drafts, immutable saved versions and refresh recovery.
- Exact-source HTML export plus portable project backup/restore for saved versions and comments.
- Version-bound text and region comments, replies, resolution, persistent numbered markers and standalone read-only review export.
- Static image/font diagnostics and conservative local PNG/JPEG/WebP and WOFF/WOFF2 repair.
- Lazy editor/resource loading, enforced bundle budgets and cached long-document source inspection with a reproducible near-5-MiB benchmark.
- Compact, content-first controls informed by Keynote interaction density.

## Decisions that should survive handoff

1. Preserve HTML source and visual expression; prefer precise source-span edits over whole-document serialization.
2. Keep long documents in normal flow. Free placement belongs to presentation pages, not arbitrary articles.
3. Keep reading, editing and review as explicit modes. Show contextual tools only when relevant.
4. Use Keynote as a hierarchy and density reference, never as an icon or asset source.
5. Reuse open-source capabilities selectively. The review marker layer adapts Bento code with MIT attribution; Moveable and Selecto stay experimental until coordinate and native-pointer gates pass.
6. Treat drafts, saved versions, exported HTML and project backups as different artifacts.
7. Do not infer delivery from routes, screenshots, buttons or tests alone. Acceptance follows the real user loop.
8. Define identity, permissions, version anchors, revocable sharing, retention and consent before cloud or voice comments.

## Lessons

- A page rendering or returning HTTP 200 proves availability, not editing correctness.
- A complete delivery check is: import → edit → save → reload → review → export/download → reimport → compare data.
- Review wayfinding is one interaction: marker number, visible source highlight and matching inspector thread must stay synchronized.
- Resource inspection is static and conservative. A blocked preview resource is not automatically a broken network URL.
- Large-document performance should be measured with cold and warm paths; bundle size is not a page-speed percentage.
- Real user samples are required before claiming broad HTML or PPT compatibility.

## Current risks and open gates

- The editability boundary is not yet complete for complex CSS, SVG subtrees, scripted components, transformed objects and responsive art direction.
- Native pointer drag/resize, Chinese IME, touch, native fullscreen and a broader browser matrix remain incomplete.
- WOFF1, variable/CJK font and complex background coverage need representative fixtures.
- Chooser-driven round trips should be repeated with the latest exported deletion/review artifacts.
- Local browser storage needs explicit backup before changing origin, port or browser.
- Cloud sharing, verified identity, realtime collaboration and voice comments are not implemented.
- `docs/DEPLOYMENT.md` and some historical status text still describe the previous `9820591` release and must be reconciled with the current production release.

## Next execution order

1. Reconcile release, task and acceptance documentation with `438f7c3`.
2. Run one production round trip with a real long document, a complex visual document and a presentation HTML.
3. Publish an `object type × edit operation × supported state × failure message` matrix, then close common editability gaps.
4. Finish native pointer/zoom, IME, touch, fullscreen, browser and font acceptance.
5. Only then write the cloud-collaboration ADR; do not begin with backend implementation.

## Acceptance target for the next milestone

A user can import their own representative HTML on production, edit the intended text and objects without losing its design, save and restore a version, create and locate a review comment, export the selected result, reimport it and recover the same content. Unsupported operations are visible and understandable rather than silently ignored.

## Maintenance rule

Update this document only for confirmed project-level changes. Put detailed evidence in [ACCEPTANCE.md](ACCEPTANCE.md), delivery mechanics in [DEPLOYMENT.md](DEPLOYMENT.md), active work in [TASKS.md](../TASKS.md), and durable rationale in [DECISIONS.md](../DECISIONS.md). Replace stale current-state statements instead of appending contradictory snapshots.
