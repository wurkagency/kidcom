#!/usr/bin/env node
// Adds shadcn/ui components to the theme package in the current directory
// (run via `npm run ui:add --workspace=packages/themes/<id> -- button card`).
//
// The shadcn CLI writes imports through the "@/..." tsconfig alias. Theme
// packages must not depend on a build-time alias (two themes would both
// claim "@"), so after the CLI runs every "@/..." import under src/ is
// rewritten to a relative path.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const components = process.argv.slice(2);
if (components.length === 0) {
  console.error("usage: npm run ui:add -- <component> [...]");
  process.exit(1);
}

execSync(`npx --yes shadcn@latest add ${components.join(" ")} --yes --overwrite`, { stdio: "inherit" });

const srcDir = join(process.cwd(), "src");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(srcDir);

let rewritten = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const next = source.replace(/(from\s+["'])@\/([^"']+)(["'])/g, (_m, pre, target, post) => {
    let rel = relative(dirname(file), join(srcDir, target)).split(sep).join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${pre}${rel}${post}`;
  });
  if (next !== source) {
    writeFileSync(file, next);
    rewritten++;
  }
}
console.log(`Rewrote "@/" imports in ${rewritten} file(s).`);
