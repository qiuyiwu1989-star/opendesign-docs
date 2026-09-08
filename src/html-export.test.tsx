import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { htmlExportBlob, htmlExportName } from "./html-export";
import { ExportControl } from "./ExportControl";
import { inspectHtml, patchText } from "./html";

describe("spec028 source-preserving export", () => {
  it("round-trips edited Unicode, CRLF, scripts, styles and embedded resources exactly", async () => {
    const source = '<!doctype html>\r\n<html><head><style>@font-face{font-family:Demo;src:url(data:font/woff2;base64,d09GMg==)}</style></head><body><h1>原标题</h1><img src="data:image/png;base64,iVBORw0KGgo=" alt="封面"><script>window.original = 1;</script></body></html>';
    const edited = patchText(source, inspectHtml(source).targets[0]!, '新标题 🪷 & 完整保留');
    const blob = htmlExportBlob(edited);
    expect(blob.type).toBe("text/html;charset=utf-8");
    expect(await blob.text()).toBe(edited);
    expect(blob.size).toBe(new TextEncoder().encode(edited).byteLength);
    expect(inspectHtml(await blob.text()).targets[0]!.text).toBe('新标题 🪷 & 完整保留');
    expect(await blob.text()).toContain('<script>window.original = 1;</script>');
    expect(await blob.text()).not.toContain('contenteditable');
    expect(source).toContain('<h1>原标题</h1>');
  });
  it("uses a distinct HTML filename without path separators, controls or bidi overrides", () => {
    expect(htmlExportName('课程.HTML')).toBe('课程-edited.html');
    expect(htmlExportName('notes.htm')).toBe('notes-edited.html');
    expect(htmlExportName('../../a\\b:\u0000\u202efile.html')).toBe('-..-a-b--file-edited.html');
    expect(htmlExportName('... .html')).toBe('document-edited.html');
    expect(new TextEncoder().encode(htmlExportName('🪷'.repeat(150) + '.html')).byteLength).toBeLessThan(200);
    expect(htmlExportName('🪷'.repeat(150))).not.toContain('\ufffd');
  });
  it("renders a compact closed control, never a persistent download banner", () => {
    const html = renderToStaticMarkup(<ExportControl name="课程.html" url="" disabled={false} onPrepare={() => {}} onDismiss={() => {}} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('popover="auto"');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('export-banner');
  });
  it("labels preparation as a download action, not completed delivery or saved version", () => {
    const html = renderToStaticMarkup(<ExportControl name="课程.html" url="blob:prepared" disabled={false} onPrepare={() => {}} onDismiss={() => {}} />);
    expect(html).toContain('download="课程-edited.html"');
    expect(html).toContain('href="blob:prepared"');
    expect(html).toContain('下载 HTML');
    expect(html).toContain('保留原脚本');
    expect(html).not.toContain('下载成功');
    expect(html).not.toContain('已保存');
  });
});
