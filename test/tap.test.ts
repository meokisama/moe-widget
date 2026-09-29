import { afterEach, describe, expect, it, vi } from "vitest";
import type { Live2DCanvasHandle } from "../src/handle";
import { reactToTap } from "../src/tap";

// The groups and expressions of the playground's sample models.
const MAO = { motions: { Idle: 2, TapBody: 6 }, expressions: ["exp_01", "exp_02"] };
const ZUNDAMON = { motions: { Wave: 3, Laugh: 3, Point: 3, Think: 3 }, expressions: [] };
const RORO = { motions: { Emotion: 5, Idle: 1, Note: 2, SectionClear: 1, Song: 4 }, expressions: [] };

function fake(model: { motions: Record<string, number>; expressions: string[] }) {
  const live2d = { model, motion: vi.fn<Live2DCanvasHandle["motion"]>(async () => true), expression: vi.fn() };
  return live2d as typeof live2d & Live2DCanvasHandle;
}

function playedFor(model: Parameters<typeof fake>[0], idle: string | false | undefined, random: number) {
  vi.spyOn(Math, "random").mockReturnValue(random);
  const live2d = fake(model);
  reactToTap(live2d, [], idle);
  return live2d.motion.mock.calls[0]?.[0];
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect(live2d.motion).toHaveBeenCalledWith("TapBody");
    expect(live2d.expression).not.toHaveBeenCalled();
  });

  it("plays a motion on a head when the model has no expressions", () => {
    const live2d = fake({ ...MAO, expressions: [] });
    reactToTap(live2d, ["Head"], undefined);
    expect(live2d.motion).toHaveBeenCalledWith("TapBody");
  });

  it("picks from every group when none is named like tap", () => {
    expect(playedFor(ZUNDAMON, undefined, 0)).toBe("Wave");
    expect(playedFor(ZUNDAMON, undefined, 0.99)).toBe("Think");
  });

  it("never picks the idle group", () => {
    const played = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((random) => playedFor(RORO, undefined, random)));
    expect(played).toEqual(new Set(["Emotion", "Note", "SectionClear", "Song"]));
  });

  it("leaves out the group named by the idle prop instead", () => {
    const played = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((random) => playedFor(RORO, "Emotion", random)));
    expect(played).not.toContain("Emotion");
    expect(played).toContain("Idle");
  });

  it("can pick a group named idle when idling is off", () => {
    expect(playedFor(RORO, false, 0.2)).toBe("Idle");
  });

  it("does nothing for a model with no motions or expressions", () => {
    const live2d = fake({ motions: {}, expressions: [] });
    reactToTap(live2d, ["Head"], undefined);
    expect(live2d.motion).not.toHaveBeenCalled();
    expect(live2d.expression).not.toHaveBeenCalled();
  });
});
