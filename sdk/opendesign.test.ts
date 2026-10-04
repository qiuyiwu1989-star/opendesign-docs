import { afterEach, expect, it, vi } from "vitest";
import { openWithWindow } from "./opendesign";
const origin = "https://docs.example";
const nonce = "0123456789abcdef";
function fixture(blocked = false) {
  const listeners = new Set<(e: MessageEvent) => void>();
  const child = { closed: false, postMessage: vi.fn() };
  const win = { open: vi.fn(() => blocked ? null : child),
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.delete(fn) };
  const send = (data: unknown, overrides = {}) => {
    for (const fn of listeners) fn({ source: child, origin, data, ...overrides } as unknown as MessageEvent);
  };
  const start = () => openWithWindow(win as unknown as Window, { name: "report", html: "<h1>你好</h1>" }, { docsUrl: origin });
  return { child, win, send, start, listeners };
}
afterEach(() => vi.useRealTimers());
it("opens synchronously, pins window/origin/nonce, sends once and waits for committed result", async () => {
  vi.useFakeTimers(); const f = fixture(); const result = f.start();
  expect(f.win.open).toHaveBeenCalledWith(`${origin}/#handoff=v1`, "_blank");
  const ready = { type: "opendesign:handoff-ready", v: 1, nonce };
  f.send(ready, { origin: "https://evil.example" }); f.send(ready, { source: {} });
  expect(f.child.postMessage).not.toHaveBeenCalled();
  f.send(ready); f.send(ready);
  expect(f.child.postMessage).toHaveBeenCalledTimes(1);
  expect(f.child.postMessage.mock.calls[0]?.[1]).toBe(origin);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.listeners.size).toBe(1); // Confirmation is not connection timeout.
  f.send({ type: "opendesign:handoff-result", v: 1, nonce: "wrong", ok: true });
  expect(f.listeners.size).toBe(1);
  f.send({ type: "opendesign:handoff-result", v: 1, nonce, ok: true });
  expect(await result).toEqual({ ok: true }); expect(f.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it("reports popup denial without leaving listeners", async () => {
  const f = fixture(true); expect(await f.start()).toEqual({ ok: false, reason: "blocked" }); expect(f.listeners.size).toBe(0);
});
it("times out only before READY and reports closure", async () => {
  vi.useFakeTimers(); const f = fixture(); const result = f.start();
  await vi.advanceTimersByTimeAsync(20_000); expect(await result).toEqual({ ok: false, reason: "timeout" });
  const g = fixture(); const closed = g.start(); g.child.closed = true;
  await vi.advanceTimersByTimeAsync(500); expect(await closed).toEqual({ ok: false, reason: "closed" });
});
it("validates before opening and forwards explicit rejection", async () => {
  const f = fixture();
  expect(() => openWithWindow(f.win as unknown as Window, { name: "x", html: "" })).toThrow();
  expect(f.win.open).not.toHaveBeenCalled();
  const result = f.start(); f.send({ type: "opendesign:handoff-ready", v: 1, nonce });
  f.send({ type: "opendesign:handoff-result", v: 1, nonce, ok: false, reason: "rejected" });
  expect(await result).toEqual({ ok: false, reason: "rejected" });
});
