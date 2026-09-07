import { parse, type DefaultTreeAdapterMap } from "parse5";
type Node = DefaultTreeAdapterMap["node"];
// Narrow, explicit repair: url('data:image/...base64,VALID)') -> url('...VALID').
// Operates only on CSS source spans; scripts and document text are untouched.
export function repairEmbeddedImages(source: string) {
  const spans: { start: number; end: number; value: string }[] = [];
  let count = 0;
  const add = (start: number, end: number) => {
    const original = source.slice(start, end);
    let value = original.replace(
      /url\((['"])(data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2}))\)\1\)/gi,
      (whole, quote: string, url: string, payload: string) => {
        if (payload.length % 4 !== 0) return whole;
        count++;
        return `url(${quote}${url}${quote})`;
      },
    );
    // Missing URL quote at the end of an oppositely quoted style attribute.
    value = value.replace(
      /url\((['"])(data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2}))\)(["'])$/gi,
      (whole, quote: string, url: string, payload: string, outer: string) => {
        if (quote === outer || payload.length % 4 !== 0) return whole;
        count++;
        return `url(${quote}${url}${quote})${outer}`;
      },
    );
    if (value !== original) spans.push({ start, end, value });
  };
  const visit = (node: Node) => {
    if ("tagName" in node) {
      if (["script", "template", "noscript"].includes(node.tagName)) return;
      const loc = node.sourceCodeLocation;
      if (loc?.attrs?.style)
        add(loc.attrs.style.startOffset, loc.attrs.style.endOffset);
      if (node.tagName === "style" && loc?.startTag && loc.endTag)
        add(loc.startTag.endOffset, loc.endTag.startOffset);
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parse(source, { sourceCodeLocationInfo: true }));
  let result = source;
  for (const span of spans.sort((a, b) => b.start - a.start))
    result = result.slice(0, span.start) + span.value + result.slice(span.end);
  return { source: result, count };
}
