import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandoff, startHandoff } from "./handoff";
import { readDocumentFile, validateDocument } from "./document-import";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
function setup() {
  vi.useFakeTimers();
  const opener = {} as Window, nonce = "once";
  const send = vi.fn(), save = vi.fn(async () => ({ ok: true as const })), confirm = vi.fn(() => true), notice = vi.fn(), complete = vi.fn();
  const receiver = createHandoff({ opener, nonce, send, save, confirm, notice, complete });
  const event = (document = { name: "report", html: "<p>你好</p>" }) => ({ source: opener, origin: "https://source.example", data: { type: "opendesign:handoff", v: 1, nonce, document } });
  return { ...receiver, opener, send, save, confirm, notice, complete, event };
}
afterEach(() => vi.useRealTimers());
describe("external handoff", () => {
  it("accepts DeepBrain bytes metadata but computes the actual UTF-8 size", async () => {
    const h = setup();
    const event = h.event({ name: "深脑-报告-12345678.html", html: "<p>你好</p>" });
    await h.receive({ ...event, data: { ...event.data, document: { ...event.data.document, bytes: 999999 } } });
    expect(h.confirm).toHaveBeenCalledWith(expect.stringContaining("1 KB"));
    expect(h.save).toHaveBeenCalledWith({ name: "深脑-报告-12345678.html", source: "<p>你好</p>", label: "从 https://source.example 导入" });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ ok: true }), "https://source.example");
  });
  it("does not let a forged small bytes field bypass the document limit", async () => {
    const h = setup();
    const event = h.event({ name: "report", html: "中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3)) });
    await h.receive({ ...event, data: { ...event.data, document: { ...event.data.document, bytes: 1 } } });
    expect(h.save).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: "too_large" }), "https://source.example");
  });
  it("sends only nonce in READY; commits once before exact-origin success", async () => {
    const h = setup(); h.ready();
    expect(h.send).toHaveBeenCalledWith({ type: "opendesign:handoff-ready", v: 1, nonce: "once" }, "*");
    let release!: () => void;
    h.save.mockImplementation(() => new Promise(resolve => { release = () => resolve({ ok: true }); }));
    const pending = h.receive(h.event());
    await Promise.resolve();
    await h.receive(h.event());
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000); expect(h.complete).not.toHaveBeenCalled();
    release(); await pending;
    expect(h.send).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }), "https://source.example");
    await h.receive(h.event()); expect(h.save).toHaveBeenCalledTimes(1);
  });
  it("ignores wrong source, nonce, version, opaque origin and unrelated messages", async () => {
    const h = setup(), e = h.event();
    for (const bad of [{...e, source: {} as Window}, {...e, origin: "null"}, {...e, data: {...e.data, nonce: "wrong"}}, {...e, data: {...e.data, v: 2}}, {...e, data: null}]) await h.receive(bad);
    expect(h.confirm).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000); expect(h.notice).toHaveBeenCalledWith(expect.stringContaining("没有收到"));
    await h.receive(e); expect(h.save).not.toHaveBeenCalled();
  });
  it("cancellation never writes and returns rejected", async () => {
    const h = setup(); h.confirm.mockReturnValue(false); await h.receive(h.event());
    expect(h.save).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: "rejected" }), "https://source.example");
  });
  it.each([null, "", "   ", 123, {}, "\ud800"])("rejects invalid content %j", async html => {
    const h = setup(); await h.receive(h.event({ name: "report", html: html as string }));
    expect(h.save).not.toHaveBeenCalled(); expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ reason: "invalid" }), "https://source.example");
  });
  it("counts UTF-8 bytes and rejects oversized input", async () => {
    const h = setup(); await h.receive(h.event({ name: "report", html: "中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3)) }));
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ reason: "too_large" }), "https://source.example");
  });
  it("keeps async confirmation open past payload timeout and ignores duplicates", async () => {
    const h = setup(); let answer!: (value: boolean) => void;
    h.confirm.mockImplementation(() => new Promise<boolean>(resolve => { answer = resolve; }) as never);
    const pending = h.receive(h.event());
    vi.advanceTimersByTime(20_000); await h.receive(h.event());
    expect(h.confirm).toHaveBeenCalledTimes(1); expect(h.save).not.toHaveBeenCalled();
    answer(false); await pending;
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ reason: "rejected" }), "https://source.example");
  });
  it("does not write when disposed during a confirmation", async () => {
    const h = setup(); let answer!: (value: boolean) => void;
    h.confirm.mockImplementation(() => new Promise<boolean>(resolve => { answer = resolve; }) as never);
    const pending = h.receive(h.event()); h.dispose(); answer(true); await pending;
    expect(h.save).not.toHaveBeenCalled();
  });
  it("reports storage failure rather than success", async () => {
    const h = setup(); h.save.mockRejectedValue(new Error("storage failed")); await h.receive(h.event());
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: "storage" }), "https://source.example");
  });
  it("propagates application dirty-work rejection", async () => {
    const h = setup(); h.save.mockResolvedValue({ ok: false, reason: "rejected" } as never); await h.receive(h.event());
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ reason: "rejected" }), "https://source.example");
  });
  it("disposal prevents later import and timers", async () => {
    const h = setup(); h.dispose(); vi.advanceTimersByTime(20_000); await h.receive(h.event());
    expect(h.save).not.toHaveBeenCalled(); expect(h.notice).not.toHaveBeenCalled();
  });
  it("clears hash even without opener, so refresh does not wait", () => {
    const replaceState = vi.fn(), notice = vi.fn();
    startHandoff({ location: { hash: "#handoff=v1", pathname: "/docs/", search: "?x=1" }, history: { state: null, replaceState }, opener: null } as unknown as Window, vi.fn(), notice);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/docs/?x=1"); expect(notice).toHaveBeenCalled();
  });
});
describe("one file and message validation contract", () => {
  it("normalizes filenames and preserves exact HTML", async () => {
    const source = "<p>报告</p>\n";
    const file = new File([source], "../报\u0000告.htm");
    expect(await readDocumentFile(file)).toEqual(validateDocument(file.name, source));
    expect(validateDocument(file.name, source)).toEqual({ name: "..报告.html", source, bytes: new TextEncoder().encode(source).byteLength });
  });
  it("rejects invalid UTF-8 files and empty files", async () => {
    await expect(readDocumentFile(new File([new Uint8Array([0xff])], "bad.html"))).rejects.toThrow("UTF-8");
    await expect(readDocumentFile(new File([" "], "empty.html"))).rejects.toThrow();
  });
});
