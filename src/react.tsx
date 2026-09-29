"use client";

import { type CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Live2D } from "./live2d";
import type { Layout, Live2DOptions, ModelInfo, MotionEvent, TapEvent } from "./types";

export type Live2DCanvasProps = Live2DOptions & {
  /** URL of the model3.json. Changing it loads the new model over the old one. */
  model: string;
  className?: string;
  style?: CSSProperties;
  /** Called when the Live2D instance is ready, before the first model loads. */
  onReady?: (live2d: Live2D) => void;
  onLoad?: (model: ModelInfo, live2d: Live2D) => void;
  onError?: (error: unknown) => void;
  onTap?: (event: TapEvent, live2d: Live2D) => void;
  onMotionStart?: (event: MotionEvent) => void;
  onMotionEnd?: (event: MotionEvent) => void;
};

const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * A canvas showing a Live2D model. It fills its parent by default, so give the
 * parent a size. The ref is the `Live2D` instance, null until it is ready.
 */
export const Live2DCanvas = forwardRef<Live2D | null, Live2DCanvasProps>(function Live2DCanvas(props, ref) {
  const { model, layout, follow, idle, pixelRatio, debug, className, style } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live2d, setLive2D] = useState<Live2D | null>(null);
  // The latest handlers, so passing inline functions does not resubscribe every render.
  const handlers = useRef(props);
  handlers.current = props;

  useImperativeHandle(ref, () => live2d as Live2D, [live2d]);

  // These options are fixed for an instance's lifetime, so a change makes a new one.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let instance: Live2D | null = null;
    let cancelled = false;
    const options: Live2DOptions = {};
    if (follow !== undefined) options.follow = follow;
    if (idle !== undefined) options.idle = idle;
    if (pixelRatio !== undefined) options.pixelRatio = pixelRatio;
    if (debug !== undefined) options.debug = debug;

    Live2D.create(element, options).then(
      (created) => {
        if (cancelled) return created.destroy();
        instance = created;
        created.on("tap", (event) => handlers.current.onTap?.(event, created));
        created.on("motionstart", (event) => handlers.current.onMotionStart?.(event));
        created.on("motionend", (event) => handlers.current.onMotionEnd?.(event));
        setLive2D(created);
        handlers.current.onReady?.(created);
      },
      (error: unknown) => handlers.current.onError?.(error),
    );

    return () => {
      cancelled = true;
      instance?.destroy();
      setLive2D(null);
    };
  }, [follow, idle, pixelRatio, debug]);

  const layoutKey = JSON.stringify(layout ?? {});
  useEffect(() => {
    if (live2d) live2d.layout = JSON.parse(layoutKey) as Layout;
  }, [live2d, layoutKey]);

  useEffect(() => {
    if (!live2d) return;
    const controller = new AbortController();
    live2d.load(model, { signal: controller.signal, layout: JSON.parse(layoutKey) as Layout }).then(
      (info) => handlers.current.onLoad?.(info, live2d),
      (error: unknown) => {
        if (!isAbort(error)) handlers.current.onError?.(error);
      },
    );
    return () => controller.abort();
    // The layout is applied by the effect above; it must not reload the model.
  }, [live2d, model]);

  return <canvas ref={canvas} className={className} style={style ? { ...FILL, ...style } : FILL} />;
});
