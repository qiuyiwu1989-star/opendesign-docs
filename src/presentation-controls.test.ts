import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresentationControls, PRESENTATION_IDLE_MS } from "./presentation-controls";

describe("spec021 presentation controls", () => {
  afterEach(() => vi.useRealTimers());

  it("hides after idle and resets the timeout on interaction", () => {
    vi.useFakeTimers();
    const change = vi.fn();
    const idle = createPresentationControls(change, () => false);
    idle.wake();
    vi.advanceTimersByTime(2000);
    expect(change).toHaveBeenLastCalledWith(true);
    idle.wake();
    vi.advanceTimersByTime(2000);
    expect(change).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(200);
    expect(change).toHaveBeenLastCalledWith(false);
    idle.wake();
    expect(change).toHaveBeenLastCalledWith(true);
    idle.dispose();
  });

  it("keeps hover/keyboard controls visible and resumes after release", () => {
    vi.useFakeTimers();
    let held = true;
    const change = vi.fn();
    const idle = createPresentationControls(change, () => held);
    idle.wake();
    vi.advanceTimersByTime(PRESENTATION_IDLE_MS);
    expect(change).not.toHaveBeenCalledWith(false);
    held = false;
    idle.wake();
    vi.advanceTimersByTime(PRESENTATION_IDLE_MS);
    expect(change).toHaveBeenLastCalledWith(false);
  });

  it("cancels pending updates when the presentation closes", () => {
    vi.useFakeTimers();
    const change = vi.fn();
    const idle = createPresentationControls(change, () => false);
    idle.wake();
    idle.dispose();
    vi.runAllTimers();
    expect(change).toHaveBeenCalledTimes(1);
  });
});
