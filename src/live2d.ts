import { Emitter } from "./emitter";
import { type Placement, place } from "./layout";
import { Mouth, type Voice } from "./mouth";
import type { Layout, Live2DEvents, Live2DOptions, LoadOptions, ModelInfo, MotionOptions } from "./types";
import type { Model } from "./model";

type Runtime = typeof import("./model");
type Events = HTMLElementEventMap & { webglcontextlost: WebGLContextEvent; webglcontextrestored: WebGLContextEvent };

// The newest Core the bundled Framework is written for; older ones lack blend modes.
const CORE_MAJOR = 6;
// Longer gaps (a background tab, a breakpoint) are replayed as one short step so physics does not explode.
const MAX_STEP_S = 1 / 10;
// A press that moves further than this is a drag, not a tap.
const TAP_SLOP_PX = 10;

let runtime: Promise<Runtime> | undefined;

/**
 * Loads the Cubism Core, then the Framework, which reads the Core's global while it
 * evaluates. Both are split into their own chunks and only load on first use.
 */
function loadRuntime(): Promise<Runtime> {
  runtime ??= (async () => {
    const scope = globalThis as { Live2DCubismCore?: typeof Live2DCubismCore };
    if (scope.Live2DCubismCore) {
      // Another script got there first; there can only be one Core per page.
      const major = scope.Live2DCubismCore.Version.csmGetVersion() >>> 24;
      if (major < CORE_MAJOR) {
        console.warn(`moe-widget: the page already loaded Cubism Core ${major}, older than ${CORE_MAJOR}. Models using blend modes will not render correctly.`);
      }
    } else {
      scope.Live2DCubismCore = (await import("../cubism/core.js")).default;
    }
    return import("./model");
  })();
  runtime.catch(() => {
    runtime = undefined;
  });
  return runtime;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * One Live2D model on one canvas. Create it with `Live2D.create`, then `load` a
 * model3.json. The canvas is sized by CSS; the drawing buffer follows it.
 */
export class Live2D extends Emitter<Live2DEvents> {
  readonly canvas: HTMLCanvasElement;

  #runtime: Runtime;
  #gl: WebGLRenderingContext;
  #options: Live2DOptions;
  #debug: boolean;
  #model: Model | null = null;
  #loading: AbortController | null = null;
  #layout: Layout;
  #placement: Placement | null = null;
  #mouth = new Mouth();
  #cleanup: Array<() => void> = [];
  #size = { width: 0, height: 0 };
  #frame = 0;
  #last = 0;
  #paused = false;
  #visible = true;
  #lost = false;
  #destroyed = false;

  /** Loads the Cubism runtime on first use and binds to the canvas. */
  static async create(canvas: HTMLCanvasElement, options: Live2DOptions = {}): Promise<Live2D> {
    return new Live2D(canvas, options, await loadRuntime());
  }

  private constructor(canvas: HTMLCanvasElement, options: Live2DOptions, runtime: Runtime) {
    super();
    const attributes: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
    };
    const gl = canvas.getContext("webgl2", attributes) ?? canvas.getContext("webgl", attributes);
    if (!gl) throw new Error("moe-widget: this browser or canvas cannot create a WebGL context");

    this.canvas = canvas;
    this.#gl = gl;
    this.#runtime = runtime;
    this.#options = options;
    this.#debug = options.debug ?? false;
    this.#layout = options.layout ?? {};
    runtime.acquire(this.#debug);

    this.#observe();
    this.#listen();
    this.#frame = requestAnimationFrame(this.#tick);
  }

  /** The loaded model, or null before the first load completes. */
  get model(): ModelInfo | null {
    return this.#model?.info ?? null;
  }

  get layout(): Layout {
    return this.#layout;
  }

  set layout(layout: Layout) {
    this.#layout = layout;
    this.#placement = null;
  }

  /** How open the mouth is, 0 to 1, on top of any voice playing. */
  get mouth(): number {
    return this.#mouth.manual;
  }

  set mouth(value: number) {
    this.#mouth.manual = Math.max(0, Math.min(1, value));
  }

  get paused(): boolean {
    return this.#paused;
  }

  /**
   * Loads a model3.json and swaps it in once everything is ready; the previous
   * model stays on screen until then. A newer load aborts an older one.
   */
  async load(url: string, options: LoadOptions = {}): Promise<ModelInfo> {
    this.#assertAlive();
    this.#loading?.abort();
    const controller = new AbortController();
    this.#loading = controller;
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });

    try {
      const model = await this.#runtime.Model.load(url, {
        gl: this.#gl,
        width: this.canvas.width,
        height: this.canvas.height,
        signal: controller.signal,
        idle: this.#options.idle,
        mouth: options.mouth,
        hooks: {
          motionStart: (group, index) => this.emit("motionstart", { group, index }),
          motionEnd: (group, index) => this.emit("motionend", { group, index }),
          motionEvent: (value) => this.emit("motionevent", value),
          mouth: (dt) => this.#mouth.value(dt),
        },
      });
      // A load that finished just as it was aborted still has to be thrown away.
      if (controller.signal.aborted) {
        model.release();
        throw new DOMException("The model load was aborted.", "AbortError");
      }
      this.#model?.release();
      this.#model = model;
      if (options.layout) this.#layout = options.layout;
      this.#placement = null;
      this.emit("load", model.info);
      return model.info;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) this.emit("error", error);
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
      if (this.#loading === controller) this.#loading = null;
    }
  }

  /**
   * Plays a motion from a group. Resolves true when it finishes, or false if a
   * motion of equal or higher priority kept it from starting, or it was cut off.
   */
  motion(group: string, options?: MotionOptions): Promise<boolean> {
    return this.#require().startMotion(group, options);
  }

  /** Sets an expression by name, a random one when called with no name, or clears it with null. */
  expression(name?: string | null): void {
    const model = this.#require();
    if (name === undefined) {
      const names = model.info.expressions;
      if (names.length === 0) return;
      name = names[Math.floor(Math.random() * names.length)]!;
    }
    model.setExpression(name);
  }

  /** Holds a parameter at a value over motions and effects, or releases it with null. */
  setParameter(id: string, value: number | null): void {
    this.#require().setParameter(id, value);
  }

  /** The model's hit areas under a point in viewport coordinates, such as a pointer event's clientX and clientY. */
  hitTest(clientX: number, clientY: number): string[] {
    const model = this.#require();
    const bounds = this.canvas.getBoundingClientRect();
    return model.hitAreasAt(...this.#place().toModel(clientX - bounds.left, clientY - bounds.top));
  }

  /** Turns the model toward a point in viewport coordinates, or back to the front with null. */
  lookAt(clientX: number | null, clientY?: number): void {
    const model = this.#model;
    if (!model) return;
    if (clientX === null || clientY === undefined) {
      model.look(0, 0);
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const { rect } = this.#place();
    const x = clientX - bounds.left - (rect.x + rect.width / 2);
    const y = clientY - bounds.top - (rect.y + rect.height / 2);
    model.look(clamp(x / (rect.width / 2)), clamp(-y / (rect.height / 2)));
  }

  /**
   * Plays a voice (a URL or a media element) or listens to a stream, and moves
   * the lips with it. Resolves when it ends, is stopped, or another voice starts.
   */
  speak(voice: Voice, options: { signal?: AbortSignal } = {}): Promise<void> {
    this.#assertAlive();
    return this.#mouth.speak(voice, options.signal);
  }

  /** Stops the voice started by `speak`. */
  hush(): void {
    this.#mouth.stop();
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  /**
   * Releases the model, the listeners, and what the framework holds for this
   * canvas. Safe to call at any time, including mid-load.
   */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    cancelAnimationFrame(this.#frame);
    this.#loading?.abort();
    this.#mouth.stop();
    for (const cleanup of this.#cleanup) cleanup();
    this.#model?.release();
    this.#model = null;
    this.#runtime.forget(this.#gl);
    this.#runtime.release(this.#debug);
    this.clear();
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error("moe-widget: this Live2D instance was destroyed");
  }

  #require(): Model {
    this.#assertAlive();
    if (!this.#model) throw new Error("moe-widget: no model is loaded yet; await load() first");
    return this.#model;
  }

  #place(): Placement {
    this.#placement ??= place(this.#size, this.#model!.bounds, this.#layout);
    return this.#placement;
  }

  #resize(width: number, height: number): void {
    const ratio = this.#options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2);
    this.#size = { width, height };
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.#placement = null;
  }

  #observe(): void {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    // A canvas with no CSS size is as big as its drawing buffer, which this sizes
    // from the CSS size: it would grow every frame. Pin it where it is instead.
    const style = getComputedStyle(canvas);
    if (style.width === `${canvas.width}px` && style.height === `${canvas.height}px` && !canvas.style.width) {
      canvas.style.width = style.width;
      canvas.style.height = style.height;
    }
    this.#resize(rect.width || this.canvas.width, rect.height || this.canvas.height);

    const resize = new ResizeObserver(([entry]) => {
      if (entry) this.#resize(entry.contentRect.width, entry.contentRect.height);
    });
    resize.observe(this.canvas);

    // Nothing to draw for a canvas scrolled away or hidden.
    const intersect = new IntersectionObserver(([entry]) => {
      if (entry) this.#visible = entry.isIntersecting;
    });
    intersect.observe(this.canvas);

    this.#cleanup.push(
      () => resize.disconnect(),
      () => intersect.disconnect(),
    );
  }

  #on<K extends keyof Events>(
    target: HTMLElement | Window,
    type: K,
    listener: (event: Events[K]) => void,
  ): void {
    target.addEventListener(type, listener as EventListener);
    this.#cleanup.push(() => target.removeEventListener(type, listener as EventListener));
  }

  #listen(): void {
    const canvas = this.canvas;

    this.#on(canvas, "webglcontextlost", (event) => {
      // Without preventDefault the context never comes back.
      event.preventDefault();
      this.#lost = true;
    });
    this.#on(canvas, "webglcontextrestored", () => {
      this.#lost = false;
      this.#runtime.forget(this.#gl);
      this.#model?.restore();
    });

    let press: { id: number; x: number; y: number } | null = null;
    this.#on(canvas, "pointerdown", (event) => {
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    this.#on(canvas, "pointerup", (event) => {
      const start = press;
      press = null;
      if (!start || start.id !== event.pointerId || !this.#model) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;
      const bounds = canvas.getBoundingClientRect();
      this.emit("tap", {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        hitAreas: this.hitTest(event.clientX, event.clientY),
        event,
      });
    });

    const follow = this.#options.follow ?? "window";
    if (follow === false) return;
    const target = follow === "window" ? window : canvas;
    this.#on(target, "pointermove", (event) => this.lookAt(event.clientX, event.clientY));
    if (follow === "window") {
      // mouseout with no relatedTarget means the pointer left the page.
      this.#on(document.documentElement, "mouseout", (event) => {
        if (!event.relatedTarget) this.lookAt(null);
      });
    } else {
      this.#on(canvas, "pointerleave", () => this.lookAt(null));
    }
  }

  #tick = (now: number): void => {
    this.#frame = requestAnimationFrame(this.#tick);
    const deltaSeconds = this.#last ? Math.min((now - this.#last) / 1000, MAX_STEP_S) : 0;
    this.#last = now;

    const model = this.#model;
    if (this.#paused || !this.#visible || this.#lost || !model || this.#gl.isContextLost()) return;

    const gl = this.#gl;
    const { width, height } = this.canvas;
    model.resize(width, height);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    model.update(deltaSeconds);
    model.draw(this.#place().matrix);
  };
}
