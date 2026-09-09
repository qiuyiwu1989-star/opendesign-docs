import { parse, serialize, defaultTreeAdapter, type DefaultTreeAdapterMap } from "parse5";
import { composingKey } from "./editing-keys";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type TextTarget = {
  id: string;
  tag: string;
  text: string;
  start: number;
  end: number;
  raw: string;
  part?: boolean;
};
export type Inspection = {
  targets: TextTarget[];
  scripts: number;
  svg: number;
  externalResources: number;
  relativeResources: number;
};
const textTags = new Set(
  "h1 h2 h3 h4 h5 h6 p span strong em b i u s small li td th dt dd div label figcaption caption blockquote code pre a summary".split(
    " ",
  ),
);
const excluded = new Set(
  "script style head template noscript iframe object embed svg math textarea".split(
    " ",
  ),
);
const removed = new Set(
  "script iframe object embed base meta link foreignObject animate animateMotion animateTransform set template noscript"
    .toLowerCase()
    .split(" "),
);

function isElement(node: Node): node is Element {
  return "tagName" in node;
}
function inspectTree(tree: Node): Inspection {
  const report: Inspection = {
    targets: [],
    scripts: 0,
    svg: 0,
    externalResources: 0,
    relativeResources: 0,
  };
  let sequence = 0;
  const visit = (node: Node, blocked: boolean) => {
    if (isElement(node)) {
      const nodeId = `text-${sequence++}`;
      if (node.tagName === "script") report.scripts++;
      if (node.tagName === "svg") report.svg++;
      for (const attr of node.attrs) {
        if (
          attr.name === "src" ||
          attr.name === "srcset" ||
          (attr.name === "href" && node.tagName === "link")
        ) {
          if (/^(https?:)?\/\//i.test(attr.value)) report.externalResources++;
          else if (attr.value && !/^(data:|#)/i.test(attr.value))
            report.relativeResources++;
        }
      }
      // Source spans are used for edits, never a DOM reserialization of the original.
      const location = node.sourceCodeLocation;
      if (
        !blocked &&
        textTags.has(node.tagName) &&
        node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
        node.childNodes.every((child) => child.nodeName === "#text") &&
        location?.startTag &&
        location.endTag
      ) {
        const text = node.childNodes
          .map((child) => ("value" in child ? child.value : ""))
          .join("");
        report.targets.push({
          id: nodeId,
          tag: node.tagName,
          text,
          start: location.startTag.endOffset,
          end: location.endTag.startOffset,
          raw: "",
        });
      }
      blocked ||= excluded.has(node.tagName);
      // Preserve existing element IDs. Extra IDs address direct text runs, not
      // a flattened parent containing bold/link/line-break markup.
      if (!blocked && textTags.has(node.tagName) && node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
          node.childNodes.some(child => child.nodeName !== "#text")) {
        node.childNodes.forEach((child, index) => {
          const loc = child.sourceCodeLocation;
          if (child.nodeName === "#text" && "value" in child && child.value.trim() && loc) {
            report.targets.push({ id: `${nodeId}-part-${index}`, tag: node.tagName, text: child.value,
              start: loc.startOffset, end: loc.endOffset, raw: "", part: true });
          }
        });
      }
    }
    if ("childNodes" in node)
      for (const child of node.childNodes) visit(child, blocked);
  };
  visit(tree, false);
  report.targets.sort((a, b) => a.start - b.start);
  return report;
}

export function inspectHtml(source: string): Inspection {
  const report = inspectTree(parse(source, { sourceCodeLocationInfo: true }));
  report.targets.forEach((target) => {
    target.raw = source.slice(target.start, target.end);
  });
  return report;
}

export function patchText(
  source: string,
  target: TextTarget,
  value: string,
): string {
  if (value.length > 100_000) throw new Error("单段文字过长，请分段修改。");
  const current = inspectHtml(source).targets.find(
    (item) => item.id === target.id,
  );
  if (
    !current ||
    current.start !== target.start ||
    current.end !== target.end ||
    current.raw !== target.raw
  ) {
    throw new Error("页面已经变化，请重新选择文字后修改。");
  }
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return source.slice(0, target.start) + escaped + source.slice(target.end);
}

// The iframe has an opaque origin. Original scripts are never executed. Only this
// fixed bridge is granted a nonce; incoming messages are also checked by source + channel.
function bridge(
  channel: string,
  editing: boolean,
  scroll: number,
  reviewing: boolean,
  markerRuntime: string,
  reviewReadOnly: boolean,
) {
  return `(() => {
    const channel = ${JSON.stringify(channel)};
    const editing = ${JSON.stringify(editing)};
    const reviewing = ${JSON.stringify(reviewing)};
    const annotating = reviewing && ${!reviewReadOnly};
    const send = (type, extra = {}) => parent.postMessage({channel, type, ...extra}, '*');
    let active = null, before = '';
    const target = e => e.target instanceof Element ? e.target.closest('[data-doc-text]') : null;
    let marker = null, marked = null, start = null;
    const comments = ${markerRuntime ? `reviewing ? (${markerRuntime})((id, anchor) => { draw(anchor); send('review-open', {id}); }) : null` : "null"};
    const isComment = e => e.target instanceof Element && e.target.closest('[data-doc-review]');
    let selectedObject = null;
    const selectObject = node => {
      selectedObject?.removeAttribute('data-doc-selected'); selectedObject = node;
      if (!node) return;
      node.setAttribute('data-doc-selected', '');
      send('object-select', {id:node.getAttribute('data-doc-object'), width:node.offsetWidth, height:node.offsetHeight});
    };
    window.addEventListener('scroll', () => send('scroll-position', {scroll:window.scrollY}), {passive:true});
    const clearMarker = () => { marker?.remove(); marker = null; marked = null; };
    const draw = anchor => {
      clearMarker();
      let rect;
      if (anchor.kind === 'text') {
        const node = [...document.querySelectorAll('[data-doc-text]')].find(n => n.getAttribute('data-doc-text') === anchor.id);
        if (!node || node.textContent !== anchor.quote) { send('anchor-unavailable'); return; }
        rect = node.getBoundingClientRect();
      } else {
        if (Math.abs(window.innerWidth - anchor.viewportWidth) > 2) { send('anchor-unavailable'); return; }
        rect = { left: anchor.x - window.scrollX, top: anchor.y - window.scrollY, width: anchor.width, height: anchor.height };
      }
      marked = anchor;
      marker = document.createElement('div');
      marker.setAttribute('aria-hidden', 'true');
      marker.style.cssText = 'all:initial;pointer-events:none!important;position:fixed!important;z-index:2147483647!important;box-sizing:border-box!important;border:2px solid #d78b21!important;background:#f4bd4924!important;border-radius:4px!important;left:' + rect.left + 'px!important;top:' + rect.top + 'px!important;width:' + rect.width + 'px!important;height:' + rect.height + 'px!important';
      document.documentElement.append(marker);
    };
    window.addEventListener('scroll', () => { if (marked) draw(marked); });
    window.addEventListener('resize', () => { if (marked) draw(marked); });
    document.addEventListener('pointerdown', e => {
      if (!annotating || e.button !== 0 || isComment(e)) return;
      e.preventDefault();
      start = { x: e.pageX, y: e.pageY, id: target(e)?.getAttribute('data-doc-text') };
    }, true);
    document.addEventListener('pointermove', e => {
      if (!start) return;
      draw({kind:'region', x:Math.min(start.x,e.pageX), y:Math.min(start.y,e.pageY), width:Math.abs(start.x-e.pageX), height:Math.abs(start.y-e.pageY), viewportWidth:window.innerWidth});
    });
    document.addEventListener('pointerup', e => {
      if (!start) return;
      const from = start; start = null;
      const width = Math.abs(from.x - e.pageX), height = Math.abs(from.y - e.pageY);
      if (width >= 4 && height >= 4) {
        const anchor = {kind:'region', x:Math.min(from.x,e.pageX), y:Math.min(from.y,e.pageY), width, height, viewportWidth:window.innerWidth};
        draw(anchor); send('annotation', {anchor});
      } else if (from.id) {
        const node = [...document.querySelectorAll('[data-doc-text]')].find(n => n.getAttribute('data-doc-text') === from.id);
        const anchor = {kind:'text', id:from.id, quote:node?.textContent ?? ''};
        draw(anchor); send('annotation', {anchor});
      } else clearMarker();
    });
    document.addEventListener('pointercancel', () => { start = null; clearMarker(); });
    document.addEventListener('click', e => {
      if (isComment(e)) return;
      const anchor = e.target instanceof Element && e.target.closest('a');
      if (anchor) e.preventDefault();
      if (reviewing) { e.preventDefault(); return; }
      const node = target(e);
      if (editing && e.target instanceof Element) {
        selectObject(e.target.closest('[data-doc-object]'));
        if (!node) send('select', {id:''});
      }
      if (node) send('select', {id: node.getAttribute('data-doc-text')});
      if (!editing && anchor) {
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('#')) document.getElementById(href.slice(1))?.scrollIntoView();
      }
    }, true);
    document.addEventListener('dblclick', e => {
      const node = target(e);
      if (!editing || !node) return;
      active = node; before = node.textContent;
      node.setAttribute('contenteditable', 'plaintext-only'); node.focus();
      send('editing');
    });
    document.addEventListener('focusout', e => {
      if (!active || e.target !== active) return;
      const node = active; active = null; node.removeAttribute('contenteditable');
      if (node.textContent !== before) send('edit', {id: node.getAttribute('data-doc-text'), text: node.textContent, scroll: window.scrollY});
      send('ended');
    });
    document.addEventListener('keydown', e => {
      if (isComment(e)) return;
      if ((${composingKey.toString()})(e)) return;
      if (active && e.key === 'Escape') { active.textContent = before; active.blur(); }
      if (reviewing && e.key === 'Escape') { start = null; clearMarker(); send('annotation-cancel'); }
      if (annotating && e.key === 'Enter') {
        const node = target(e);
        if (node) {
          e.preventDefault();
          const rect = node.getBoundingClientRect();
          const anchor = e.shiftKey
            ? {kind:'region', x:Math.max(0,rect.left + window.scrollX), y:Math.max(0,rect.top + window.scrollY), width:Math.min(rect.width,window.innerWidth-Math.max(0,rect.left + window.scrollX)), height:rect.height, viewportWidth:window.innerWidth}
            : {kind:'text', id:node.getAttribute('data-doc-text'), quote:node.textContent};
          draw(anchor); send('annotation', {anchor});
        }
      }
      if (active && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); active.blur(); }
    });
    document.addEventListener('beforeinput', e => {
      if (!active || !['insertParagraph', 'insertLineBreak'].includes(e.inputType)) return;
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection?.rangeCount || !active.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0); range.deleteContents();
      const newline = document.createTextNode('\\n'); range.insertNode(newline);
      range.setStartAfter(newline); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
    });
    document.addEventListener('drop', e => e.preventDefault());
    document.addEventListener('submit', e => e.preventDefault());
    window.addEventListener('message', e => {
      if (e.source !== parent || e.data?.channel !== channel) return;
      if (e.data.type === 'request-ready') { send('ready'); return; }
      if (editing && e.data.type === 'object-focus' && typeof e.data.id === 'string') {
        selectObject([...document.querySelectorAll('[data-doc-object]')].find(n => n.getAttribute('data-doc-object') === e.data.id) ?? null);
        return;
      }
      if (reviewing && e.data.type === 'review-markers' && Array.isArray(e.data.threads)) {
        clearMarker(); comments?.update(e.data.threads); return;
      }
      if (e.data.type === 'flush') {
        if (active) active.blur();
        send('flushed'); return;
      }
      if (reviewing && e.data.type === 'review-locate' && e.data.anchor) {
        const anchor = e.data.anchor;
        if (anchor.kind === 'region') window.scrollTo(0, Math.max(0, anchor.y - 100));
        else [...document.querySelectorAll('[data-doc-text]')].find(n => n.getAttribute('data-doc-text') === anchor.id)?.scrollIntoView({block:'center'});
        draw(anchor); return;
      }
      if (typeof e.data.id !== 'string') return;
      const node = [...document.querySelectorAll('[data-doc-text]')].find(n => n.getAttribute('data-doc-text') === e.data.id);
      if (e.data.type === 'locate' && node) { node.scrollIntoView({block:'center'}); node.focus(); }
    });
    requestAnimationFrame(() => window.scrollTo(0, ${Math.max(0, Number.isFinite(scroll) ? scroll : 0)}));
    send('ready');
  })();`;
}

export function createPreview(
  source: string,
  channel: string,
  editing: boolean,
  scroll = 0,
  reviewing = false,
  decorate?: (node: Element) => void,
  markerRuntime = "",
  reviewReadOnly = false,
): string {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(channel))
    throw new Error("Invalid preview channel");
  const tree = parse(source, { sourceCodeLocationInfo: true });
  const targets = inspectTree(tree).targets;
  const byOffset = new Map(targets.filter(t => !t.part).map((target) => [target.start, target.id]));
  const parts = new Map(targets.filter(t => t.part).map(t => [t.start, t.id]));
  const clean = (node: Node) => {
    if (isElement(node)) {
      node.attrs = node.attrs.filter((attr) => {
        const name = attr.name.toLowerCase();
        if (
          name.startsWith("on") ||
          name.startsWith("data-doc-") ||
          [
            "contenteditable",
            "autofocus",
            "nonce",
            "is",
            "srcdoc",
            "target",
            "formaction",
            "action",
            "ping",
          ].includes(name)
        )
          return false;
        if (["src", "href", "srcset", "poster", "background"].includes(name))
          return (
            attr.value.startsWith("#") ||
            /^data:image\/(png|jpeg|gif|webp);base64,/i.test(attr.value)
          );
        return true;
      });
      const id = byOffset.get(
        node.sourceCodeLocation?.startTag?.endOffset ?? -1,
      );
      if (id)
        node.attrs.push(
          { name: "data-doc-text", value: id },
          { name: "tabindex", value: "0" },
        );
      if (["input", "button", "select", "textarea"].includes(node.tagName))
        node.attrs.push({ name: "disabled", value: "" });
      // Only trusted application code can add preview metadata after input cleanup.
      decorate?.(node);
    }
    if ("childNodes" in node) {
      node.childNodes = node.childNodes.filter(
        (child) =>
          !(isElement(child) && removed.has(child.tagName.toLowerCase())),
      );
      node.childNodes.forEach(clean);
      // Wrapper nodes exist only in the inert preview. Never write them back.
      node.childNodes = node.childNodes.map(child => {
        const id = child.nodeName === "#text" ? parts.get(child.sourceCodeLocation?.startOffset ?? -1) : undefined;
        if (!id || !isElement(node)) return child;
        const span = defaultTreeAdapter.createElement("span", node.namespaceURI, [
          { name: "data-doc-text", value: id }, { name: "tabindex", value: "0" },
        ]);
        defaultTreeAdapter.appendChild(span, child as DefaultTreeAdapterMap["textNode"]);
        span.parentNode = node;
        return span;
      });
    }
  };
  clean(tree);
  const csp = `default-src 'none'; script-src 'nonce-${channel}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  return serialize(tree)
    .replace(
      "<head>",
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`,
    )
    .replace(
      "</body>",
      `<style>[data-doc-text]:focus{outline:2px solid #267565;outline-offset:4px}${editing ? "[data-doc-object]:hover{outline:1px dashed #267565;outline-offset:3px}[data-doc-selected]{outline:2px solid #267565!important;outline-offset:3px}[data-doc-text]:hover{outline:1px dashed #267565;outline-offset:3px;cursor:text}[contenteditable]{white-space:pre-wrap}" : ""}${reviewing && !reviewReadOnly ? "html,body{cursor:crosshair!important;user-select:none!important}" : ""}</style><script nonce="${channel}">${bridge(channel, editing, scroll, reviewing, markerRuntime, reviewReadOnly)}</script></body>`,
    );
}
