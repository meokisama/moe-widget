// Everything that touches the Cubism Framework. Its modules read the Core's global
// while they evaluate, so this file is only ever imported after the Core is loaded.

import { CubismModelSettingJson } from "../cubism/cubismmodelsettingjson";
import { BreathParameterData, CubismBreath } from "../cubism/effect/cubismbreath";
import { CubismEyeBlink } from "../cubism/effect/cubismeyeblink";
import { CubismLook, LookParameterData } from "../cubism/effect/cubismlook";
import type { CubismIdHandle } from "../cubism/id/cubismid";
import { CubismFramework, LogLevel, Option } from "../cubism/live2dcubismframework";
import { CubismMatrix44 } from "../cubism/math/cubismmatrix44";
import { CubismUserModel } from "../cubism/model/cubismusermodel";
import type { ACubismMotion } from "../cubism/motion/acubismmotion";
import { CubismBreathUpdater } from "../cubism/motion/cubismbreathupdater";
import { CubismExpressionUpdater } from "../cubism/motion/cubismexpressionupdater";
import { CubismEyeBlinkUpdater } from "../cubism/motion/cubismeyeblinkupdater";
import { CubismLipSyncUpdater } from "../cubism/motion/cubismlipsyncupdater";
import { CubismLookUpdater } from "../cubism/motion/cubismlookupdater";
import type { CubismMotion } from "../cubism/motion/cubismmotion";
import { InvalidMotionQueueEntryHandleValue } from "../cubism/motion/cubismmotionqueuemanager";
import { CubismPhysicsUpdater } from "../cubism/motion/cubismphysicsupdater";
import { CubismPoseUpdater } from "../cubism/motion/cubismposeupdater";
import { CubismUpdateScheduler } from "../cubism/motion/cubismupdatescheduler";
import { IParameterProvider } from "../cubism/motion/iparameterprovider";
import { CubismWebGLOffscreenManager } from "../cubism/rendering/cubismoffscreenmanager";
import { CubismShaderManager_WebGL } from "../cubism/rendering/cubismshader_webgl";
import type { Bounds } from "./layout";
import type { ModelInfo, MotionOptions, Priority } from "./types";

// ---------------------------------------------------------------------------
// Framework lifetime

const option = new Option();
option.logFunction = (message: string) => console.debug(`[Cubism] ${message.trimEnd()}`);
option.loggingLevel = LogLevel.LogLevel_Warning;

let users = 0;
let debugging = 0;

/**
 * The framework is one global. Counting its users means a canvas destroyed while
 * another is loading can never dispose it under the other.
 */
export function acquire(debug: boolean): void {
  if (debug) debugging++;
  option.loggingLevel = debugging > 0 ? LogLevel.LogLevel_Verbose : LogLevel.LogLevel_Warning;
  if (users++ === 0) {
    CubismFramework.startUp(option);
    CubismFramework.initialize();
  }
}

export function release(debug: boolean): void {
  if (debug) debugging--;
  option.loggingLevel = debugging > 0 ? LogLevel.LogLevel_Verbose : LogLevel.LogLevel_Warning;
  if (--users === 0) CubismFramework.dispose();
}

/** Frees what the framework keeps per WebGL context. */
export function forget(gl: WebGLRenderingContext): void {
  CubismShaderManager_WebGL.getInstance().removeGlContext(gl);
  CubismWebGLOffscreenManager.getInstance().removeContext(gl);
}

// ---------------------------------------------------------------------------
// Model

const PRIORITY: Record<Priority, number> = { idle: 1, normal: 2, force: 3 };
const PRIORITY_NONE = 0;

export type Hooks = {
  motionStart(group: string, index: number): void;
  motionEnd(group: string, index: number): void;
  motionEvent(value: string): void;
  /** The mouth opening this frame, 0 to 1. */
  mouth(deltaSeconds: number): number;
};

export type ModelSetup = {
  gl: WebGLRenderingContext;
  width: number;
  height: number;
  signal?: AbortSignal | undefined;
  idle?: string | false | undefined;
  mouth?: readonly string[] | undefined;
  hooks: Hooks;
};

function abortError(): DOMException {
  return new DOMException("The model load was aborted.", "AbortError");
}

