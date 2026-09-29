// Writes playground/models/collection.json listing every .model3.json under it, named
// after its folder: "jane-doe" or "jane_doe" becomes "Jane Doe". A preview.png, .jpg or .webp beside a model3.json becomes its preview.
// A model3.json is completed in place as the zip import does it (playground/complete.ts).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { complete } from "../playground/complete.ts";

const root = fileURLToPath(new URL("../playground/models", import.meta.url));

const posix = (path) => path.split(sep).join("/");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8").replace(/^﻿/, ""));

const paths = readdirSync(root, { recursive: true }).map((path) => posix(String(path)));

const entries = paths
  .filter((path) => path.toLowerCase().endsWith(".model3.json"))
  .map((model) => {
    const folder = dirname(model);
    const name = (folder === "." ? model.split(".")[0] : folder.split("/").pop())
      .split(/[-_]+/)
      .filter(Boolean)
      .map((word) => word.replace(/^\p{Script=Latin}/u, (first) => first.toUpperCase()))
      .join(" ");
    const prefix = folder === "." ? "" : `${folder}/`;
    const beside = paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
    const settings = read(model);
    const readBeside = (path) => (existsSync(join(root, prefix + path)) ? read(prefix + path) : undefined);
    const added = complete(settings, beside, readBeside);
    if (added.length > 0) {
      writeFileSync(join(root, model), `${JSON.stringify(settings, null, "\t")}\n`);
      console.log(`${model}: added ${added.join(", ")}`);
    }
    const preview = ["png", "jpg", "webp"]
      .map((extension) => posix(join(folder, `preview.${extension}`)))
      .find((path) => existsSync(join(root, path)));
    return preview ? { name, model, preview } : { name, model };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const file = join(root, "collection.json");
writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`${relative(".", file)}: ${entries.length} models`);
