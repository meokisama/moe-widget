type Model3 = {
  FileReferences: {
    DisplayInfo?: string;
    Expressions?: Array<{ Name: string; File: string }>;
    Motions?: Record<string, Array<{ File: string }>>;
  };
  Groups?: Array<{ Target: string; Name: string; Ids: string[] }>;
};

type VTube = {
  FileReferences?: { IdleAnimation?: string };
  Hotkeys?: Array<{ Name?: string; File?: string }>;
};

// The standard ids, which VTube Studio models have but drive from face tracking instead of these groups.
const GROUPS = { EyeBlink: ["ParamEyeLOpen", "ParamEyeROpen"], LipSync: ["ParamMouthOpenY"] };

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1).toLowerCase();

/**
 * Fills in what a model3.json leaves out, as VTube Studio exports do: the .exp3.json and .motion3.json
 * files beside it, and empty EyeBlink and LipSync groups. `files` are relative to its folder, and `read`
 * parses one of them. The motion VTube Studio idles on goes in "Idle", the rest in "Other".
 * Returns what it added, such as "6 expressions", empty for a model that lists everything.
 */
export function complete(model: Model3, files: string[], read: (file: string) => unknown): string[] {
  const vtubeFile = files.find((file) => /\.vtube\.json$/i.test(file));
  const vtube = (vtubeFile ? read(vtubeFile) : undefined) as VTube | undefined;
  const idle = vtube?.FileReferences?.IdleAnimation;
  const hotkeys = new Map((vtube?.Hotkeys ?? []).filter((key) => key.Name && key.File).map((key) => [base(key.File!), key.Name!]));

  const references = model.FileReferences;
  const listed = new Set(
    [...(references.Expressions ?? []), ...Object.values(references.Motions ?? {}).flat()].map((item) =>
      item.File.toLowerCase(),
    ),
  );
  let [expressions, motions] = [0, 0];
  for (const file of files.filter((file) => !listed.has(file.toLowerCase())).sort()) {
    const expression = /^(.*)\.exp3\.json$/i.exec(file.slice(file.lastIndexOf("/") + 1));
    if (expression) {
      (references.Expressions ??= []).push({ Name: hotkeys.get(base(file)) ?? expression[1]!, File: file });
      expressions++;
    } else if (/\.motion3\.json$/i.test(file)) {
      const group = idle && base(file) === base(idle) ? "Idle" : "Other";
      ((references.Motions ??= {})[group] ??= []).push({ File: file });
      motions++;
    }
  }
  const added = [];
  if (expressions > 0) added.push(`${expressions} expression${expressions === 1 ? "" : "s"}`);
  if (motions > 0) added.push(`${motions} motion${motions === 1 ? "" : "s"}`);

  const info = (references.DisplayInfo ? read(references.DisplayInfo) : undefined) as
    | { Parameters?: Array<{ Id: string }> }
    | undefined;
  const parameters = new Set(info?.Parameters?.map((parameter) => parameter.Id));
  for (const [name, standard] of Object.entries(GROUPS)) {
    const ids = standard.filter((id) => parameters.has(id));
    const group = model.Groups?.find((group) => group.Name === name);
    if (ids.length === 0 || (group && group.Ids.length > 0)) continue;
    if (group) group.Ids = ids;
    else (model.Groups ??= []).push({ Target: "Parameter", Name: name, Ids: ids });
    added.push(name);
  }
  return added;
}
