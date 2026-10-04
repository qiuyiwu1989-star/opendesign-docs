import { Script, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { slideBridge } from "./slides-bridge";
import { validatePlacement } from "./slides";

// Bridge-level event regression tests, not a substitute for native mouse E2E.
function harness(activate = false) {
  const events: Record<string, (e: any) => void> = {};
  const windowEvents: Record<string, (e: any) => void> = {};
  const messages: any[] = [];
  const timers: (() => void)[] = [];
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
      setProperty: (key: string, value: string, priority = "") => {
        this.style[key] = value;
        this.priorities[key] = priority;
      },
      getPropertyValue: (key: string) => this.style[key] || "",
      getPropertyPriority: (key: string) => this.priorities[key] || "",
      removeProperty: (key: string) => {
        delete this.style[key];
        delete this.priorities[key];
      },
    };
    priorities: Record<string, string> = {};
    children: MockElement[] = [];
    parentElement: MockElement | null = null;
    tagName = "DIV";
    offsetWidth = 1280;
    offsetHeight = 720;
    captured = false;
    textContent = "原始文字";
    attributes: Record<string, string> = {};
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
      return ["[data-doc-object]", "[data-doc-text]"].includes(selector) &&
        this.id
        ? this
        : null;
    }
    contains(node: MockElement) {
      return node === object;
    }
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    }
    removeAttribute(name: string) {
      delete this.attributes[name];
    }
    focus() {}
    blur() {
      events.focusout!({ target: this });
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
      setTimeout: (fn: () => void) => timers.push(fn),
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
    timers,
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
  it("spec030 repeats ready on an authenticated parent request without changing content", () => {
    const h = harness();
    h.messages.length = 0;
    h.windowEvents.message!({ source: {}, data: { channel: "test-channel-123", type: "request-ready" } });
    h.windowEvents.message!({ source: h.parent, data: { channel: "wrong", type: "request-ready" } });
    expect(h.messages).toHaveLength(0);
    h.windowEvents.message!({ source: h.parent, data: { channel: "test-channel-123", type: "request-ready" } });
    expect(h.messages).toEqual([{ channel: "test-channel-123", type: "slide-ready", width: 1280, height: 720 }]);
    expect(h.object.textContent).toBe("原始文字");
    expect(h.object.style.translate).toBeUndefined();
  });
  it("spec029 ignores viewport jitter before converting movement at half zoom", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 102, 101);
    h.pointer("pointerup", 102, 101);
    expect(h.messages.filter((m) => m.type === "placement")).toHaveLength(0);
    expect(h.object.style.translate).toBeUndefined();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 105, 100);
    h.pointer("pointerup", 105, 100);
    expect(h.messages.find((m) => m.type === "placement")?.placement.x).toBe(
      10,
    );
  });
  it("spec029 lets IME cancel candidates before Escape cancels direct text", () => {
    const h = harness();
    h.events.dblclick!({ target: h.object });
    h.object.textContent = "未确认文字";
    for (const event of [
      { key: "Escape", isComposing: true },
      { key: "Enter", ctrlKey: true, keyCode: 229 },
    ]) {
      h.events.keydown!({ ...event, preventDefault() {} });
      expect(h.object.textContent).toBe("未确认文字");
      expect(h.object.attributes.contenteditable).toBe("plaintext-only");
    }
    h.events.keydown!({ key: "Escape" });
    expect(h.object.textContent).toBe("原始文字");
    expect(h.object.attributes.contenteditable).toBeUndefined();
    expect(h.messages.filter((m) => m.type === "edit")).toHaveLength(0);
    expect(h.messages.at(-1).type).toBe("ended");
  });
  it("spec029 does not nudge selected objects during composition", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    h.events.keydown!({
      key: "ArrowRight",
      isComposing: true,
      preventDefault() {},
    });
    expect(h.messages.filter((m) => m.type === "placement")).toHaveLength(0);
  });
  it("spec022 accumulates rapid arrows immediately and ignores stale parent echoes", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    const key = (key: string, shiftKey = false) =>
      h.events.keydown!({ key, shiftKey, preventDefault() {} });
    const ack = (placement: any) =>
      h.windowEvents.message!({
        source: h.parent,
        data: {
          channel: "test-channel-123",
          type: "apply-placement",
          id: h.object.id,
          placement,
        },
      });
    key("ArrowRight");
    key("ArrowRight");
    const changes = h.messages.filter((m) => m.type === "placement");
    expect(changes.map((m) => m.placement.x)).toEqual([1, 2]);
    ack(changes[0].placement);
    expect(h.object.style.translate).toBe("2px 0px");
    key("ArrowDown", true);
    ack(changes[1].placement);
    expect(h.object.style.translate).toBe("2px 10px");
    const latest = h.messages.filter((m) => m.type === "placement").at(-1);
    ack(latest.placement);
    expect(h.object.style.translate).toBe("2px 10px");
  });
  it("spec022 bounds keyboard movement and avoids no-op commits at the boundary", () => {
    const h = harness();
    h.object.style.translate = "9999px -10000px";
    h.events.click!({ target: h.object });
    for (const key of ["ArrowRight", "ArrowRight", "ArrowUp"]) {
      h.events.keydown!({ key, shiftKey: true, preventDefault() {} });
    }
    expect(
      h.messages.filter((m) => m.type === "placement").map((m) => m.placement),
    ).toEqual([{ x: 10000, y: -10000, scale: 1 }]);
  });
  it("spec022 resizes vertically with the same fixed-corner geometry", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    h.pointer("pointerdown", 200, 100, h.handle);
    h.pointer("pointermove", 200, 125, h.handle);
    h.pointer("pointerup", 200, 125, h.handle);
    const next = h.messages.find((m) => m.type === "placement").placement;
    expect(next.scale).toBeCloseTo(1.1);
    expect(next.x).toBeCloseTo(10);
    expect(next.y).toBeCloseTo(5);
  });
  it("spec022 restores exact original inline styles and priority on cancel", () => {
    for (const event of [
      "pointercancel",
      "lostpointercapture",
      "blur",
      "resize",
      "Escape",
    ]) {
      const h = harness();
      h.object.style.setProperty("translate", "12px 24px", "");
      h.object.style.setProperty("scale", "1.2", "important");
      h.pointer("pointerdown", 100, 100);
      h.pointer("pointermove", 120, 115);
      if (event === "blur" || event === "resize") h.windowEvents[event]!({});
      else if (event === "Escape") h.events.keydown!({ key: "Escape" });
      else h.pointer(event, 120, 115);
      h.pointer("pointerup", 120, 115);
      expect(h.messages.filter((m) => m.type === "placement")).toEqual([]);
      expect(h.object.style.translate).toBe("12px 24px");
      expect(h.object.style.scale).toBe("1.2");
      expect(h.object.style.getPropertyPriority("translate")).toBe("");
      expect(h.object.style.getPropertyPriority("scale")).toBe("important");
      expect(h.object.captured).toBe(false);
    }
  });
  it("spec022 ignores arrow micro-adjustments during a pointer gesture", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 115);
    h.events.keydown!({ key: "ArrowRight", preventDefault() {} });
    h.pointer("pointerup", 120, 115);
    expect(
      h.messages.filter((m) => m.type === "placement").map((m) => m.placement),
    ).toEqual([{ x: 40, y: 30, scale: 1 }]);
  });
  it("spec022 returning to the starting point does not create a version change", () => {
    const h = harness();
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 115);
    h.pointer("pointermove", 100, 100);
    h.pointer("pointerup", 100, 100);
    expect(h.messages.filter((m) => m.type === "placement")).toEqual([]);
    expect(h.object.style.translate).toBeUndefined();
  });
  it("spec022 a late acknowledgement cannot interrupt a new pointer gesture", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    h.events.keydown!({ key: "ArrowRight", preventDefault() {} });
    const next = h.messages.find((m) => m.type === "placement").placement;
    h.pointer("pointerdown", 100, 100);
    h.pointer("pointermove", 120, 115);
    h.windowEvents.message!({
      source: h.parent,
      data: {
        channel: "test-channel-123",
        type: "apply-placement",
        id: h.object.id,
        placement: next,
      },
    });
    expect(h.object.style.translate).toBe("41px 30px");
    h.pointer("pointerup", 120, 115);
    expect(
      h.messages.filter((m) => m.type === "placement").at(-1).placement.x,
    ).toBe(41);
  });
  it("spec022 recognizes rounded persistence echoes after a fractional resize", () => {
    const h = harness();
    h.events.click!({ target: h.object });
    h.pointer("pointerdown", 200, 100, h.handle);
    h.pointer("pointermove", 212.345, 107.891, h.handle);
    h.pointer("pointerup", 212.345, 107.891, h.handle);
    const rawResize = h.messages.find((m) => m.type === "placement").placement;
    const resizeEcho = validatePlacement(rawResize);
    expect(rawResize.x).not.toBe(resizeEcho.x);
    h.events.keydown!({ key: "ArrowRight", preventDefault() {} });
    const latest = h.messages
      .filter((m) => m.type === "placement")
      .at(-1).placement;
    h.windowEvents.message!({
      source: h.parent,
      data: {
        channel: "test-channel-123",
        type: "apply-placement",
        id: h.object.id,
        placement: resizeEcho,
      },
    });
    expect(h.object.style.translate).toBe(`${latest.x}px ${latest.y}px`);
    const latestEcho = validatePlacement(latest);
    h.windowEvents.message!({
      source: h.parent,
      data: {
        channel: "test-channel-123",
        type: "apply-placement",
        id: h.object.id,
        placement: latestEcho,
      },
    });
    expect(h.object.style.translate).toBe(
      `${latestEcho.x}px ${latestEcho.y}px`,
    );
    expect(h.object.style.scale).toBe(String(latestEcho.scale));
  });
  it("spec022 refuses reflected, collapsed or out-of-range source scales", () => {
    for (const scale of ["-1", "0", "6"]) {
      const h = harness();
      h.object.style.scale = scale;
      h.pointer("pointerdown", 100, 100);
      h.pointer("pointermove", 120, 115);
      h.pointer("pointerup", 120, 115);
      expect(h.messages.some((m) => m.type === "layout-locked")).toBe(true);
      expect(h.messages.some((m) => m.type === "placement")).toBe(false);
    }
  });
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
    h.pointer("pointermove", 250, 125, h.handle);
    h.pointer("pointerup", 250, 125, h.handle);
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
    expect(h.object.style.translate).toBeUndefined();
    expect(h.object.style.scale).toBeUndefined();
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

