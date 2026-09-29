import type { Live2DCanvasHandle } from "./handle";

/** What a tap does without `onTap`, documented on that prop. `idle` is the prop of the same name. */
export function reactToTap(live2d: Live2DCanvasHandle, hitAreas: readonly string[], idle: string | false | undefined): void {
  const { expressions, motions } = live2d.model;
  if (expressions.length > 0 && hitAreas.some((area) => /head/i.test(area))) return live2d.expression();
  const groups = Object.keys(motions).filter((group) => (idle === undefined ? !/^idle$/i.test(group) : group !== idle));
  const group = groups.find((name) => /tap/i.test(name)) ?? groups[Math.floor(Math.random() * groups.length)];
  if (group) void live2d.motion(group);
}
