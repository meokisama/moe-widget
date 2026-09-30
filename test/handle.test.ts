import { describe, expect, it, vi } from "vitest";
import { handleOf } from "../src/handle";
import type { Live2D } from "../src/live2d";

function fake() {
  return {
    canvas: {} as HTMLCanvasElement,
    model: null,
    mouth: 0,
    motion: vi.fn(async () => true),
    expression: vi.fn(),
    bounds: vi.fn(() => ({ x: 1, y: 2, width: 3, height: 4 })),
    load: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("handleOf", () => {
  it("returns the same handle for the same instance", () => {
    const live2d = fake() as unknown as Live2D;
    expect(handleOf(live2d)).toBe(handleOf(live2d));
  });

  it("forwards calls and live state to the instance", async () => {
    const live2d = fake();
    const handle = handleOf(live2d as unknown as Live2D);
    await expect(handle.motion("TapBody", { priority: "force" })).resolves.toBe(true);
    expect(live2d.motion).toHaveBeenCalledWith("TapBody", { priority: "force" });
    await handle.motion(["Wave", "Laugh"]);
    expect(live2d.motion).toHaveBeenLastCalledWith(["Wave", "Laugh"], undefined);
    expect(handle.bounds()).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    handle.mouth = 0.5;
    expect(live2d.mouth).toBe(0.5);
    live2d.mouth = 0.25;
    expect(handle.mouth).toBe(0.25);
  });

  it("leaves out what the component owns", () => {
    const handle = handleOf(fake() as unknown as Live2D);
    expect(handle).not.toHaveProperty("load");
    expect(handle).not.toHaveProperty("destroy");
    expect(handle).not.toHaveProperty("layout");
    expect(Object.isFrozen(handle)).toBe(true);
  });
});
