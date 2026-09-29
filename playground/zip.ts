import { unzipSync } from "fflate";
import type { Fetch } from "moe-widget";

export type Source = { url: string; fetch?: Fetch };

let uploads = 0;

/** Serves a zipped model from memory, under its own `zip:` URL so each upload reloads. */
export async function sourceFromZip(file: File): Promise<Source> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const paths = Object.keys(files).filter((path) => !path.endsWith("/") && !path.startsWith("__MACOSX/"));
  const entry = paths.find((path) => /\.model3\.json$/i.test(path));
  if (!entry) throw new Error(`${file.name} has no .model3.json`);

  // Models made on Windows often name their files in a different case than the zip holds.
  const lower = new Map(paths.map((path) => [path.toLowerCase(), path]));
  const root = `/${++uploads}/`;
  return {
    url: `zip:${root}${entry.split("/").map(encodeURIComponent).join("/")}`,
    fetch: async (url) => {
      const path = decodeURIComponent(url.pathname.slice(root.length));
      const data = files[path] ?? files[lower.get(path.toLowerCase()) ?? ""];
      return data ? new Response(new Blob([data])) : new Response(null, { status: 404, statusText: "Not in the zip" });
    },
  };
}
