# Bounded coordinate experiment (spec032)

Development only. This is not the production editor and not an approved gesture migration.

## Coordinate contract

- Moveable 0.53.0 uses react-moveable 0.56.0. Its `Draggable` computes `beforeDist` with `getBeforeDragDist` / `inverseBeforeMatrix` (`node_modules/react-moveable/src/gesto/GestoUtils.ts`). CSS individual transforms enter that matrix (`utils/getMatrixStackInfo.ts`).
- Consequently `beforeDist` is **not** a CSS individual `translate` delta. With individual scale 1.096, a 10px request yields about 9.124 in before-matrix coordinates. This adapter multiplies by the **gesture-start** individual uniform scale, giving 10 CSS document pixels.
- Existing rotation remains in the original `transform` property. Do not rotate that delta again: this matrix insertion point is before legacy transform, not the target's fully rotated local axes.
- Scaling uses the requested absolute scale and independently compensates translation to preserve the opposite fixed corner, using the original 2D matrix and transform origin. It does not mix `scale.drag.beforeDist` into CSS individual translation.
- Outer iframe 50/75/100% CSS display zoom is not multiplied into source distances: iframe events/requests use document CSS pixels. Ten document pixels display as 5/7.5/10 outer pixels, respectively.
- Source patch acceptance still rounds translation to 0.1px and scale to 0.001. The host echoes that accepted value so the next gesture begins from persisted, not unrounded, placement.

## Hard boundaries / no-go

No transformed/scaled/rotated ancestors, CSS zoom, motion paths, perspective, 3D, individual `rotate`, negative/nonuniform/collapsed scale, multiselection editing or snapping. Imported legacy 2D rotation is preserved, not rewritten. Full cross-browser native-pointer and cancellation acceptance are still required before migration.

## Verify

`npm test -- experiments/gestures/coordinates.test.ts`, `npm run typecheck`, `npm run lab:gestures`.

Serve the generated temporary directory with a local static server. Select the rotated card, request growth (314px border-box +30 = scale ~1.096), then right 10px. The written x must increase by 10.0, not 9.1. Save and reload; source must retain `transform:rotate(6deg)` plus accepted placement. Repeat after outer zoom selection. Unit tests cover coordinate arithmetic and source serialization; they do not establish native-pointer or real localStorage reload acceptance.
