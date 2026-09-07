import { describe, it, expect } from "vitest";
import { repairEmbeddedImages } from "./image-repair";
describe("spec 014 embedded image URL repair", () => {
  it("repairs a missing inner URL quote without touching the outer attribute", () => {
    const source = `<div style="background-image:url('data:image/jpeg;base64,YQ==)"></div>`;
    expect(repairEmbeddedImages(source)).toEqual({
      count: 1,
      source: `<div style="background-image:url('data:image/jpeg;base64,YQ==')"></div>`,
    });
  });
  it("repairs only the extra closing bracket in CSS and is idempotent", () => {
    const bad = "url('data:image/jpeg;base64,YQ==)')";
    const source = `<style>.bg{background-image:${bad}}</style><div style="background:${bad}">keep</div><script>const x="${bad}";</script><p>${bad}</p>`;
    const result = repairEmbeddedImages(source);
    expect(result.count).toBe(2);
    expect(result.source).toContain(
      `<script>const x="${bad}";</script><p>${bad}</p>`,
    );
    expect(repairEmbeddedImages(result.source).count).toBe(0);
  });
  it("leaves valid, malformed and external URLs unchanged", () => {
    const source = `<div style="background:url('data:image/jpeg;base64,YQ==')"></div><style>a{background:url('https://example.com/a)')}b{background:url('data:image/jpeg;base64,xyz)')}</style>`;
    expect(repairEmbeddedImages(source)).toEqual({ source, count: 0 });
  });
});
