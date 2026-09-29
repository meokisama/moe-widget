// Reads and stamps CHANGELOG.md, whose sections are "## Unreleased" and "## <version>".
//
//   node scripts/changelog.mjs release          # renames Unreleased to the package.json version
//   node scripts/changelog.mjs notes 0.2.0      # prints that version's section

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "CHANGELOG.md");

function fail(message) {
  console.error(`changelog: ${message}`);
  process.exit(1);
}

/** The body of the section headed `## title`, or null. */
function section(text, title) {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

const text = (await readFile(FILE, "utf8")).replace(/\r\n/g, "\n");
const [command, version] = process.argv.slice(2);

if (command === "release") {
  const { version } = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  if (!section(text, "Unreleased")) fail("## Unreleased is missing or empty: say what this release changes.");
  if (section(text, version) !== null) fail(`## ${version} is already there.`);
  await writeFile(FILE, text.replace("## Unreleased", `## Unreleased\n\n## ${version}`));
} else if (command === "notes" && version) {
  const notes = section(text, version);
  if (!notes) fail(`## ${version} is missing or empty.`);
  console.log(notes);
} else {
  fail("usage: changelog.mjs release | notes <version>");
}
