import Moveable from "moveable";
import Selecto from "selecto";
import { scaleAtFixedCorner, translateFromBeforeDist, type FixedGeometry } from "./coordinates";

// Runs inside the same opaque-origin sandbox used by document previews.
const channel = (document.currentScript as HTMLScriptElement).nonce ?? "";
const send = (type: string, extra = {}) => parent.postMessage({ channel, type, ...extra }, "*");
let selected: HTMLElement | null = null;
let before = { x: 0, y: 0, scale: 1 };
let pending = before;
let fixed: FixedGeometry | null = null;
let gestureValid = false;
const read = (node: HTMLElement) => {
  const s = getComputedStyle(node);
  const translate = s.translate === "none" ? ["0px", "0px"] : s.translate.split(/\s+/);
  const scales = s.scale === "none" ? [1] : s.scale.split(/\s+/).map(Number);
  if (translate.length > 2 || translate.some(v => !/^-?[\d.]+px$/.test(v)) || scales.length > 2 || scales.some(v => !Number.isFinite(v) || v < .1 || v > 5) || (scales.length === 2 && scales[0] !== scales[1]) || s.rotate !== "none") throw new Error("Unsupported individual transform");
  for (let p: HTMLElement | null = node; p; p = p.parentElement) {
    const c = getComputedStyle(p);
    if ((c.zoom !== "1" && c.zoom !== "normal") || c.offsetPath !== "none" || c.perspective !== "none" || (p !== node && [c.transform, c.scale, c.rotate].some(v => v !== "none" && v !== "1"))) throw new Error("Unsupported ancestor geometry");
  }
  const matrix = new DOMMatrixReadOnly(s.transform === "none" ? undefined : s.transform);
  if (!matrix.is2D) throw new Error("Unsupported 3D transform");
  return { x: parseFloat(translate[0]!), y: parseFloat(translate[1] || "0"), scale: scales[0]! };
};
const moveable = new Moveable(document.body, { container: document.body, draggable: true, scalable: true,
  keepRatio: true, origin: false, snappable: false, throttleDrag: 0, throttleScale: 0, cspNonce: channel });
const selecto = new Selecto({ container: document.body, dragContainer: document.body,
  selectableTargets: ["[data-doc-lab]"], selectByClick: true, selectFromInside: false, hitRate: 10 });
selecto.on("dragStart", e => {
  if (moveable.isMoveableElement(e.inputEvent.target) || selected?.contains(e.inputEvent.target)) e.stop();
});
selecto.on("selectEnd", e => {
  selected = e.selected.length === 1 ? e.selected[0] as HTMLElement : null;
  moveable.target = selected;
  send("selected", { id: selected?.getAttribute("data-doc-lab"), count: e.selected.length });
});
const start = () => {
  gestureValid = false;
  if (!selected) return false;
  try { pending = before = read(selected); gestureValid = true; return true; }
  catch { send("unsupported"); return false; }
};
const paint = () => {
  if (!selected) return;
  selected.style.setProperty("translate", `${pending.x}px ${pending.y}px`, "important");
  selected.style.setProperty("scale", String(pending.scale), "important");
};
const finish = () => { if (selected && gestureValid) send("placement", { id: selected.getAttribute("data-doc-lab"), value: pending }); };
moveable.on("dragStart", e => { if (!start()) e.stop(); }).on("drag", e => {
  if (!gestureValid) return;
  pending = translateFromBeforeDist(before, e.beforeDist); paint();
}).on("dragEnd", e => { if (e.isDrag) finish(); });
moveable.on("scaleStart", e => {
  if (!start() || !selected) { e.stop(); return; }
  const s = getComputedStyle(selected), matrix = new DOMMatrixReadOnly(s.transform === "none" ? undefined : s.transform);
  const origin = s.transformOrigin.split(/\s+/).map(parseFloat);
  fixed = { width: selected.offsetWidth, height: selected.offsetHeight, originX: origin[0]!, originY: origin[1]!, matrix, direction: [e.direction[0]!, e.direction[1]!] };
  e.set([before.scale, before.scale]);
}).on("scale", e => {
  if (!gestureValid || !fixed) return;
  try { pending = scaleAtFixedCorner(before, e.scale[0]!, fixed); paint(); }
  catch { pending = before; paint(); gestureValid = false; send("unsupported"); }
}).on("scaleEnd", e => { if (e.isDrag) finish(); });
window.addEventListener("message", e => {
  if (e.source !== parent || e.data?.channel !== channel) return;
  if (e.data.type === "nudge" && selected) moveable.request("draggable", { deltaX: 10, deltaY: 0 }, true);
  if (e.data.type === "grow" && selected) moveable.request("scalable", { deltaWidth: 30, keepRatio: true }, true);
  if (e.data.type === "accepted" && selected && selected.getAttribute("data-doc-lab") === e.data.id) {
    const p = e.data.value;
    if (!p || ![p.x, p.y, p.scale].every(Number.isFinite) || Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000 || p.scale < .1 || p.scale > 5) return;
    pending = p; paint(); moveable.updateRect();
  }
});
window.addEventListener("pagehide", () => { selecto.destroy(); moveable.destroy(); });
send("ready");