async function fetchOk(url: URL, signal: AbortSignal | undefined): Promise<Response> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw new Error(`moe-widget: ${response.status} ${response.statusText} for ${url}`);
  return response;
}

async function fetchBuffer(url: URL, signal: AbortSignal | undefined): Promise<ArrayBuffer> {
  return (await fetchOk(url, signal)).arrayBuffer();
}

class MouthProvider extends IParameterProvider {
  value = 0;
  constructor(readonly read: (deltaSeconds: number) => number) {
    super();
  }
  update(deltaSeconds = 0): boolean {
    this.value = this.read(deltaSeconds);
    return true;
  }
  getParameter(): number {
    return this.value;
  }
}

export class Model extends CubismUserModel {
  info!: ModelInfo;
  bounds!: Bounds;

  #gl: WebGLRenderingContext;
  #base!: URL;
  #setting!: CubismModelSettingJson;
  #hooks: Hooks;
  #signal: AbortSignal | undefined;
  #scheduler = new CubismUpdateScheduler();
  #look: CubismLook | null = null;
  #motionUpdated = false;
  #idle: string | null = null;
  #eyeBlinkIds: CubismIdHandle[] = [];
  #lipSyncIds: CubismIdHandle[] = [];
  #motions = new Map<string, Promise<CubismMotion | null>>();
  #ready = new Map<string, CubismMotion>();
  #pending = new Map<CubismMotion, Array<(finished: boolean) => void>>();
  #last = new Map<string, number>();
  #expressions = new Map<string, ACubismMotion>();
  #overrides = new Map<string, number>();
  #images: ImageBitmap[] = [];
  #textures: WebGLTexture[] = [];
  #size: [number, number] = [0, 0];
  #released = false;

  private constructor(gl: WebGLRenderingContext, hooks: Hooks, signal: AbortSignal | undefined) {
    super();
    this.#gl = gl;
    this.#hooks = hooks;
    this.#signal = signal;
    this._mocConsistency = true;
    this._motionConsistency = true;
  }

  /** Loads a model3.json and everything it references. Rejects rather than hanging. */
  static async load(url: string, setup: ModelSetup): Promise<Model> {
    const model = new Model(setup.gl, setup.hooks, setup.signal);
    try {
      await model.#load(url, setup);
      return model;
    } catch (error) {
      model.release();
      throw error;
    }
  }

  #check(): void {
    if (this.#released || this.#signal?.aborted) throw abortError();
  }

