import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { createPreview } from "./html";
import { inspectSlides } from "./slides";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Child = DefaultTreeAdapterMap["childNode"];
const element = (node: Node): node is Element => "tagName" in node;
const attr = (node: Element, name: string) =>
  node.attrs.find((item) => item.name === name)?.value;
const nonce = "docs-static-thumbnail";
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const MAX_VISIBLE_THUMBNAILS = 6;

// There is no editor bridge, message handler or imported script in a thumbnail.
// This fixed layout-only script restores the same active-page layout as the canvas.
const layout = `(()=>{
  const pages=[...document.querySelectorAll('[data-doc-slide]')];
  const page=document.querySelector('[data-doc-thumbnail-current]');if(!page)return;
  if(pages.some(n=>n.classList.contains('active'))){pages.forEach(n=>n.classList.remove('active'));page.classList.add('active');}
  if(getComputedStyle(page).display==='none')page.style.setProperty('display','block','important');
  const w=page.offsetWidth>100?page.offsetWidth:1280,h=page.offsetHeight>100?page.offsetHeight:720;
  let ancestor=page;
  while(ancestor.parentElement){
    [...ancestor.parentElement.children].forEach(n=>{if(n!==ancestor&&!['STYLE','SCRIPT','HEAD'].includes(n.tagName))n.style.setProperty('display','none','important');});
    ancestor=ancestor.parentElement;if(ancestor===document.body)break;
    ancestor.style.setProperty('display','contents','important');ancestor.style.setProperty('transform','none','important');
  }
  document.body.style.cssText+=';margin:0!important;overflow:hidden!important;';
  document.documentElement.style.cssText+=';margin:0!important;overflow:hidden!important;';
  const zoom=Math.min(1280/w,720/h);
  page.style.cssText+=';box-sizing:border-box!important;position:absolute!important;margin:0!important;max-width:none!important;max-height:none!important;width:'+w+'px!important;height:'+h+'px!important;left:'+((1280-w*zoom)/2)+'px!important;top:'+((720-h*zoom)/2)+'px!important;transform-origin:0 0!important;transform:scale('+zoom+')!important;translate:none!important;scale:none!important;rotate:none!important;visibility:visible!important;opacity:1!important;';
})();`;

/** Sanitizes once per settled document. Each projection omits other pages' assets. */
export function createThumbnailFactory(
  source: string,
): (pageId: string) => string {
  const pages = inspectSlides(source);
  const offsets = new Map(pages.map((page) => [page.start, page.id]));
  const safe = createPreview(source, nonce, false, 0, false, (node) => {
    const id = offsets.get(
      node.sourceCodeLocation?.startTag?.startOffset ?? -1,
    );
    if (id) node.attrs.push({ name: "data-doc-slide", value: id });
  });
  const tree = parse(safe);
  return (pageId) => {
    if (!pages.some((page) => page.id === pageId))
      throw new Error("页面不存在。");
    // Keep sibling shells for nth-child selectors and active-class discovery, but
    // don't multiply embedded bitmaps/text from every other page into each iframe.
    const project = (node: Node, omitted = false): Node | null => {
      if (element(node) && node.tagName === "script") return null;
      if (node.nodeName === "#text" && omitted) return null;
      const copy = { ...node } as Node;
      if (element(copy)) {
        const page = attr(copy, "data-doc-slide");
        omitted ||= !!page && page !== pageId;
        copy.attrs = copy.attrs.filter(
          (item) =>
            !["tabindex", "data-doc-text", "contenteditable"].includes(
              item.name,
            ) &&
            !(
              omitted &&
              ["src", "srcset", "poster", "background"].includes(item.name)
            ),
        );
        if (page === pageId)
          copy.attrs.push({ name: "data-doc-thumbnail-current", value: "" });
        if (omitted && copy.tagName !== "style") {
          copy.attrs = copy.attrs.filter((item) =>
            ["id", "class", "data-doc-slide"].includes(item.name),
          );
          // Preserve style blocks but no other page content/inline image assets.
          const styles = (children: Child[]): Child[] =>
            children.flatMap((child) =>
              element(child) && child.tagName === "style"
                ? [child]
                : "childNodes" in child
                  ? styles(child.childNodes)
                  : [],
            );
          copy.childNodes = styles(copy.childNodes);
          return copy;
        }
      }
      if ("childNodes" in copy)
        copy.childNodes = copy.childNodes.flatMap((child) => {
          const next = project(child, omitted);
          return next ? [next as Child] : [];
        });
      return copy;
    };
    return serialize(project(tree)! as DefaultTreeAdapterMap["document"])
      .replace(
        "</head>",
        "<style>*{animation:none!important;transition:none!important;caret-color:transparent!important}html{pointer-events:none!important;user-select:none!important}</style></head>",
      )
      .replace("</body>", `<script nonce="${nonce}">${layout}</script></body>`);
  };
}

export function visibleThumbnailIds(
  candidates: number[],
  current: number,
): number[] {
  const unique = [...new Set(candidates)].filter(
    (index) => Number.isInteger(index) && index >= 0,
  );
  if (!unique.length) return [Math.max(0, current)];
  const center = (Math.min(...unique) + Math.max(...unique)) / 2;
  return unique
    .sort((a, b) =>
      a === current
        ? -1
        : b === current
          ? 1
          : Math.abs(a - center) - Math.abs(b - center),
    )
    .slice(0, MAX_VISIBLE_THUMBNAILS);
}
