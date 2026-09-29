import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Imports the library by its published name, straight from the sources.
export default defineConfig({
  base: "./",
  publicDir: "models",
  resolve: {
    alias: [{ find: /^moe2d$/, replacement: fileURLToPath(new URL("../src/index.tsx", import.meta.url)) }],
  },
});
