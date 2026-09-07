import { Script, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { slideBridge } from "./slides-bridge";

// Bridge-level event regression tests, not a substitute for native mouse E2E.
function harness(activate = false) {
  const events: Record<string, (e: any) => void> = {};
  const windowEvents: Record<string, (e: any) => void> = {};
  const messages: any[] = [];
  const created: MockElement[] = [];
  class MockElement {
    classes = new Set<string>();
    classList = {
      contains: (s: string) => this.classes.has(s),
      add: (s: string) => this.classes.add(s),
      remove: (s: string) => this.classes.delete(s),
    };
    style: any = {
      cssText: "",
      setProperty: (key: string, value: string) => {
        this.style[key] = value;
      },
    };
    children: MockElement[] = [];
    parentElement: MockElement | null = null;
    tagName = "DIV";
    offsetWidth = 1280;
    offsetHeight = 720;
    captured = false;
    constructor(public id = "") {}
    append(n: MockElement) {
      this.children.push(n);
    }
    getAttribute(name: string) {
      return name === "data-doc-object"
        ? this.id
        : name === "data-doc-slide"
          ? "page-0"
          : null;
    }
    closest(selector: string) {
      return selector === "[data-doc-object]" && this.id ? this : null;
    }
    querySelectorAll() {
      return [object];
    }
    getBoundingClientRect() {
      const scale = Number(this.style.scale || 1);
      return {
        left: 20,
        top: 20,
        width: 200 * scale * 0.5,
        height: 100 * scale * 0.5,
      };
    }
    setPointerCapture() {
      this.captured = true;
    }
    releasePointerCapture() {
      this.captured = false;
    }
  }
  const page = new MockElement();
  const otherPage = new MockElement();
  if (activate) otherPage.classList.add("active");
  const object = new MockElement("object-0-0");
  object.parentElement = page;
  const body = new MockElement();
  body.tagName = "BODY";
  page.parentElement = body;
  body.children = [page];
  const document = {
    body,
    documentElement: new MockElement(),
    head: new MockElement(),
    querySelectorAll: () => (activate ? [page, otherPage] : [page]),
    createElement: () => {
      const n = new MockElement();
      created.push(n);
      return n;
    },
    addEventListener: (name: string, fn: (e: any) => void) => {
      events[name] = fn;
    },
  };
  const parent = { postMessage: (data: any) => messages.push(data) };
  const window = {
    addEventListener: (name: string, fn: (e: any) => void) => {
      const previous = windowEvents[name];
      windowEvents[name] = (e) => {
        previous?.(e);
        fn(e);
      };
    },
  };
  new Script(slideBridge("test-channel-123", "page-0")).runInContext(
    createContext({
      document,
      parent,
      window,
      Element: MockElement,
      innerWidth: 680,
      innerHeight: 400,
      getComputedStyle: (node: MockElement) => ({
        display: "block",
        translate: node.style.translate || "none",
        scale: node.style.scale || "none",
        transform: node.style.transform || "none",
        rotate: "none",
        transformOrigin: "100px 50px",
        zoom: node.style.zoom || "1",
        offsetPath: node.style.offsetPath || "none",
      }),
    }),
  );
  const pointer = (
    type: string,
    x: number,
    y: number,
    target = object,
    pointerId = 1,
  ) =>
    events[type]!({
      target,
      clientX: x,
      clientY: y,
      button: 0,
      detail: 1,
      pointerId,
      preventDefault() {},
    });
  return {
    events,
    windowEvents,
    parent,
    messages,
    object,
    handle: created[2]!,
    page,
    otherPage,
    pointer,
  };
}

describe("spec 014 trusted slide gesture bridge", () => {
  it("spec019 clears selection on Escape and does not revive a focused old object", () => {
    const h = harness();
    const key = (key: string) =>
      h.events.keydown!({ target: h.object, key, preventDefault() {} });
    h.events.click!({ target: h.object });
    key("Escape");
    expect(h.messages.at(-1).type).toBe("object-clear");
    key("ArrowRight");
    expect(h.messages.some((m) => m.type === "placement")).toBe(false);
    key("Enter");
    key("ArrowRight");
    expect(h.messages.at(-1).placement.x).toBe(1);
  });
  it("spec019 blank click clears selection but clicking the resize handle does not", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    h.events.click!({ target: h.handle });
    expect(h.messages.at(-1).type).toBe("object-select");
    h.events.click!({ target: h.page });
    expect(h.messages.at(-1).type).toBe("object-clear");
  });
  it("spec019 rejects CSS zoom and motion paths on the object or its page", () => {
    for (const scope of ["object", "page"] as const) {
      for (const [property, value] of [
        ["zoom", "2"],
        ["offsetPath", "path('M0 0 L50 50')"],
      ]) {
        const h = harness();
        h[scope].style[property!] = value;
        h.pointer("pointerdown", 100, 100);
        h.pointer("pointermove", 120, 120);
        h.pointer("pointerup", 120, 120);
        expect(h.messages.some((m) => m.type === "layout-locked")).toBe(true);
        expect(h.messages.some((m) => m.type === "placement")).toBe(false);
      }
    }
  });
  it("spec019 leaves browser modifier shortcuts alone", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    for (const modifier of ["metaKey", "ctrlKey", "altKey"]) {
      h.events.keydown!({
        target: h.object,
        key: "ArrowRight",
        [modifier]: true,
        preventDefault() {},
      });
    }
    expect(h.messages.some((m) => m.type === "placement")).toBe(false);
  });
  it("activates only the selected preview page without running imported navigation", () => {
    const h = harness(true);
    expect(h.page.classList.contains("active")).toBe(true);
    expect(h.otherPage.classList.contains("active")).toBe(false);
  });
  it("converts drag coordinates through viewport zoom and commits once", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 115);
    h.pointer("pointerup", 120, 115);
    expect(h.messages.filter((m) => m.type === "placement")).toEqual([
      {
        channel: "test-channel-123",
        type: "placement",
        id: "object-0-0",
        placement: { x: 40, y: 30, scale: 1 },
      },
    ]);
    expect(h.object.captured).toBe(false);
  });
  it("resizes from the handle with origin compensation", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointerup", 100, 100);
    h.pointer("pointerdown", 200, 100, h.handle);
    h.pointer("pointermove", 250, 100, h.handle);
    h.pointer("pointerup", 250, 100, h.handle);
    expect(h.messages.find((m) => m.type === "placement")?.placement).toEqual({
      x: 50,
      y: 25,
      scale: 1.5,
    });
  });
  it("cancels and restores placement without creating an edit", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 115);
    h.pointer("pointercancel", 120, 115);
    expect(h.messages.filter((m) => m.type === "placement")).toEqual([]);
    expect(h.object.style.translate).toBe("0px 0px");
    expect(h.object.style.scale).toBe("1");
    expect(h.object.captured).toBe(false);
  });
  it("ignores a second pointer and rejects unauthenticated flushes", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 300, 300, h.object, 2);
    h.pointer("pointerup", 300, 300, h.object, 2);
    h.windowEvents.message!({
      source: {},
      data: { channel: "test-channel-123", type: "flush" },
    });
    expect(
      h.messages.filter((m) => ["placement", "flushed"].includes(m.type)),
    ).toEqual([]);
    h.pointer("pointermove", 110, 110);
    h.windowEvents.message!({
      source: h.parent,
      data: { channel: "test-channel-123", type: "flush" },
    });
    expect(h.messages.slice(-2).map((m) => m.type)).toEqual([
      "placement",
      "flushed",
    ]);
  });
  it("does not move objects with conflicting CSS transforms", () => {
    const h = harness();
    h.object.style.transform = "rotate(10deg)";
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 120);
    h.pointer("pointerup", 120, 120);
    expect(h.messages.some((m) => m.type === "layout-locked")).toBe(true);
    expect(h.messages.some((m) => m.type === "placement")).toBe(false);
  });
  it("applies local styles without reloading and ignores invalid or forged geometry", () => {
    const h = harness();
    const data = {
      channel: "test-channel-123",
      type: "apply-placement",
      id: "object-0-0",
      placement: { x: 12, y: 24, scale: 1.2 },
    };
    h.windowEvents.message!({ source: {}, data });
    expect(h.object.style.translate).toBeUndefined();
    h.windowEvents.message!({ source: h.parent, data });
    expect(h.object.style.translate).toBe("12px 24px");
    expect(h.object.style.scale).toBe("1.2");
    expect(h.messages.at(-1).type).toBe("object-select");
    h.windowEvents.message!({
      source: h.parent,
      data: { ...data, placement: { ...data.placement, x: Infinity } },
    });
    expect(h.object.style.translate).toBe("12px 24px");
  });
});
