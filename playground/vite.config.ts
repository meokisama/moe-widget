import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

// Imports the library by its published name, straight from the sources.
export default defineConfig(({ command, mode }) => {
  // The models live on R2: dev serves the local copy, a build loads them from VITE_COLLECTION.
  if (command === "build" && !(process.env.VITE_COLLECTION || loadEnv(mode, fileURLToPath(new URL(".", import.meta.url))).VITE_COLLECTION)) {
    throw new Error("set VITE_COLLECTION to the collection.json on R2");
  }
  return {
    base: "./",
    publicDir: command === "serve" ? "models" : false,
    resolve: {
      alias: [{ find: /^moe2d$/, replacement: fileURLToPath(new URL("../src/index.tsx", import.meta.url)) }],
    },
  };
});
