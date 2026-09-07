import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourcePanel } from "./ResourcePanel";
import { deferredFeature, FeatureBoundary } from "./deferred-feature";
import { staticFiles } from "../scripts/bundle-metrics";

describe("spec026 on-demand loading", () => {
  it("does not inspect or mount resource tools in the collapsed shell", () => {
    const html = renderToStaticMarkup(<ResourcePanel source='<img src="missing.png">' contextKey="v1" disabled={false} onApply={() => { throw new Error('unexpected write'); }} />);
    expect(html).toBe('<details class="resource-panel"><summary>资源</summary></details>');
  });
  it("does not import before render and shows an accessible loading state", () => {
    const load = vi.fn(() => new Promise<{ default: () => null }>(() => {}));
    const Feature = deferredFeature(load, '测试工具');
    expect(load).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(<Feature />);
    expect(load).toHaveBeenCalledTimes(1);
    expect(html).toContain('role="status"');
    expect(html).toContain('正在打开测试工具');
  });
  it("renders a concise error and exposes explicit retry, without reload or storage changes", () => {
    const retry = vi.fn();
    const boundary = new FeatureBoundary({ name: '测试工具', onRetry: retry, children: <p>Loaded</p> });
    expect(renderToStaticMarkup(boundary.render())).toBe('<p>Loaded</p>');
    boundary.state = FeatureBoundary.getDerivedStateFromError();
    const result = boundary.render() as React.ReactElement<{ children: React.ReactElement[] }>;
    expect(renderToStaticMarkup(result)).toContain('role="alert"');
    const button = result.props.children[1] as React.ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("counts shared/cyclic static imports once and excludes dynamic features", () => {
    expect(staticFiles({ main: {file:'main.js',imports:['shared','view'],dynamicImports:['tools'],css:['main.css']},
      shared:{file:'shared.js',imports:['main'],css:['base.css']},view:{file:'view.js',imports:['shared'],css:['base.css']},tools:{file:'tools.js'} }, 'main'))
      .toEqual({ js:['main.js','shared.js','view.js'],css:['main.css','base.css'] });
    expect(() => staticFiles({main:{file:'main.js',imports:['absent']}},'main')).toThrow('Missing');
  });
});
