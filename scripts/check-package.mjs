import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".sf",
  ".sfdx",
  ".mdapi",
  "dist",
]);
const sensitive = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /https:\/\/[^/\s]*\.(?:my\.salesforce|lightning\.force)\.com/,
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\b00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?![^\s"'<>]+/,
];
let count = 0;
const errors = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    const name = relative(root, path);
    if (entry.isSymbolicLink()) {
      errors.push(`Unexpected symbolic link: ${name}`);
      continue;
    }
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (entry.name === ".env" || entry.name.startsWith(".env."))
      errors.push(`Environment file: ${name}`);
    const body = await readFile(path, "utf8");
    if (sensitive.some((pattern) => pattern.test(body)))
      errors.push(`Potential private value: ${name}`);
    count++;
  }
}
await walk(root);
const manifest = await readFile(join(root, "manifest/package.xml"), "utf8");
if (/<name>(?:FlexiPage|CustomApplication|Profile|Flow)<\/name>/.test(manifest))
  errors.push("Deployment manifest includes org-specific configuration.");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Checked ${count} project files; no matching private values, environment files, symlinks, or org-specific manifest entries.`,
);
