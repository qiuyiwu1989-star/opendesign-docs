# Keynote interaction comparison — 2026-10-13

Goal: preserve the owner's existing Keynote habits for everyday slide work. Match action targets, insertion positions, focus, selection, inspector context and recovery before adding features. This is behavioral/UI analysis, not recovered Apple source code.

Evidence: owner screenshots; local Keynote SUTD window read through macOS Accessibility and screenshot, including navigator, main toolbar, slide inspector and Slide menu. No document content was edited. The Slide menu exposes new slide, skip slide, expand/collapse groups, slide numbers and navigation. Native right-click did not yield a readable menu in this run, so its exact ordering is unverified. Apple shortcut reference confirms new slide after selection and Command-D duplication. Implementation status below comes from local source, not assumptions about deployed software.

| Area | Reference / expected behavior | Current prototype / gap | Next acceptance |
|---|---|---|---|
| New slide | New slide after selection (Apple docs) | Fixed toolbar insertion | First/middle/last, active new page |
| Context insertion | Owner expects insertion at clicked thumbnail | Added New Page to context menu; uses target ID | Active last + right-click middle inserts after middle |
| Duplicate | Command-D (Apple docs); preserve page content | Context duplicate exists; no navigator shortcut yet | Keyboard scoped to navigator, independent objects |
| Navigation | Local native navigator identifies current slide | Click supported; arrow-key page switching missing | Up/down changes page only with navigator focus |
| Reorder | Slide ordering supported by Apple guide | Drag/drop and menu; no precise gap marker | Visible before/after insertion marker |
| Selection | Page focus differs from object/text focus | Single page only | Cmd/Shift multi-select; avoid intercepting text shortcuts |
| Delete / recovery | Delete selected slide (Apple shortcut reference) | No page deletion or page-level undo | Recoverable delete; Cmd-Z restores page and order |
| Context menus | Actions follow clicked object | Page target implemented | Dismiss outside/Escape; focus follows meaningful target |
| Inspector: no object | Native shows slide layout, title/body/number, background | Prototype empty guidance | Page background controls when no object selected |
| Inspector: object | Owner screenshot has Style/Text/Arrange | Native Excalidraw long form retained | Object-sensitive sections, no irrelevant controls |
| Text | Native text object properties available | Excalidraw fonts/wrapping | Default clean font, predictable click/double-click and sizing |
| Canvas | Supplied reference separates slide from tools | Tools moved outside; viewport remains infinite scene | True page bounds, stable page zoom, objects can live off-page |
| Zoom | Native top toolbar shows percentage | Prototype bottom control; fit-to-objects | Fit page independent of object bounds |
| Toolbar | Native: play/add/table/chart/text/shape/media/comment/zoom | Excalidraw tool row remains | Task-oriented insertion buttons with menus |
| Assets | Native media/content entrances in toolbar | Custom right Materials tab | Keep owner-approved placement; persistent library not yet verified |
| Playback | Native Play starts at selected slide | Prototype starts at selected page | Keyboard next/back/Escape; presentation focus |
| Layouts | Native slide layout chooser | Blank pages only | Blank/title/title+body layouts with editable placeholders |
| Groups and skip | Observed native Slide menu | Missing | Skip affects playback; grouping preserves order |
| AI discussion | Product extension, not Keynote parity | Separate discussion tab | Explicit current page/selection, reversible candidate changes |

## Tools found on GitHub
- https://github.com/openclaw/AXorcist — Swift macOS Accessibility queries/actions; useful for UI tree and state observation. Does not recover source code or a full design specification.
- https://github.com/watzon/ax-cli — CLI inspection of macOS UI hierarchy, attributes and actions. Optional collection tool; existing computer-use access already supplies an AX tree.
- https://github.com/microsoft/playwright — browser automation and codegen; suitable for equivalent web interaction tests, not inspecting native Keynote.
- Apple reference: https://support.apple.com/guide/keynote/keyboard-shortcuts-tanfde4a3e6d/15.4/mac/1.0

No new third-party tool installed. For each parity task: capture native starting state → action → resulting selection/layout → implement → check equivalent web path. Do not mark a function identical from a screenshot alone. Priorities: navigator insertion/selection/undo, then slide-versus-object inspector, then stable page geometry/text, then layouts and secondary functions.

Current insertion validation: typecheck and six workspace tests, including middle-target insertion while another page is active and toolbar insertion after active page. Native insertion was verified from Apple documentation, not by mutating the user's Keynote file.
