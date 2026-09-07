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

## Important limits

- Data lives in this browser's IndexedDB. Original disk files are not overwritten. Clearing browser storage can lose your documents; export backups.
- Only applied edits are automatically drafted. A saved version, a draft and a downloaded HTML file are different things.
- HTML export keeps original scripts and resource references. It is **not** a sanitized public-share page or a complete offline asset bundle, and does not include comments/version history.
- Preview blocks imported scripts and external resources, including external fonts/images. Missing remote assets can affect appearance.
- Arbitrary HTML is not a free-form canvas. Complex transforms, SVG subtrees, IDs/references and page-local scripts/styles can restrict operations.
- Single image limit: 4 MiB / 20 megapixels. Final HTML limit: 5 MiB. No animated image/SVG insertion, multi-layer background editing, continuous snapping, PPTX export or real-time co-editing.
- Native pointer drag/resize and native fullscreen acceptance remain release gates. Unit tests are not a substitute for these checks.

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
