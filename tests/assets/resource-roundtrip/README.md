# Resource round-trip fixtures

Synthetic HTML and original PNG/WebP geometry; no customer material.

Noto Sans SC 400 subset retrieved 2026-09-19 from Google Fonts CSS text endpoint, converted to WOFF and WOFF2 with fontTools. Only the two headings and ABC123 are covered, not full CJK. Source: https://fonts.google.com/noto/specimen/Noto+Sans+SC . License: OFL.txt from https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/OFL.txt . Reserved name Source is not used for a renamed derivative.

- roundtrip.html: two missing images and two missing font declarations.
- cover.png / cover.webp: original 320x200 fixtures.
- noto-qa.woff / noto-qa.woff2: licensed font subset.
- corrupt.png: deliberately invalid image, expected rejection.

Browser evidence and release state: docs/ACCEPTANCE.md. Actual downloaded HTML retains all four payloads byte-for-byte. Differences are confined to replaced resource sources and adjacent quote/spacing formatting; remaining source is unchanged.
