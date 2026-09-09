# Spec034 — Delivery and long-document performance baseline

Continue the local reliability phase. Production and GitHub stay unchanged.

## Goal

Close the remaining download/reimport evidence where the real browser permits it, and make large-document editing cost measurable before adding more controls.

## Delivered scope

- Share one immutable, last-source parse snapshot across the contextual long-document catalog, object capability checks and source-style inspection. Source mutation still creates a new parse snapshot; preview and base reading paths keep their existing parsers so the editor-only cache stays out of the reading closure.
- Add a reproducible synthetic benchmark for 100 objects, 400 objects and a near-5-MiB / 400-object HTML document. Record cold catalog and warm selected-object operations separately.
- Keep the 400-object and 5-MiB safety ceilings. The benchmark is a development gate, not a claim about arbitrary documents or end-user hardware.
- Complete browser download/reimport and the isolated Moveable/Selecto save/reload matrix only with actual UI evidence. Report unavailable native chooser/pointer paths as open rather than substituting source tests.

## Acceptance

- `npm run benchmark:long` checks object counts, near-limit byte size, one-source cache reuse and a conservative warm-interaction ceiling.
- Full tests, typecheck, both base-path builds and unchanged bundle budgets pass.
- Production dependencies and IndexedDB schema remain unchanged.
- Real browser evidence explicitly distinguishes source-file inspection, chooser import, programmatic gesture requests and native pointer gestures.

## Non-goals

- No production Moveable/Selecto integration, multi-selection, snapping or arbitrary long-document free placement.
- No performance percentage promise, remote telemetry, cloud data, schema change, GitHub push or deployment.

## Status

Implemented locally. Performance and request-driven gesture persistence gates pass. Chooser-driven downloaded-file reimport requires an explicitly authorized browser upload; native pointer drag/resize remains open.
