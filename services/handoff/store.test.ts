import { expect, it } from "vitest";
import { HandoffStore, RateLimit } from "./store";
it("preserves exact HTML across reads, expires and reclaims capacity", () => {
  let now = 1000; const store = new HandoffStore(() => now, 100, 1, 100);
  const html = '<!--原样-->\r\n<h1 title="a">你 &amp; 我</h1>';
  const entry = store.create("../x.html", html);
  expect(entry.token).toMatch(/^[\w-]{43}$/);
  expect(store.read(entry.token).html).toBe(html); expect(store.read(entry.token).html).toBe(html);
  expect(() => store.create("b", "b")).toThrow("空间已满");
  now += 100; expect(() => store.read(entry.token)).toThrow("过期");
  expect(store.create("b", "b").token).not.toBe(entry.token);
});
it("rejects invalid Unicode and byte overflow, deletion is idempotent", () => {
  const store = new HandoffStore();
  expect(() => store.create("x", "\ud800")).toThrow();
  expect(() => store.create("x", "你".repeat(2_000_000))).toThrow("5 MiB");
  const entry = store.create("x", "x"); store.delete(entry.token); store.delete(entry.token);
  expect(() => store.read(entry.token)).toThrow();
});
it("bounds aggregate bytes and rate windows", () => {
  const store = new HandoffStore(Date.now, 100, 10, 5);
  store.create("x", "你好".slice(0, 1)); expect(() => store.create("y", "你")).toThrow();
  let now = 0; const limit = new RateLimit(1, 100, () => now);
  limit.take("a"); expect(() => limit.take("a")).toThrow(); limit.take("b"); now = 100; limit.take("a");
});