  async #load(url: string, setup: ModelSetup): Promise<void> {
    const signal = setup.signal;
    const id = (name: string) => CubismFramework.getIdManager().getId(name);
    this.#base = new URL(url, document.baseURI);
    const file = (name: string) => new URL(name, this.#base);

    const json = await fetchBuffer(this.#base, signal);
    this.#check();
    const setting = new CubismModelSettingJson(json, json.byteLength);
    this.#setting = setting;

    const mocName = setting.getModelFileName();
    if (!mocName) throw new Error(`moe-widget: ${url} names no .moc3 file`);

    // Everything but the moc is optional, so fetch it all at once.
    const optional = (name: string) => (name ? fetchBuffer(file(name), signal) : Promise.resolve(null));
    const expressionNames = Array.from({ length: setting.getExpressionCount() }, (_, i) => setting.getExpressionName(i));
    const textureNames = Array.from({ length: setting.getTextureCount() }, (_, i) => setting.getTextureFileName(i));
    const [moc, physics, pose, userData, expressions, images] = await Promise.all([
      fetchBuffer(file(mocName), signal),
      optional(setting.getPhysicsFileName()),
      optional(setting.getPoseFileName()),
      optional(setting.getUserDataFile()),
      Promise.all(expressionNames.map((_, i) => fetchBuffer(file(setting.getExpressionFileName(i)), signal))),
      Promise.all(textureNames.map((name) => (name ? this.#loadImage(file(name), signal) : null))),
    ]);
    this.#images = images.filter((image): image is ImageBitmap => image !== null);
    this.#check();

    this.loadModel(moc, this._mocConsistency);
    if (!this._model) {
      throw new Error(`moe-widget: ${mocName} is not a valid .moc3, or is newer than this Cubism Core supports`);
    }
    // The layout owns placement, so model units go straight to the projection.
    this._modelMatrix.loadIdentity();

    expressionNames.forEach((name, i) => {
      const buffer = expressions[i]!;
      const motion = this.loadExpression(buffer, buffer.byteLength, name);
      if (motion) this.#expressions.set(name, motion);
    });
    this.#scheduler.addUpdatableList(new CubismExpressionUpdater(this._expressionManager));

    if (physics) {
      this.loadPhysics(physics, physics.byteLength);
      if (this._physics) this.#scheduler.addUpdatableList(new CubismPhysicsUpdater(this._physics));
    }
    if (pose) {
      this.loadPose(pose, pose.byteLength);
      if (this._pose) this.#scheduler.addUpdatableList(new CubismPoseUpdater(this._pose));
    }
    if (userData) this.loadUserData(userData, userData.byteLength);

    for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) {
      this.#eyeBlinkIds.push(setting.getEyeBlinkParameterId(i));
    }
    if (this.#eyeBlinkIds.length > 0) {
      this._eyeBlink = CubismEyeBlink.create(setting);
      this.#scheduler.addUpdatableList(new CubismEyeBlinkUpdater(() => this.#motionUpdated, this._eyeBlink));
    }

    // Standard breathing and look-at weights, the same as Live2D's samples.
    this._breath = CubismBreath.create();
    this._breath.setParameters([
      new BreathParameterData(id("ParamAngleX"), 0, 15, 6.5345, 0.5),
      new BreathParameterData(id("ParamAngleY"), 0, 8, 3.5345, 0.5),
      new BreathParameterData(id("ParamAngleZ"), 0, 10, 5.5345, 0.5),
      new BreathParameterData(id("ParamBodyAngleX"), 0, 4, 15.5345, 0.5),
      new BreathParameterData(id("ParamBreath"), 0.5, 0.5, 3.2345, 1),
    ]);
    this.#scheduler.addUpdatableList(new CubismBreathUpdater(this._breath));

    this.#look = CubismLook.create();
    this.#look.setParameters([
      new LookParameterData(id("ParamAngleX"), 30, 0, 0),
      new LookParameterData(id("ParamAngleY"), 0, 30, 0),
      new LookParameterData(id("ParamAngleZ"), 0, 0, -30),
      new LookParameterData(id("ParamBodyAngleX"), 10, 0, 0),
      new LookParameterData(id("ParamEyeBallX"), 1, 0, 0),
      new LookParameterData(id("ParamEyeBallY"), 0, 1, 0),
    ]);
    this.#scheduler.addUpdatableList(new CubismLookUpdater(this.#look, this._dragManager));

    const parameters = Array.from({ length: this._model.getParameterCount() }, (_, i) =>
      this._model.getParameterId(i).getString(),
    );
    for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
      this.#lipSyncIds.push(setting.getLipSyncParameterId(i));
    }
    if (this.#lipSyncIds.length === 0) {
      const fallback = setup.mouth ?? ["ParamMouthOpenY"];
      this.#lipSyncIds = fallback.filter((name) => parameters.includes(name)).map(id);
    }
    if (this.#lipSyncIds.length > 0) {
      this.#scheduler.addUpdatableList(
        new CubismLipSyncUpdater(this.#lipSyncIds, new MouthProvider((dt) => this.#hooks.mouth(dt))),
      );
    }
    this.#scheduler.sortUpdatableList();

    const groups = Array.from({ length: setting.getMotionGroupCount() }, (_, i) => setting.getMotionGroupName(i));
    this.#idle =
      setup.idle === false
        ? null
        : setup.idle !== undefined
          ? groups.includes(setup.idle)
            ? setup.idle
            : null
          : (groups.find((group) => group.toLowerCase() === "idle") ?? null);
    // Only the idle motions load up front; the rest load the first time they play.
    if (this.#idle) {
      const idle = this.#idle;
      await Promise.all(Array.from({ length: setting.getMotionCount(idle) }, (_, i) => this.#motion(idle, i)));
      this.#check();
    }

    this.#uploadTextures();
    this.resize(setup.width, setup.height);

    const canvas = this._model.getModel().canvasinfo;
    const unit = canvas.PixelsPerUnit;
    this.bounds = {
      left: -canvas.CanvasOriginX / unit,
      top: canvas.CanvasOriginY / unit,
      width: canvas.CanvasWidth / unit,
      height: canvas.CanvasHeight / unit,
    };
    this.info = {
      url: this.#base.href,
      motions: Object.fromEntries(groups.map((group) => [group, setting.getMotionCount(group)])),
      expressions: [...this.#expressions.keys()],
      hitAreas: Array.from({ length: setting.getHitAreasCount() }, (_, i) => setting.getHitAreaName(i)),
      parameters,
      width: canvas.CanvasWidth,
      height: canvas.CanvasHeight,
    };
  }

  async #loadImage(url: URL, signal: AbortSignal | undefined): Promise<ImageBitmap> {
    const blob = await (await fetchOk(url, signal)).blob();
    // Premultiplied like Live2D's samples; the renderer is told the same below.
    return createImageBitmap(blob, { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" });
  }

  #uploadTextures(): void {
    const gl = this.#gl;
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this.#textures = this.#images.map((image) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("moe-widget: could not create a WebGL texture");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // WebGL 1 can only mipmap power-of-two textures.
      const pot = (n: number) => (n & (n - 1)) === 0;
      if (webgl2 || (pot(image.width) && pot(image.height))) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture;
    });
  }

  #deleteTextures(): void {
    for (const texture of this.#textures) this.#gl.deleteTexture(texture);
    this.#textures = [];
  }

  /** Sizes the renderer to the drawing buffer. Blend-mode offscreens are made at this size. */
  resize(width: number, height: number): void {
    if (this.#size[0] === width && this.#size[1] === height && this.getRenderer()) return;
    this.#size = [width, height];
    this.createRenderer(width, height);
    const renderer = this.getRenderer();
    renderer.startUp(this.#gl);
    renderer.setIsPremultipliedAlpha(true);
    this.#textures.forEach((texture, i) => renderer.bindTexture(i, texture));
    // Compiles in a few microtasks; draw() waits for it rather than warning per drawable.
    renderer.loadShaders();
  }

  /** Rebuilds every GPU resource after the WebGL context comes back. */
  restore(): void {
    this.#textures = [];
    this.deleteRenderer();
    this.#uploadTextures();
    const [width, height] = this.#size;
    this.#size = [0, 0];
    this.resize(width, height);
  }

  #motion(group: string, index: number): Promise<CubismMotion | null> {
    const key = `${group}\u0000${index}`;
    let loading = this.#motions.get(key);
    if (!loading) {
      const name = this.#setting.getMotionFileName(group, index);
      loading = fetchBuffer(new URL(name, this.#base), undefined).then((buffer) => {
        if (this.#released) return null;
        const motion = this.loadMotion(
          buffer,
          buffer.byteLength,
          key,
          undefined,
          undefined,
          this.#setting,
          group,
          index,
          this._motionConsistency,
        );
        if (!motion) return null;
        motion.setEffectIds(this.#eyeBlinkIds, this.#lipSyncIds);
        motion.setBeganMotionHandler(() => this.#hooks.motionStart(group, index));
        motion.setFinishedMotionHandler(() => {
          this.#hooks.motionEnd(group, index);
          const waiting = this.#pending.get(motion);
          this.#pending.delete(motion);
          for (const resolve of waiting ?? []) resolve(true);
        });
        this.#ready.set(key, motion);
        return motion;
      });
      // A failed file can be retried the next time it plays.
      loading.catch(() => this.#motions.delete(key));
      this.#motions.set(key, loading);
    }
    return loading;
  }

  #pick(group: string, count: number): number {
    const last = this.#last.get(group);
    if (count === 1 || last === undefined) return Math.floor(Math.random() * count);
    // Draw from the other count - 1 and step over the last one.
    const next = Math.floor(Math.random() * (count - 1));
    return next >= last ? next + 1 : next;
  }

  /** Plays a motion. Resolves true once it finishes, false if it could not start. */
  async startMotion(group: string, options: MotionOptions = {}): Promise<boolean> {
    const count = this.#setting.getMotionCount(group);
    if (count === 0) throw new RangeError(`moe-widget: the model has no motion group "${group}"`);
    const index = options.index ?? this.#pick(group, count);
    if (index < 0 || index >= count) throw new RangeError(`moe-widget: "${group}" has no motion ${index}`);
    const priority = PRIORITY[options.priority ?? "normal"];

    const manager = this._motionManager;
    if (priority === PRIORITY.force) manager.setReservePriority(priority);
    else if (!manager.reserveMotion(priority)) return false;

    let motion: CubismMotion | null;
    try {
      motion = await this.#motion(group, index);
    } catch (error) {
      if (!this.#released) manager.setReservePriority(PRIORITY_NONE);
      throw error;
    }
    if (this.#released) return false;
    if (!motion) {
      manager.setReservePriority(PRIORITY_NONE);
      return false;
    }

    this.#last.set(group, index);
    return new Promise<boolean>((resolve) => {
      const handle = manager.startMotionPriority(motion, false, priority);
      if (handle === InvalidMotionQueueEntryHandleValue) return resolve(false);
      const waiting = this.#pending.get(motion) ?? [];
      waiting.push(resolve);
      this.#pending.set(motion, waiting);
    });
  }

  #startIdle(): void {
    const group = this.#idle;
    if (!group) return;
    const count = this.#setting.getMotionCount(group);
    const index = this.#pick(group, count);
    const motion = this.#ready.get(`${group}\u0000${index}`);
    if (!motion) return;
    this.#last.set(group, index);
    this._motionManager.startMotionPriority(motion, false, PRIORITY.idle);
  }

  setExpression(name: string | null): void {
    if (name === null) {
      this._expressionManager.stopAllMotions();
      return;
    }
    const motion = this.#expressions.get(name);
    if (!motion) throw new RangeError(`moe-widget: the model has no expression "${name}"`);
    this._expressionManager.startMotion(motion, false);
  }

  /** Holds a parameter at a value over whatever motions and effects set, or releases it. */
  setParameter(name: string, value: number | null): void {
    if (value === null) this.#overrides.delete(name);
    else this.#overrides.set(name, value);
  }

  /** Where the eyes and head turn, from -1 to 1 on each axis, y up. */
  look(x: number, y: number): void {
    this.setDragging(x, y);
  }

  /** The hit areas containing a point in model units. */
  hitAreasAt(x: number, y: number): string[] {
    const setting = this.#setting;
    const hits: string[] = [];
    for (let i = 0; i < setting.getHitAreasCount(); i++) {
      if (this.isHit(setting.getHitAreaId(i), x, y)) hits.push(setting.getHitAreaName(i));
    }
    return hits;
  }

  override motionEventFired(value: string): void {
    this.#hooks.motionEvent(value);
  }

  update(deltaSeconds: number): void {
    const model = this._model;
    model.loadParameters();
    this.#motionUpdated = false;
    if (this._motionManager.isFinished()) this.#startIdle();
    else this.#motionUpdated = this._motionManager.updateMotion(model, deltaSeconds);
    model.saveParameters();

    this.#scheduler.onLateUpdate(model, deltaSeconds);

    for (const [name, value] of this.#overrides) {
      model.setParameterValueById(CubismFramework.getIdManager().getId(name), value);
    }
    model.update();
  }

  draw(matrix: Float32Array): void {
    const gl = this.#gl;
    if (!CubismShaderManager_WebGL.getInstance().getShader(gl)?._isShaderLoaded) return;
    const renderer = this.getRenderer();
    const offscreen = CubismWebGLOffscreenManager.getInstance();
    offscreen.beginFrameProcess(gl);

    const mvp = new CubismMatrix44();
    mvp.setMatrix(matrix);
    renderer.setMvpMatrix(mvp);
    renderer.setRenderState(null as unknown as WebGLFramebuffer, [0, 0, this.#size[0], this.#size[1]]);
    renderer.drawModel();

    offscreen.endFrameProcess(gl);
    offscreen.releaseStaleRenderTextures(gl);
  }

  override release(): void {
    if (this.#released) return;
    this.#released = true;
    for (const waiting of this.#pending.values()) for (const resolve of waiting) resolve(false);
    this.#pending.clear();
    this.#scheduler.release();
    this.#look = null;
    this.#deleteTextures();
    for (const image of this.#images) image.close();
    this.#images = [];
    super.release();
  }
}
