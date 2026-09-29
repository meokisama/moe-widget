/** One model of a collection. Paths are relative to the collection file. */
type Entry = { name: string; model: string; preview?: string };

/** An entry with absolute URLs, and the folder of its model3.json in the collection. */
export type Model = Entry & { folder: string };

// Dev serves playground/models, so a preview can be captured before the model is on R2.
const COLLECTION = import.meta.env.DEV ? "./collection.json" : import.meta.env.VITE_COLLECTION!;

export async function loadCollection(): Promise<Model[]> {
  const base = new URL(COLLECTION, location.href);
  const response = await fetch(base, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${base} answered ${response.status}`);
  const entries = (await response.json()) as Entry[];
  const resolve = (path: string) => new URL(path, base).href;
  return entries.map((entry) => ({
    ...entry,
    model: resolve(entry.model),
    ...(entry.preview && { preview: resolve(entry.preview) }),
    folder: entry.model.includes("/") ? entry.model.slice(0, entry.model.lastIndexOf("/")) : "",
  }));
}