it.each([[false,false],[true,false],[false,true],[true,true]])("blocks candidate commits, including focusout=%s, cancel=%s", (blurFirst, cancel) => {
 const h=harness(); const original=h.object.textContent; const finalText=cancel?original:"confirmed"; h.events.dblclick!({target:h.object});
 h.events.compositionstart?.({target:h.object});h.object.textContent="candidate";
 if(blurFirst) h.events.focusout!({target:h.object});
 h.windowEvents.message!({source:h.parent,data:{channel:"test-channel-123",type:"flush"}});
 expect(h.messages.filter(m=>m.type==="edit"||m.type==="flushed")).toEqual([]);
 expect(h.messages.at(-1).type).toBe("flush-blocked");
 h.events.compositionend?.({target:h.object});h.object.textContent=finalText;
 h.events.keydown!({key:"Escape",preventDefault(){}});
 expect(h.object.textContent).toBe(finalText);
 h.windowEvents.message!({source:h.parent,data:{channel:"test-channel-123",type:"flush"}});
 expect(h.messages.filter(m=>m.type==="edit"||m.type==="flushed")).toEqual([]);
 h.timers.splice(0).forEach(fn=>fn());
 h.windowEvents.message!({source:h.parent,data:{channel:"test-channel-123",type:"flush"}});
 expect(h.messages.filter(m=>m.type==="edit").map(m=>m.text)).toEqual(cancel?[]:[finalText]);
 expect(h.messages.at(-1).type).toBe("flushed");
});

