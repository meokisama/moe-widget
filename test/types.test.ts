import { expectTypeOf, it } from "vitest";
import type { Layout, Live2DCanvasProps, MotionOptions } from "../src/index";

type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];
// The optional keys that refuse an explicit undefined, which exactOptionalPropertyTypes would enforce on apps.
type RefusingUndefined<T> = { [K in OptionalKeys<T>]-?: Record<K, undefined> extends Pick<T, K> ? never : K }[OptionalKeys<T>];

it("accepts undefined for every optional prop and option", () => {
  expectTypeOf<RefusingUndefined<Live2DCanvasProps>>().toBeNever();
  expectTypeOf<RefusingUndefined<Layout>>().toBeNever();
  expectTypeOf<RefusingUndefined<MotionOptions>>().toBeNever();
});
