import type { Live2DCanvasHandle } from "./handle";

/** What a tap does without `onTap`, documented on that prop. `idle` is the prop of the same name. */
export function reactToTap(live2d: Live2DCanvasHandle, hitAreas: readonly string[], idle: string | false | undefined): void {
  const { expressions, motions } = live2d.model;
  if (expressions.length > 0 && hitAreas.some((area) => /head/i.test(area))) return live2d.expression();
  const skip = idle === false ? null : (idle ?? "idle").toLowerCase();
  const groups = Object.keys(motions).filter((group) => group.toLowerCase() !== skip && motions[group]!.length > 0);
  const taps = groups.filter((group) => /tap/i.test(group));
  const pool = taps.length > 0 ? taps : groups;
  if (pool.length > 0) void live2d.motion(pool);
}