it("ignores the previous composition timer during a newer final-input window",()=>{
 const h=harness(); h.events.dblclick!({target:h.object});
 h.events.compositionstart!({target:h.object}); h.events.focusout!({target:h.object});
 h.events.compositionend!({target:h.object});
 h.events.compositionstart!({target:h.object}); h.object.textContent="second candidate";
 h.events.compositionend!({target:h.object});
 h.timers.shift()!();
 h.windowEvents.message!({source:h.parent,data:{channel:"test-channel-123",type:"flush"}});
 expect(h.messages.filter(m=>m.type==="edit"||m.type==="flushed")).toEqual([]);
 h.object.textContent="second confirmed"; h.timers.shift()!();
 expect(h.messages.filter(m=>m.type==="edit").map(m=>m.text)).toEqual(["second confirmed"]);
});

it("uses arrows on the resize handle to scale instead of moving the object", () => {
  const h = harness();
  h.events.click!({ target: h.object });
  h.events.keydown!({ target: h.handle, key: "ArrowRight", shiftKey: true, preventDefault() {} });
  const next = h.messages.find(m => m.type === "placement").placement;
  expect(next.scale).toBeGreaterThan(1);
  expect(next.x).toBeCloseTo((next.scale - 1) * 100);
  expect(next.y).toBeCloseTo((next.scale - 1) * 50);
});

it.each(["ArrowLeft", "ArrowUp"])("shrinks with %s while keeping the opposite corner fixed", key => {
  const h = harness(); h.events.click!({ target: h.object });
  h.events.keydown!({ target: h.handle, key, shiftKey: true, preventDefault() {} });
  const p = h.messages.find(m => m.type === "placement").placement;
  expect(p.scale).toBeLessThan(1);
  expect(p.x - (p.scale - 1) * 100).toBeCloseTo(0);
  expect(p.y - (p.scale - 1) * 50).toBeCloseTo(0);
});
it.each([[5,"ArrowRight"],[0.1,"ArrowLeft"]])("does not create an edit beyond scale %s", (scale,key) => {
  const h=harness(); h.object.style.scale=String(scale);h.events.click!({target:h.object});
  h.events.keydown!({target:h.handle,key,shiftKey:true,preventDefault(){}});
  expect(h.messages.filter(m=>m.type==="placement")).toHaveLength(0);
});
it("exposes the current scale on the keyboard resize handle",()=>{
  const h=harness();h.events.click!({target:h.object});
  expect(h.handle.attributes['aria-label']).toContain('100%');
  h.events.keydown!({target:h.handle,key:'ArrowRight',shiftKey:true,preventDefault(){}});
  expect(h.handle.attributes['aria-label']).toContain('104%');
});
