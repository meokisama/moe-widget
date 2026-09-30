"use client";

import { type CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type Live2DCanvasHandle, handleOf } from "./handle";
import { Live2D } from "./live2d";
import { reactToTap } from "./tap";
import type { Fetch, Layout, Live2DOptions, LoadProgress, ModelInfo, MotionEvent, TapEvent } from "./types";

export type { Live2DCanvasHandle } from "./handle";
export type { Rect } from "./layout";
export type { Voice } from "./mouth";
export type { Fetch, Layout, LoadProgress, ModelInfo, MotionEvent, MotionOptions, Priority, TapEvent } from "./types";

export type Live2DCanvasProps = Live2DOptions & {
  /** URL of the model3.json. Changing it loads the new model over the old one. */
  model: string;
  /**
   * Fetches each of the model's files, at URLs resolved against `model`. Read when a
   * load starts, so changing it does not reload the model.
   * @default fetch
   */
  fetch?: Fetch | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  /** Another of the files a load waits for arrived. The first call comes once the model3.json has. */
  onProgress?: ((progress: LoadProgress) => void) | undefined;
  onLoad?: ((model: ModelInfo, live2d: Live2DCanvasHandle) => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
  /**
   * Replaces the default reaction to a tap: a random expression on a hit area
   * named like "head", otherwise a motion from a group named like "tap", or
   * from any group but the idle one.
   */
  onTap?: ((event: TapEvent, live2d: Live2DCanvasHandle) => void) | undefined;
  onMotionStart?: ((event: MotionEvent) => void) | undefined;
  onMotionEnd?: ((event: MotionEvent) => void) | undefined;
  /** A user event fired from a motion's timeline. */
  onMotionEvent?: ((value: string) => void) | undefined;
};

const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * A canvas showing a Live2D model. It fills its parent by default, so give the
 * parent a size. The ref is a `Live2DCanvasHandle`, null until a model has loaded.
 */
export const Live2DCanvas = forwardRef<Live2DCanvasHandle | null, Live2DCanvasProps>(function Live2DCanvas(props, ref) {
  const { model, layout, follow, idle, volume, pixelRatio, debug, className, style } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live2d, setLive2D] = useState<Live2D | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The URL of the model on screen, so a layout passed with a new model waits for it.
  const shown = useRef<string | null>(null);
  // The latest handlers, so passing inline functions does not resubscribe every render.
  const handlers = useRef(props);
  handlers.current = props;

  useImperativeHandle(ref, () => (live2d && loaded ? handleOf(live2d) : null) as Live2DCanvasHandle, [live2d, loaded]);

  // These options are fixed for an instance's lifetime, so a change makes a new one.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let instance: Live2D | null = null;
    let cancelled = false;
    Live2D.create(element, { pixelRatio, debug }).then(
      (created) => {
        if (cancelled) return created.destroy();
        instance = created;
        const handle = handleOf(created);
        created.on("tap", (event) => {
          const { onTap } = handlers.current;
          if (onTap) onTap(event, handle);
          else reactToTap(handle, event.hitAreas, handlers.current.idle);
        });
        created.on("progress", (progress) => handlers.current.onProgress?.(progress));
        created.on("motionstart", (event) => handlers.current.onMotionStart?.(event));
        created.on("motionend", (event) => handlers.current.onMotionEnd?.(event));
        created.on("motionevent", (value) => handlers.current.onMotionEvent?.(value));
        setLive2D(created);
      },
      (error: unknown) => handlers.current.onError?.(error),
    );

    return () => {
      cancelled = true;
      instance?.destroy();
      shown.current = null;
      setLive2D(null);
      setLoaded(false);
    };
  }, [pixelRatio, debug]);

  useEffect(() => {
    if (live2d) live2d.follow = follow ?? "window";
  }, [live2d, follow]);

  useEffect(() => {
    if (live2d) live2d.volume = volume ?? 1;
  }, [live2d, volume]);

  // Before the load effect, so the first model loads with this idle group.
  useEffect(() => {
    live2d?.setIdle(idle).catch((error: unknown) => handlers.current.onError?.(error));
  }, [live2d, idle]);

  const layoutKey = JSON.stringify(layout ?? {});
  useEffect(() => {
    if (live2d && shown.current === model) live2d.layout = JSON.parse(layoutKey) as Layout;
  }, [live2d, layoutKey]);

  useEffect(() => {
    if (!live2d) return;
    const controller = new AbortController();
    const { fetch } = handlers.current;
    live2d.load(model, { signal: controller.signal, fetch }).then(
      (info) => {
        // Runs before the next frame, so the new model is never drawn with the old layout.
        shown.current = model;
        live2d.layout = handlers.current.layout ?? {};
        setLoaded(true);
        handlers.current.onLoad?.(info, handleOf(live2d));
      },
      (error: unknown) => {
        if (!isAbort(error)) handlers.current.onError?.(error);
      },
    );
    return () => controller.abort();
  }, [live2d, model]);

  return <canvas ref={canvas} className={className} style={style ? { ...FILL, ...style } : FILL} />;
});
