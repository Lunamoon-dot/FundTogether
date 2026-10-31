import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
  });
}

const files = [
  resolve(root, "README.md"),
  resolve(root, "GOAL.md"),
  resolve(root, "AGENTS.md"),
  resolve(root, "contracts/README.md"),
  resolve(root, "frontend/README.md"),
  resolve(root, "frontend/src/features/README.md"),
  ...markdownFiles(resolve(root, "docs")),
  ...markdownFiles(resolve(root, "research/pilot")),
];
const failures = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/i.test(rawTarget)) continue;

    const pathPart = rawTarget.split("#", 1)[0].split("?", 1)[0];
    if (!pathPart) continue;

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      failures.push(`${file}: malformed link ${rawTarget}`);
      continue;
    }

    const destination = resolve(dirname(file), decodedPath);
    if (!existsSync(destination)) failures.push(`${file}: missing ${rawTarget}`);
  }
}

assert.deepEqual(failures, [], `Broken documentation links:\n${failures.join("\n")}`);
console.log(`Documentation links OK (${files.length} Markdown files).`);
