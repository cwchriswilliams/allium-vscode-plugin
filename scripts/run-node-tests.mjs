#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function collectTestFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
        out.push(fullPath);
      }
    }
  }
  return out.sort();
}

function main(argv) {
  const target = argv[0] ?? "./dist/test";
  const resolvedTarget = path.resolve(process.cwd(), target);
  const testFiles = collectTestFiles(resolvedTarget);
  if (testFiles.length === 0) {
    process.stderr.write(
      `No compiled Node test files (*.test.js) found under: ${resolvedTarget}\n`,
    );
    return 1;
  }
  const result = spawnSync(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

process.exitCode = main(process.argv.slice(2));
