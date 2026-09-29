/**
 * How urgently a motion should play. `idle` yields to everything, `normal` waits
 * for a running `normal` motion to end, `force` interrupts whatever is playing.
 */
export type Priority = "idle" | "normal" | "force";

export type Layout = {
  /**
   * How the frame is scaled into the canvas: `contain` shows all of it, `cover`
   * fills the canvas and crops, `width` and `height` match that side.
   * @default "contain"
   */
  fit?: "contain" | "cover" | "width" | "height" | undefined;
  /**
   * The part of the model's canvas to fit, as `[left, top, width, height]`
   * fractions of it. `[0, 0, 1, 0.5]` fits the upper half.
   * @default [0, 0, 1, 1]
   */
  frame?: readonly [number, number, number, number] | undefined;
  /**
   * Where the frame sits in the space left over, from `[0, 0]` (top left) to
   * `[1, 1]` (bottom right).
   * @default [0.5, 0.5]
   */
  align?: readonly [number, number] | undefined;
  /** Multiplies the fitted size. @default 1 */
  scale?: number | undefined;
  /** Shifts the model, in CSS pixels. @default [0, 0] */
  offset?: readonly [number, number] | undefined;
};

export type Live2DOptions = {
  layout?: Layout | undefined;
  /**
   * What the model's eyes and head follow: the pointer anywhere on the page, only
   * over the canvas, or nothing.
   * @default "window"
   */
  follow?: "window" | "canvas" | false | undefined;
  /**
   * The motion group played whenever nothing else is, matched in any case.
   * By default "idle", if the model has one. A change takes over once the
   * motion playing ends.
   */
  idle?: string | false | undefined;
  /**
   * Drawing-buffer pixels per CSS pixel.
   * @default Math.min(devicePixelRatio, 2)
   */
  pixelRatio?: number | undefined;
  /** Logs Cubism's messages to the console. @default false */
  debug?: boolean | undefined;
};

export type LoadOptions = {
  /** Abandons the load. The promise rejects with an `AbortError`. */
  signal?: AbortSignal;
  /** Replaces the layout for this model. */
  layout?: Layout;
  /**
   * Parameters the lip sync opens, when the model does not list any in its
   * LipSync group. By default `ParamMouthOpenY`, if the model has it.
   */
  mouth?: readonly string[];
};

export type MotionOptions = {
  /** The motion's index in its group. Random by default, avoiding the last one played. */
  index?: number | undefined;
  /** @default "normal" */
  priority?: Priority | undefined;
};

export type ModelInfo = {
  url: string;
  /**
   * Each motion group's motions in index order, named by file without its folder or
   * `.motion3.json`. Motions have no names of their own, so these are labels, not keys.
   */
  motions: Readonly<Record<string, readonly string[]>>;
  expressions: readonly string[];
  hitAreas: readonly string[];
  parameters: readonly string[];
  /** The model's canvas in its own pixels. */
  width: number;
  height: number;
};

export type TapEvent = {
  /** CSS pixels from the canvas's top left. */
  x: number;
  y: number;
  /** The hit areas under the point, in the order the model lists them. */
  hitAreas: string[];
  event: PointerEvent;
};

export type MotionEvent = { group: string; index: number };

export type Live2DEvents = {
  load: ModelInfo;
  error: unknown;
  tap: TapEvent;
  motionstart: MotionEvent;
  motionend: MotionEvent;
  /** A user event fired from a motion's timeline. */
  motionevent: string;
};
