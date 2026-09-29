import { describe, expect, it, vi } from "vitest";
import { Emitter } from "../src/emitter";

class Bus extends Emitter<{ ping: number }> {
  fire(value: number) {
    this.emit("ping", value);
  }
}

describe("Emitter", () => {
  it("returns an unsubscribe function", () => {
    const bus = new Bus();
    const listener = vi.fn();
    const off = bus.on("ping", listener);
    bus.fire(1);
    off();
    bus.fire(2);
    expect(listener.mock.calls).toEqual([[1]]);
  });

  it("runs once listeners once", () => {
    const bus = new Bus();
    const listener = vi.fn();
    bus.once("ping", listener);
    bus.fire(1);
    bus.fire(2);
    expect(listener.mock.calls).toEqual([[1]]);
  });

  it("keeps calling listeners after one throws", async () => {
    const bus = new Bus();
    const after = vi.fn();
    const errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    process.on("uncaughtException", onError);
    bus.on("ping", () => {
      throw new Error("boom");
    });
    bus.on("ping", after);
    bus.fire(1);
    await new Promise((resolve) => setTimeout(resolve));
    process.off("uncaughtException", onError);
    expect(after).toHaveBeenCalledWith(1);
    expect(errors).toHaveLength(1);
  });
});
