# 021: Content-first presentation

## Intent
User requested the original slide dominate the screen instead of a large bottom control area. Preserve proportional fitting without crop or source changes.

## Non-goals
No deployment, source/export changes, new editor tools, cloud features or imported script execution. Do not redesign imported slides.

## Acceptance
- [x] Stage uses the entire dialog viewport; controls overlay rather than reserve height.
- [x] Compact controls hide after 2.2 seconds idle; pointer interaction or Tab reveals them.
- [x] Holds are timer-tested; keyboard focus stays visible in-browser. Touch ignores hover holds by implementation; physical touch remains unverified.
- [x] Arrow keys, Home/End, Escape and focus restoration continue working.
- [x] Fullscreen state controls the button; existing denied-fullscreen fallback is preserved. OS-native exit/denial not newly certified.
- [x] 147 tests, typecheck, both builds and browser checks recorded, with native limitations explicit.

## Status
Implemented and locally verified. See docs/ACCEPTANCE.md for evidence and remaining native gates. Not pushed or deployed.
