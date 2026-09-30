import { describe, expect, it, vi } from "vitest";
import type { Live2DCanvasHandle } from "../src/handle";
import { reactToTap } from "../src/tap";

// The groups and expressions of the playground's sample models.
const motions = (count: number) => Array.from({ length: count }, (_, i) => `mtn_${i}`);
const MAO = { motions: { Idle: motions(2), TapBody: motions(6) }, expressions: ["exp_01", "exp_02"] };
const ZUNDAMON = { motions: { Wave: motions(3), Laugh: motions(3), Point: motions(3), Think: motions(3) }, expressions: [] };
const RORO = {
  motions: { Emotion: motions(5), Idle: motions(1), Note: motions(2), SectionClear: motions(1), Song: motions(4) },
  expressions: [],
};

function fake(model: { motions: Record<string, string[]>; expressions: string[] }) {
  const live2d = { model, motion: vi.fn<Live2DCanvasHandle["motion"]>(async () => true), expression: vi.fn() };
  return live2d as typeof live2d & Live2DCanvasHandle;
}

function playedFor(model: Parameters<typeof fake>[0], idle: string | false | undefined) {
  const live2d = fake(model);
  reactToTap(live2d, [], idle);
  return live2d.motion.mock.calls[0]?.[0];
}

describe("reactToTap", () => {
  it("changes the expression on a head", () => {
    const live2d = fake(MAO);
    reactToTap(live2d, ["Head"], undefined);
    expect(live2d.expression).toHaveBeenCalledWith();
    expect(live2d.motion).not.toHaveBeenCalled();
  });

  it("matches a head in any case and inside a longer name", () => {
    const live2d = fake(MAO);
    reactToTap(live2d, ["Body", "HitAreaHEAD"], undefined);
    expect(live2d.expression).toHaveBeenCalled();
  });

  it("plays the tap group anywhere else", () => {
    const live2d = fake(MAO);
    reactToTap(live2d, ["Body"], undefined);
    expect(live2d.motion).toHaveBeenCalledWith(["TapBody"]);
    expect(live2d.expression).not.toHaveBeenCalled();
  });

  it("plays a motion on a head when the model has no expressions", () => {
    const live2d = fake({ ...MAO, expressions: [] });
    reactToTap(live2d, ["Head"], undefined);
    expect(live2d.motion).toHaveBeenCalledWith(["TapBody"]);
  });

  it("picks from every group when none is named like tap", () => {
    expect(playedFor(ZUNDAMON, undefined)).toEqual(["Wave", "Laugh", "Point", "Think"]);
  });

  it("never picks the idle group", () => {
    expect(playedFor(RORO, undefined)).toEqual(["Emotion", "Note", "SectionClear", "Song"]);
  });

  it("leaves out the group named by the idle prop instead, in any case", () => {
    expect(playedFor(RORO, "emotion")).toEqual(["Idle", "Note", "SectionClear", "Song"]);
  });

  it("can pick a group named idle when idling is off", () => {
    expect(playedFor(RORO, false)).toContain("Idle");
  });

  it("skips empty groups", () => {
    expect(playedFor({ motions: { Idle: motions(1), Empty: [], Wave: motions(2) }, expressions: [] }, undefined)).toEqual(["Wave"]);
  });

  it("does nothing for a model with no motions or expressions", () => {
    const live2d = fake({ motions: {}, expressions: [] });
    reactToTap(live2d, ["Head"], undefined);
    expect(live2d.motion).not.toHaveBeenCalled();
    expect(live2d.expression).not.toHaveBeenCalled();
  });
});
