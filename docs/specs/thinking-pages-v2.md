# Thinking pages v2 — local prototype

Implemented on feat/conversation-canvas. Data model: work → pages → Excalidraw objects. Each page has its own scene, image files and discussion history. Page navigation supports add, rename, duplicate, drag reorder and keyboard-accessible move buttons. Overview thumbnails and presentation use the same scenes. The 16:9 surface is an editing viewport, not a clipping boundary; original object coordinates are retained.

Storage: v2 localStorage with 350 ms debounce and flush on navigation/pagehide. Legacy v1 remains untouched and is copied to a migration-backup key before migration. Invalid stored data fails closed. JSON backup restores as new works, preserving originals. Browser storage is local, not cloud sync. Large image-heavy works can hit browser quotas; save errors prompt backup.

Discussion: current page or selected-object PNG plus structured elements, page/work identity and scene revision go to the development-only localhost bridge. Requests survive selection changes at the same revision; editing creates new context and prevents stale proposal acceptance. AI calls remain manual through an external agent. A returned suggestion is explicitly accepted into the page and supports editor undo. Discussion text persists, but the bridge and pending proposals are in memory and disappear on server restart. Docs handoff currently exports page/selection text, not complete slide layout.

Validation (2026-10-13): TypeScript, Vite build, existing bundle budgets; 8 focused unit tests covering migration, corrupt data, duplicate isolation, ordering, restore and proposal validation. Isolated Chrome integration verified edit → switch → duplicate → return → snapshot request → proposal acceptance → presentation navigation → reload, including original content and discussion persistence. User browser storage was not used for test fixtures or overwritten. Visual screenshot reviewed at 1500 × 960. Full database suite not rerun; previously blocked by local embedded-Postgres ICU dependency.

Next milestones: durable request/response transport and request IDs, actual agent-read acknowledgments, fixed-page composition and complete slide export, cloud persistence and collaboration. No production deployment in this iteration.

## Paste fidelity repair (2026-10-13)
HTML break tags in editable diagram labels are normalized into actual newlines (plain BR stays intact). Mermaid paste conversion is intercepted before insertion to normalize converted labels. Existing diagrams offer explicit, undoable repair and reference-image palette actions. The latter uses a dark background, purple rounded nodes, clean sans-serif text and smooth strokes while retaining node positions and bindings; it does not reconstruct missing original layout or claim pixel fidelity. Image paste continues through the native image path for faithful appearance. Viewport containment and fit margins keep the page within available space.

Validation: TypeScript and build/bundle budgets passed. Isolated Chrome fixture from the supplied diagram verified tag removal, newlines, palette, local persistence, viewport containment and undo restoring original tags. The user's stored page was not silently rewritten.

## Presentation-style workspace refinement
Page actions moved into a thumbnail context menu (including Shift+F10, arrow navigation and Escape). Inspector remains the original editor controls, viewport-positioned outside the page in the right Format/Discussion sidebar. Selection opens Format; switching to Discussion preserves selection. The page chrome now follows the supplied Keynote reference with neutral gray surfaces, narrow navigator, compact header, blue selection, external drawing toolbar/footer and File-menu backup actions. This is a browser adaptation, not pixel-identical Keynote or equivalent feature coverage.

Checked: TypeScript and build/bundle budgets; isolated Chrome context-menu duplicate/reorder/keyboard behavior; right inspector bounds and tab switching; actual stroke-color change persisted; latest layout screenshot reviewed at 1440 × 900. Small-screen and touch layouts remain unverified.
