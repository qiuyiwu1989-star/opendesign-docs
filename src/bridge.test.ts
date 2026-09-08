import { Script, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createPreview } from "./html";

describe("spec 013 trusted annotation bridge", () => {
  it("spec029 preserves a long-document composition until explicit Escape cancellation", () => {
    const handlers: Record<string, (e: any) => void> = {};
    const messages: any[] = [];
    class TextMock {
      textContent = "原文";
      editable = false;
      closest(selector: string) {
        return selector === "[data-doc-text]" ? this : null;
      }
      getAttribute() {
        return "text-0";
      }
      setAttribute() {
        this.editable = true;
      }
      removeAttribute() {
        this.editable = false;
      }
      focus() {}
      blur() {
        handlers.focusout!({ target: this });
      }
    }
    const html = createPreview("<h1>原文</h1>", "test-channel-123", true);
    const bridge = html.match(
      /<script nonce="test-channel-123">([\s\S]*?)<\/script>/,
    )![1]!;
    new Script(bridge).runInContext(
      createContext({
        document: {
          addEventListener: (key: string, fn: (e: any) => void) => {
            handlers[key] = fn;
          },
        },
        parent: { postMessage: (data: any) => messages.push(data) },
        window: { scrollY: 0, scrollTo() {}, addEventListener() {} },
        Element: TextMock,
        requestAnimationFrame: (fn: () => void) => fn(),
      }),
    );
    const node = new TextMock();
    handlers.dblclick!({ target: node });
    node.textContent = "候选文字";
    for (const event of [
      { key: "Escape", isComposing: true },
      { key: "Enter", ctrlKey: true, keyCode: 229 },
    ]) {
      handlers.keydown!({ ...event, preventDefault() {} });
      expect(node.textContent).toBe("候选文字");
      expect(node.editable).toBe(true);
    }
    handlers.keydown!({ key: "Escape" });
    expect(node.textContent).toBe("原文");
    expect(node.editable).toBe(false);
    expect(messages.filter((m) => m.type === "edit")).toHaveLength(0);
    expect(messages.at(-1).type).toBe("ended");
  });
  it("builds a normalized rectangle from drag events and rejects changed viewport positioning", () => {
    const handlers: Record<string, (e: any) => void> = {};
    const windowHandlers: Record<string, (e: any) => void> = {};
    const messages: any[] = [];
    class ElementMock {
      closest() {
        return null;
      }
    }
    const parent = { postMessage: (data: unknown) => messages.push(data) };
    const document = {
      addEventListener: (type: string, fn: (e: any) => void) => {
        handlers[type] = fn;
      },
      createElement: () => ({
        style: { cssText: "" },
        setAttribute() {},
        remove() {},
      }),
      documentElement: { append() {} },
      querySelectorAll: () => [],
    };
    const window = {
      innerWidth: 800,
      scrollX: 0,
      scrollY: 0,
      scrollTo() {},
      addEventListener: (type: string, fn: (e: any) => void) => {
        windowHandlers[type] = fn;
      },
    };
    const html = createPreview(
      "<h1>test</h1>",
      "test-channel-123",
      false,
      0,
      true,
    );
    const bridge = html.match(
      /<script nonce="test-channel-123">([\s\S]*?)<\/script>/,
    )![1]!;
    new Script(bridge).runInContext(
      createContext({
        parent,
        document,
        window,
        Element: ElementMock,
        requestAnimationFrame: (fn: () => void) => fn(),
      }),
    );
    const event = (x: number, y: number) => ({
      target: new ElementMock(),
      button: 0,
      pageX: x,
      pageY: y,
      preventDefault() {},
    });
    handlers.pointerdown!(event(260, 200));
    handlers.pointermove!(event(20, 100));
    handlers.pointerup!(event(20, 100));
    expect(messages.find((m) => m.type === "annotation")?.anchor).toEqual({
      kind: "region",
      x: 20,
      y: 100,
      width: 240,
      height: 100,
      viewportWidth: 800,
    });
    const before = messages.length;
    windowHandlers.message!({
      source: {},
      data: {
        channel: "test-channel-123",
        type: "review-locate",
        anchor: { kind: "region" },
      },
    });
    expect(messages).toHaveLength(before);
    window.innerWidth = 600;
    windowHandlers.resize!({});
    expect(messages.at(-1).type).toBe("anchor-unavailable");
  });
});
