import type { Rect } from "./layout";
import type { Live2D } from "./live2d";
import type { Voice } from "./mouth";
import type { ModelInfo, MotionOptions } from "./types";

/**
 * What `Live2DCanvas` gives its ref and callbacks, once a model has loaded.
 * Loading, layout and teardown follow the component's props and
 * lifetime, so they are not part of it.
 */
export type Live2DCanvasHandle = {
  readonly canvas: HTMLCanvasElement;
  /** The model on screen. During a model change it is the old one until the new one loads. */
  readonly model: ModelInfo;
  /** How open the mouth is, 0 to 1, on top of any voice playing. */
  mouth: number;
  /**
   * Plays a motion from a group, or from any of several, matched in any case. Resolves true when
   * it finishes, or false if a motion of equal or higher priority kept it from starting, or it was cut off.
   */
  motion(groups: string | readonly string[], options?: MotionOptions): Promise<boolean>;
  /**
   * The box around what the model drew in its last frame, in CSS pixels from the canvas's
   * top left. It reaches past the canvas where the layout crops. Null when nothing shows.
   */
  bounds(): Rect | null;
  /** Sets an expression by name, a random one when called with no name, or clears it with null. */
  expression(name?: string | null): void;
  /** Holds a parameter at a value over motions and effects, or releases it with null. */
  setParameter(id: string, value: number | null): void;
  /** The model's hit areas under a point in viewport coordinates, such as a pointer event's clientX and clientY. */
  hitTest(clientX: number, clientY: number): string[];
  /** Turns the model toward a point in viewport coordinates, or back to the front with null. */
  lookAt(clientX: number | null, clientY?: number): void;
  /**
   * Plays a voice (a URL or a media element) or listens to a stream, and moves
   * the lips with it. Resolves when it ends, is stopped, or another voice starts.
   */
  speak(voice: Voice, options?: { signal?: AbortSignal | undefined }): Promise<void>;
  /** Stops the voice started by `speak`. */
  hush(): void;
};

const handles = new WeakMap<Live2D, Live2DCanvasHandle>();

/** The one handle for an instance, so the ref and every callback see the same object. */
export function handleOf(live2d: Live2D): Live2DCanvasHandle {
  let handle = handles.get(live2d);
  if (!handle) {
    handle = Object.freeze({
      canvas: live2d.canvas,
      get model() {
        return live2d.model!;
      },
      get mouth() {
        return live2d.mouth;
      },
      set mouth(value: number) {
        live2d.mouth = value;
      },
      motion: (groups, options) => live2d.motion(groups, options),
      bounds: () => live2d.bounds(),
      expression: (name) => live2d.expression(name),
      setParameter: (id, value) => live2d.setParameter(id, value),
      hitTest: (clientX, clientY) => live2d.hitTest(clientX, clientY),
      lookAt: (clientX, clientY) => live2d.lookAt(clientX, clientY),
      speak: (voice, options) => live2d.speak(voice, options),
      hush: () => live2d.hush(),
    } satisfies Live2DCanvasHandle);
    handles.set(live2d, handle);
  }
  return handle;
}
