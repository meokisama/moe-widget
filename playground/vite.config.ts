import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

// Imports the library by its published name, straight from the sources.
export default defineConfig({
  publicDir: "models",
  resolve: {
    alias: [
      { find: /^moe-widget\/react$/, replacement: src("react.tsx") },
      { find: /^moe-widget$/, replacement: src("index.ts") },
    ],
  },
});
