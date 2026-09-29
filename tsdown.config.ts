import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx"],
  format: "esm",
  platform: "browser",
  target: "es2022",
  dts: true,
  sourcemap: true,
  // The Core and the Framework stay behind dynamic imports, so importing the
  // package (including during SSR) never touches WebGL or the Core's global.
  external: ["react", "react/jsx-runtime"],
  inputOptions: {
    onLog(level, log, handler) {
      // The vendored Framework imports types without `import type`; they are erased anyway.
      if (log.code === "MISSING_EXPORT" && log.id?.replaceAll("\\", "/").includes("/cubism/")) return;
      handler(level, log);
    },
  },
});
