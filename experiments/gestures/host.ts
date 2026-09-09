import { createPreview } from "../../src/html";
import { inspectSlides, patchPlacement, validatePlacement } from "../../src/slides";
import { editHistory, historyOf, moveHistory } from "../../src/history";
declare const LAB_RUNTIME: string;
const fixture = `<!doctype html><html><head><style>body{margin:0;font:20px system-ui;background:#eef2e8}.slide{position:relative;min-height:1300px}h1{margin:0;padding:32px}.card{position:absolute;padding:32px;background:#b8d4c8;width:250px;height:130px;transform-origin:0 0}.a{left:70px;top:160px}.b{left:440px;top:340px;background:#dfc6a4}</style></head><body><section class="slide"><h1>Moveable + Selecto · 隔离验证</h1><div class="card a">选择后拖动或等比缩放</div><div class="card b" style="transform:rotate(6deg)">保留原来的旋转</div></section></body></html>`;
const key = "opendesign-gesture-lab-032";
let source = localStorage.getItem(key) || fixture;
let history = historyOf(source), channel = "";
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const status = document.querySelector<HTMLOutputElement>("output")!;
const content = document.querySelector<HTMLTextAreaElement>("textarea")!;
function render() {
  channel = crypto.randomUUID();
  const objects = inspectSlides(source)[0]!.objects;
  const preview = createPreview(source, channel, false, 0, false, node => {
    const object = objects.find(o => o.start === node.sourceCodeLocation?.startOffset);
    if (object?.tag === "div") node.attrs.push({ name: "data-doc-lab", value: object.id });
  });
  frame.srcdoc = preview.replace("</body>", `<script nonce="${channel}">${LAB_RUNTIME.replace(/<\/script/gi, "<\\/script")}</script></body>`);
  content.value = source;
}
window.addEventListener("message", e => {
  if (e.source !== frame.contentWindow || e.data?.channel !== channel) return;
  if (e.data.type === "ready") status.value = "就绪 · 单选拖拽 · 框选仅验证选择";
  if (e.data.type === "selected") status.value = `已选 ${e.data.count} 个`;
  if (e.data.type === "unsupported") status.value = "不支持：仅限无祖先变换的 2D 对象；不支持 individual rotate、3D 或异常缩放";
  if (e.data.type === "placement") {
    try {
      const object = inspectSlides(source)[0]!.objects.find(o => o.id === e.data.id);
      if (!object) return;
      const accepted = validatePlacement(e.data.value);
      source = patchPlacement(source, object, accepted);
      history = editHistory(history, source); content.value = source;
      frame.contentWindow?.postMessage({ channel, type: "accepted", id: e.data.id, value: accepted }, "*");
      status.value = `已写回源文件 · x=${accepted.x.toFixed(1)} y=${accepted.y.toFixed(1)} scale=${accepted.scale.toFixed(3)}`;
    } catch { status.value = "超出安全范围，恢复源文件"; render(); }
  }
});
document.querySelector("#nudge")!.addEventListener("click", () => frame.contentWindow?.postMessage({ channel, type: "nudge" }, "*"));
document.querySelector("#grow")!.addEventListener("click", () => frame.contentWindow?.postMessage({ channel, type: "grow" }, "*"));
document.querySelector("#save")!.addEventListener("click", () => { localStorage.setItem(key, source); status.value = "实验副本已保存，可刷新验证"; });
document.querySelector("#undo")!.addEventListener("click", () => { history = moveHistory(history, "undo"); source = history.present; render(); });
document.querySelector<HTMLSelectElement>("#zoom")!.addEventListener("change", e => {
  const ratio = Number((e.target as HTMLSelectElement).value);
  frame.style.transform = `scale(${ratio})`; frame.style.transformOrigin = "0 0";
});
render();
