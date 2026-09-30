import { describe, expect, it } from "vitest";
import { type Bounds, place } from "../src/layout";

// A 2 x 4 unit model canvas centered on the origin.
const bounds: Bounds = { left: -1, top: 2, width: 2, height: 4 };

function toClip(matrix: Float32Array, x: number, y: number): [number, number] {
  return [matrix[0]! * x + matrix[12]!, matrix[5]! * y + matrix[13]!];
}

describe("place", () => {
  it("contains the whole canvas, centered", () => {
    const { rect, matrix } = place({ width: 400, height: 400 }, bounds);
    expect(rect).toEqual({ x: 100, y: 0, width: 200, height: 400 });
    expect(toClip(matrix, -1, 2)).toEqual([-0.5, 1]);
    expect(toClip(matrix, 1, -2)).toEqual([0.5, -1]);
  });

  it("covers by the wider side", () => {
    const { rect } = place({ width: 400, height: 400 }, bounds, { fit: "cover" });
    expect(rect).toEqual({ x: 0, y: -200, width: 400, height: 800 });
  });

  it("fits a frame and aligns it to the bottom", () => {
    // The upper half: 2 x 2 units, scaled to 300 x 300 in a 600 x 300 view.
    const { rect, toModel } = place({ width: 600, height: 300 }, bounds, { frame: [0, 0, 1, 0.5], align: [0.5, 1] });
    expect(rect).toEqual({ x: 150, y: 0, width: 300, height: 300 });
    expect(toModel(150, 0)).toEqual([-1, 2]);
    expect(toModel(450, 300)).toEqual([1, 0]);
  });

  it("applies scale and offset after fitting", () => {
    const { rect } = place({ width: 400, height: 400 }, bounds, { scale: 0.5, offset: [10, -20], align: [0, 0] });
    expect(rect).toEqual({ x: 10, y: -20, width: 100, height: 200 });
  });

  it("round-trips canvas points through the matrix", () => {
    const view = { width: 320, height: 240 };
    const { matrix, toModel } = place(view, bounds, { frame: [0.1, 0.2, 0.5, 0.3], fit: "width", align: [0.3, 0.7] });
    const [u, v] = toModel(200, 100);
    const [cx, cy] = toClip(matrix, u, v);
    expect(((cx + 1) / 2) * view.width).toBeCloseTo(200);
    expect(((1 - cy) / 2) * view.height).toBeCloseTo(100);
  });

  it("maps model units back to the canvas", () => {
    const { toModel, toCanvas } = place({ width: 320, height: 240 }, bounds, { frame: [0.1, 0.2, 0.5, 0.3], fit: "cover" });
    const [x, y] = toCanvas(...toModel(200, 100));
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(100);
  });

  it("puts the frame's corners on the rect's", () => {
    const { toCanvas } = place({ width: 600, height: 300 }, bounds, { frame: [0, 0, 1, 0.5], align: [0.5, 1] });
    expect(toCanvas(-1, 2)).toEqual([150, 0]);
    expect(toCanvas(1, 0)).toEqual([450, 300]);
  });
});
