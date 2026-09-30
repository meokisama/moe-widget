import type { Layout } from "./types";

/** A rectangle in model units, y pointing up: `top` is the highest edge. */
export type Bounds = { left: number; top: number; width: number; height: number };

/** A rectangle in CSS pixels, y pointing down. */
export type Rect = { x: number; y: number; width: number; height: number };

export type Placement = {
  /** Column-major 4x4 matrix from model units to clip space. */
  matrix: Float32Array;
  /** Where the layout frame landed on the canvas. */
  rect: Rect;
  /** Converts a canvas point in CSS pixels to model units. */
  toModel(x: number, y: number): [number, number];
  /** Converts a point in model units to CSS pixels on the canvas. */
  toCanvas(u: number, v: number): [number, number];
};

/**
 * Places the model's canvas, or the `frame` part of it, into a view of the given
 * CSS size. Everything is relative, so a layout holds at any canvas size.
 */
export function place(view: { width: number; height: number }, bounds: Bounds, layout: Layout = {}): Placement {
  const [fx, fy, fw, fh] = layout.frame ?? [0, 0, 1, 1];
  const frame = {
    left: bounds.left + fx * bounds.width,
    top: bounds.top - fy * bounds.height,
    width: fw * bounds.width,
    height: fh * bounds.height,
  };

  const byWidth = view.width / frame.width;
  const byHeight = view.height / frame.height;
  const fit = layout.fit ?? "contain";
  const base =
    fit === "cover"
      ? Math.max(byWidth, byHeight)
      : fit === "width"
        ? byWidth
        : fit === "height"
          ? byHeight
          : Math.min(byWidth, byHeight);
  // CSS pixels per model unit.
  const scale = base * (layout.scale ?? 1);

  const [ax, ay] = layout.align ?? [0.5, 0.5];
  const [ox, oy] = layout.offset ?? [0, 0];
  const width = frame.width * scale;
  const height = frame.height * scale;
  const x = (view.width - width) * ax + ox;
  const y = (view.height - height) * ay + oy;

  // px = x + (u - frame.left) * scale, then clip = px / view * 2 - 1, and the same for y flipped.
  const matrix = new Float32Array(16);
  matrix[0] = (2 * scale) / view.width;
  matrix[5] = (2 * scale) / view.height;
  matrix[10] = 1;
  matrix[12] = (2 * (x - frame.left * scale)) / view.width - 1;
  matrix[13] = 1 - (2 * (y + frame.top * scale)) / view.height;
  matrix[15] = 1;

  return {
    matrix,
    rect: { x, y, width, height },
    toModel: (px, py) => [(px - x) / scale + frame.left, frame.top - (py - y) / scale],
    toCanvas: (u, v) => [x + (u - frame.left) * scale, y + (frame.top - v) * scale],
  };
}
