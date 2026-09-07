# OpenDesign Docs

把生成好的 HTML，变成可以直接编辑、审阅和交付的可视化文档。

A local-first visual HTML editor. Keep the original design, refine the content, review versions and export your work. No Agent service or model API key required.

**Alpha — 本机编辑版。** Cloud sharing, verified collaboration and voice annotations are not available yet. This repository is independent of OpenDesign Library and Agent Studio.

## Quick start

Node.js 22.12+ and npm:

```sh
git clone https://github.com/qiuyiwu1989-star/opendesign-docs.git
cd opendesign-docs
npm ci
npm run dev
```

Open http://127.0.0.1:5175/docs/ and choose **演示页示例** or import a trusted HTML file. If that port is occupied, use `npm run dev -- --port 5180` and open the corresponding address. Browser storage is isolated by origin; changing the port does not migrate your documents.

## What works

- Continuous documents and explicitly paginated HTML presentations.
- Text editing with mixed-format preservation; object font size, color, weight and alignment.
- Supported object movement, scaling, duplication and deletion; six-direction page alignment.
- Local PNG/JPEG/WebP insertion and replacement; single bitmap CSS background replacement.
- Page duplication, deletion and ordering with safety checks; bounded slide thumbnails.
- Static presentation mode with keyboard navigation.
- Undo/redo, local automatic drafts, immutable saved versions and HTML export.
- Local version-bound comments, replies and resolution. These are not shared cloud comments.
- Portable JSON backups of saved versions and their comments; restore as an independent copy.
- Collapsed resource diagnostics in both views: common image/font/CSS references, local IMG replacement and narrow embedded-image syntax repair. Refresh returns to the current document in the same tab when session storage is available.

## Missing resources

Open **资源** above the page. A blocked remote image is not necessarily a broken link: previews intentionally do not fetch external assets. For a supported standalone image choose **选本机图片**; the validated PNG/JPEG/WebP is embedded while existing dimensions and styles remain. Replacement removes that image's `srcset` candidates. Undo, save a version and export as usual.

The scanner loads and runs when you first open **资源**; it is static and partial, not a network or decode test. Supported static `picture` images offer **统一图片**, with explicit confirmation that all screen sizes will use one image. Original candidates are removed; check crops and proportions afterward. Complex CSS, external stylesheets and script-generated assets are not automatically repaired. Imported scripts may still change images when exported HTML is opened. Try the synthetic [resource check](examples/resource-check.html) or [responsive image check](examples/picture-check.html).

Slide editing loads only when needed. Resource tools remain mounted after first opening, so collapsing the panel does not discard an in-progress choice. Both build commands run `check:bundle`, which counts entry plus transitive static JS imports and enforces separate initial/slide-view budgets. Bundle size improvements do not imply a measured page-speed gain.

## Local fonts

For a recognizable top-level `@font-face` inside an inline `<style>`, **资源 → confirm embedding rights → 选本机字体** replaces that declaration's `src` with an embedded WOFF/WOFF2. Family, weight, style and other descriptors are preserved. It does not install a system font or switch every text object to a new family. Try [font-check.html](examples/font-check.html).

File limit: 2 MiB; final HTML: 5 MiB. Header checks follow [WOFF](https://www.w3.org/TR/WOFF/) and [WOFF2](https://www.w3.org/TR/WOFF2/), followed by browser decoding. The 12 MiB declared expansion limit is advisory for WOFF2, not a guaranteed memory ceiling or independent security audit. No TTF/OTF conversion or collections. Nested/escaped/ambiguous CSS rules remain unsupported. Confirm your rights before embedding; the app does not verify licensing or glyph coverage. Check line breaks after replacement. Saved versions, exported HTML and project backups retain embedded bytes.

## Project backup

Open **文档库 → 备份与恢复 → 备份当前文档**, then download the project backup. **恢复备份** imports it as a new document without overwriting the original. Save edits and submit comments first: temporary drafts and unsent input are not included. The format accepts up to 20 MiB JSON and 100 saved versions; linked assets are not bundled.

## Important limits

- Data lives in this browser's IndexedDB. Original disk files are not overwritten. Clearing browser storage can lose your documents; export backups.
- Only applied edits are automatically drafted. A saved version, a draft and a downloaded HTML file are different things.
- HTML export keeps original scripts and resource references. It is **not** a sanitized public-share page or a complete offline asset bundle, and does not include comments/version history.
- Preview blocks imported scripts and external resources, including external fonts/images. Missing remote assets can affect appearance.
- Arbitrary HTML is not a free-form canvas. Complex transforms, SVG subtrees, IDs/references and page-local scripts/styles can restrict operations.
- Single image limit: 4 MiB / 20 megapixels. Final HTML limit: 5 MiB. No animated image/SVG insertion, multi-layer background editing, continuous snapping, PPTX export or real-time co-editing.
- Representative pointer drag, vertical resize, undo and region annotation have been exercised in-browser. Broader touch/device coverage and native fullscreen acceptance remain release gates; arbitrary HTML compatibility is not implied.

## Development

```sh
npm test
npm run typecheck
npm run build         # /docs/ base path
npm run build:domain  # root-domain base path
npm run audit -- /absolute/path/to/your/html-directory
```

Audit scripts read local files without executing their scripts or loading remote assets. Never commit private samples, recordings, secrets or production configuration. CI tests/builds only; it does not deploy.

See [roadmap](docs/ROADMAP.md), [acceptance](docs/ACCEPTANCE.md) and [security boundaries](SECURITY.md).

## License and provenance

Source code continues under the upstream **MIT License**, with original attribution preserved. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The project name and logo do not grant trademark rights. Imported user documents retain their own rights and are not licensed by this repository.
