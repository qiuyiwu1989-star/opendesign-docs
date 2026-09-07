# Roadmap — proposed sequence

Goal: HTML → direct editing → saved revision → shared review → revision and delivery.

## Current local phase — spec022

User approved defining and executing the next phase in parallel. Goal: dependable everyday editing, not more top-level screens.

| Owner | Now | Acceptance dependency |
| --- | --- | --- |
| Editor agent | Gesture cancellation, stable scaling, rapid keyboard adjustments | Main's browser drag/resize and undo checks |
| Review agent | Compact anchored comments, focus, reply/resolve workflow | Main's version-bound save/reload checks |
| Backup agent | Portable saved versions + comments, restore as new copy | Validated atomic storage and downloaded-file round trip |
| Main | Integration and combined regression | All three agent results; no production changes |

Portable backup moves forward from v0.2 because HTML-only export omits review context and version history. Asset diagnostics remain next; cloud identity, voice and real-time editing stay later. Unfinished input and temporary drafts are explicitly outside this first backup format.

This is one acceptance-driven local iteration, not a calendar release promise. Ship only the tested slice; record physical-device gaps separately. Push and deploy require their own approval.

| Version | Outcome | Gate |
| --- | --- | --- |
| v0.1 Alpha | Reliable local editing | Pointer/fullscreen acceptance plus edit/save/reload/download/reimport |
| v0.2 Beta | Everyday usability | Asset diagnostics, portable project backup; target-user task completion |
| v0.3 Review | Asynchronous cloud collaboration | Verified identity, version-bound comments, conflict detection, revocable permissions |
| v0.4 Voice | Short anchored voice comments | Explicit recording, playback, permission denial and save-failure recovery |
| v1.0 | Stable team delivery | Two complete acceptance rounds, candidate trial, backup and rollback verification |

Versions are targets, not shipped feature claims or deadline promises. Plan 1–2 week iterations around one user outcome, reserve time for independent QA and user trial, and approve deployments separately.

Realtime co-editing, heavy built-in Agents, full PPTX compatibility and whole-session recording are deferred. External generators should integrate through controlled document import/change proposals, not overwrite human revisions.
