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
import type { Fetch, ModelInfo, MotionOptions, Priority } from "./types";

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
  /** A motion with a sound started. */
  sound(sound: Blob): void;
  /** Another of the files the load waits for arrived. */
  progress(loaded: number, total: number): void;
  /** The mouth opening this frame, 0 to 1. */
  mouth(deltaSeconds: number): number;
};

export type ModelSetup = {
  gl: WebGLRenderingContext;
  width: number;
  height: number;
  signal?: AbortSignal | undefined;
  fetch: Fetch;
  idle?: string | false | undefined;
  mouth?: readonly string[] | undefined;
  hooks: Hooks;
};

function abortError(): DOMException {
  return new DOMException("The model load was aborted.", "AbortError");
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
  #fetch: Fetch;
  #signal: AbortSignal | undefined;
  #arrived: (() => void) | null = null;
  #scheduler = new CubismUpdateScheduler();
  #look: CubismLook | null = null;
  #motionUpdated = false;
  #groups: string[] = [];
  #idle: string | null = null;
  #eyeBlinkIds: CubismIdHandle[] = [];
  #lipSyncIds: CubismIdHandle[] = [];
  #motions = new Map<string, Promise<CubismMotion | null>>();
  #ready = new Map<string, CubismMotion>();
  #pending = new Map<CubismMotion, Array<(finished: boolean) => void>>();
  // When each motion last started, so a pick can step over the latest one of its pool.
  #played = new Map<string, number>();
  #plays = 0;
  #expressions = new Map<string, ACubismMotion>();
  #overrides = new Map<string, number>();
  #images: ImageBitmap[] = [];
  #textures: WebGLTexture[] = [];
  #size: [number, number] = [0, 0];
  #released = false;

  private constructor(gl: WebGLRenderingContext, setup: ModelSetup) {
    super();
    this.#gl = gl;
    this.#hooks = setup.hooks;
    this.#fetch = setup.fetch;
    this.#signal = setup.signal;
    this._mocConsistency = true;
    this._motionConsistency = true;
  }

  /** Loads a model3.json and everything it references. Rejects rather than hanging. */
  static async load(url: string, setup: ModelSetup): Promise<Model> {
    const model = new Model(setup.gl, setup);
    try {
      await model.#load(url, setup);
      return model;
    } catch (error) {
      model.release();
      throw error;
    }
  }

  async #read<T>(url: URL, signal: AbortSignal | undefined, body: (response: Response) => Promise<T>): Promise<T> {
    const response = await this.#fetch(url, signal ? { signal } : {});
    if (!response.ok) throw new Error(`moe2d: ${response.status} ${response.statusText} for ${url}`);
    const result = await body(response);
    this.#arrived?.();
    return result;
  }

  #buffer(url: URL, signal: AbortSignal | undefined): Promise<ArrayBuffer> {
    return this.#read(url, signal, (response) => response.arrayBuffer());
  }

  #blob(url: URL, signal: AbortSignal | undefined): Promise<Blob> {
    return this.#read(url, signal, (response) => response.blob());
  }

  #check(): void {
    if (this.#released || this.#signal?.aborted) throw abortError();
  }

  async #load(url: string, setup: ModelSetup): Promise<void> {
    const signal = setup.signal;
    const id = (name: string) => CubismFramework.getIdManager().getId(name);
    this.#base = new URL(url, document.baseURI);
    const file = (name: string) => new URL(name, this.#base);

    const json = await this.#buffer(this.#base, signal);
    this.#check();
    const setting = new CubismModelSettingJson(json, json.byteLength);
    this.#setting = setting;

    const mocName = setting.getModelFileName();
    if (!mocName) throw new Error(`moe2d: ${url} names no .moc3 file`);
    this.#groups = Array.from({ length: setting.getMotionGroupCount() }, (_, i) => setting.getMotionGroupName(i));

    // Everything but the moc is optional, so fetch it all at once.
    const optional = (name: string) => (name ? this.#buffer(file(name), signal) : Promise.resolve(null));
    const expressionNames = Array.from({ length: setting.getExpressionCount() }, (_, i) => setting.getExpressionName(i));
    const textureNames = Array.from({ length: setting.getTextureCount() }, (_, i) => setting.getTextureFileName(i));

    // The idle group's motions and sounds load before the model shows, so they count too.
    const idle = setup.idle === false ? undefined : this.#group(setup.idle ?? "idle");
    const idleFiles = Array.from({ length: idle ? setting.getMotionCount(idle) : 0 }, (_, i) =>
      setting.getMotionSoundFileName(idle!, i) ? 2 : 1,
    );
    const total =
      2 +
      [setting.getPhysicsFileName(), setting.getPoseFileName(), setting.getUserDataFile()].filter(Boolean).length +
      expressionNames.length +
      textureNames.filter(Boolean).length +
      idleFiles.reduce((sum, count) => sum + count, 0);
    let loaded = 1;
    this.#hooks.progress(loaded, total);
    this.#arrived = () => this.#hooks.progress(++loaded, total);
    const [moc, physics, pose, userData, expressions, images] = await Promise.all([
      this.#buffer(file(mocName), signal),
      optional(setting.getPhysicsFileName()),
      optional(setting.getPoseFileName()),
      optional(setting.getUserDataFile()),
      Promise.all(expressionNames.map((_, i) => this.#buffer(file(setting.getExpressionFileName(i)), signal))),
      Promise.all(textureNames.map((name) => (name ? this.#loadImage(file(name), signal) : null))),
    ]);
    this.#images = images.filter((image): image is ImageBitmap => image !== null);
    this.#check();

    this.loadModel(moc, this._mocConsistency);
    if (!this._model) {
      throw new Error(`moe2d: ${mocName} is not a valid .moc3, or is newer than this Cubism Core supports`);
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

    const parameters = Array.from({ length: this._model.getParameterCount() }, (_, i) => ({
      id: this._model.getParameterId(i).getString(),
      min: this._model.getParameterMinimumValue(i),
      max: this._model.getParameterMaximumValue(i),
      default: this._model.getParameterDefaultValue(i),
    }));
    for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
      this.#lipSyncIds.push(setting.getLipSyncParameterId(i));
    }
    if (this.#lipSyncIds.length === 0) {
      const fallback = setup.mouth ?? ["ParamMouthOpenY"];
      this.#lipSyncIds = fallback.filter((name) => parameters.some((parameter) => parameter.id === name)).map(id);
    }
    if (this.#lipSyncIds.length > 0) {
      this.#scheduler.addUpdatableList(
        new CubismLipSyncUpdater(this.#lipSyncIds, new MouthProvider((dt) => this.#hooks.mouth(dt))),
      );
    }
    this.#scheduler.sortUpdatableList();

    // Only the idle motions load up front; the rest load the first time they play.
    await this.setIdle(setup.idle);
    this.#arrived = null;
    this.#check();

    this.#uploadTextures();
    this.resize(setup.width, setup.height);
    // Vertices and visibility are only filled in by an update; drawn() may be read before the first frame.
    this._model.update();

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
      motions: Object.fromEntries(
        this.#groups.map((group) => [
          group,
          Array.from({ length: setting.getMotionCount(group) }, (_, i) =>
            setting.getMotionFileName(group, i).replace(/^.*\//, "").replace(/\.motion3\.json$/i, ""),
          ),
        ]),
      ),
      expressions: [...this.#expressions.keys()],
      hitAreas: Array.from({ length: setting.getHitAreasCount() }, (_, i) => setting.getHitAreaName(i)),
      parameters,
      width: canvas.CanvasWidth,
      height: canvas.CanvasHeight,
    };
  }

  async #loadImage(url: URL, signal: AbortSignal | undefined): Promise<ImageBitmap> {
    const blob = await this.#blob(url, signal);
    // Premultiplied like Live2D's samples; the renderer is told the same below.
    return createImageBitmap(blob, { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" });
  }

  #uploadTextures(): void {
    const gl = this.#gl;
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this.#textures = this.#images.map((image) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("moe2d: could not create a WebGL texture");
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
      const soundName = this.#setting.getMotionSoundFileName(group, index);
      loading = Promise.all([
        this.#buffer(new URL(name, this.#base), undefined),
        soundName ? this.#blob(new URL(soundName, this.#base), undefined) : null,
      ]).then(([buffer, sound]) => {
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
        motion.setBeganMotionHandler(() => {
          this.#hooks.motionStart(group, index);
          if (sound) this.#hooks.sound(sound);
        });
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

  /** A motion of the pool at random, never the one of them that played last. */
  #pick(pool: readonly (readonly [string, number])[]): readonly [string, number] {
    let last = -1;
    let latest = 0;
    pool.forEach(([group, index], n) => {
      const played = this.#played.get(`${group}\u0000${index}`) ?? 0;
      if (played > latest) [last, latest] = [n, played];
    });
    if (pool.length === 1 || last < 0) return pool[Math.floor(Math.random() * pool.length)]!;
    // Draw from the other n - 1 and step over the last one.
    const next = Math.floor(Math.random() * (pool.length - 1));
    return pool[next >= last ? next + 1 : next]!;
  }

  #pool(group: string): [string, number][] {
    return Array.from({ length: this.#setting.getMotionCount(group) }, (_, index) => [group, index]);
  }

  #start(motion: CubismMotion, group: string, index: number, priority: number): number {
    this.#played.set(`${group}\u0000${index}`, ++this.#plays);
    return this._motionManager.startMotionPriority(motion, false, priority);
  }

  /** The group as the model spells it: an exact match, or else one in any case. */
  #group(name: string): string | undefined {
    if (this.#groups.includes(name)) return name;
    const lower = name.toLowerCase();
    return this.#groups.find((group) => group.toLowerCase() === lower);
  }

  /**
   * Sets the group played when nothing else is: false for none, undefined for
   * the one named "idle". The motion playing finishes first. Resolves once the
   * group's motions have loaded.
   */
  async setIdle(idle: string | false | undefined): Promise<void> {
    const group = idle === false ? null : (this.#group(idle ?? "idle") ?? null);
    this.#idle = group;
    if (!group) return;
    await Promise.all(Array.from({ length: this.#setting.getMotionCount(group) }, (_, i) => this.#motion(group, i)));
  }

  /** Plays a motion. Resolves true once it finishes, false if it could not start. */
  async startMotion(names: string | readonly string[], options: MotionOptions = {}): Promise<boolean> {
    const pool = (typeof names === "string" ? [names] : names).flatMap((name) => {
      const group = this.#group(name);
      const motions = group === undefined ? [] : this.#pool(group);
      if (motions.length === 0) throw new RangeError(`moe2d: the model has no motion group "${name}"`);
      return motions;
    });
    if (pool.length === 0) throw new RangeError("moe2d: motion() needs at least one group");
    if (options.index !== undefined && typeof names !== "string" && names.length > 1) {
      throw new RangeError("moe2d: an index needs a single group");
    }
    const [group, index] = options.index === undefined ? this.#pick(pool) : [pool[0]![0], options.index];
    if (index < 0 || index >= this.#setting.getMotionCount(group)) throw new RangeError(`moe2d: "${group}" has no motion ${index}`);
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

    return new Promise<boolean>((resolve) => {
      const handle = this.#start(motion, group, index, priority);
      if (handle === InvalidMotionQueueEntryHandleValue) return resolve(false);
      const waiting = this.#pending.get(motion) ?? [];
      waiting.push(resolve);
      this.#pending.set(motion, waiting);
    });
  }

  #startIdle(): void {
    const group = this.#idle;
    if (!group) return;
    const [, index] = this.#pick(this.#pool(group));
    const motion = this.#ready.get(`${group}\u0000${index}`);
    if (motion) this.#start(motion, group, index, PRIORITY.idle);
  }

  setExpression(name: string | null): void {
    if (name === null) {
      this._expressionManager.stopAllMotions();
      return;
    }
    const motion = this.#expressions.get(name);
    if (!motion) throw new RangeError(`moe2d: the model has no expression "${name}"`);
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

  /** The box around every drawable showing in the last update, in model units, or null if none shows. */
  drawn(): Bounds | null {
    const model = this._model;
    let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < model.getDrawableCount(); i++) {
      if (!model.getDrawableDynamicFlagIsVisible(i) || model.getDrawableOpacity(i) <= 0) continue;
      const vertices = model.getDrawableVertices(i);
      for (let v = 0; v < vertices.length; v += 2) {
        left = Math.min(left, vertices[v]!);
        right = Math.max(right, vertices[v]!);
        bottom = Math.min(bottom, vertices[v + 1]!);
        top = Math.max(top, vertices[v + 1]!);
      }
    }
    return left > right ? null : { left, top, width: right - left, height: top - bottom };
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
    this.#arrived = null;
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
