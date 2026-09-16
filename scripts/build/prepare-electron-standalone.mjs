#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "..");

const NINEROUTER_SOURCE = process.env.NINEROUTER_SOURCE || process.cwd();
const DIST_DIR = process.env.NEXT_DIST_DIR || ".next";
const STANDALONE_DIR = join(NINEROUTER_SOURCE, DIST_DIR, "standalone");
const ELECTRON_STANDALONE_DIR = join(ROOT, ".build", "electron-standalone");

function resolveStandaloneBundleDir() {
  const directServer = join(STANDALONE_DIR, "server.js");
  if (existsSync(directServer)) {
    return STANDALONE_DIR;
  }

  const nestedCandidates = [
    join(STANDALONE_DIR, "projects", basename(NINEROUTER_SOURCE)),
    join(STANDALONE_DIR, basename(NINEROUTER_SOURCE)),
  ];

  for (const candidate of nestedCandidates) {
    if (existsSync(join(candidate, "server.js"))) {
      return candidate;
    }
  }

  throw new Error(
    `Standalone server bundle not found in ${STANDALONE_DIR}. ` +
    `Ensure the 9router Next.js standalone build exists at ${STANDALONE_DIR}.`
  );
}

function assertBundleIsPackagable(bundleDir) {
  const nodeModulesPath = join(bundleDir, "node_modules");
  if (!existsSync(nodeModulesPath)) return;

  if (lstatSync(nodeModulesPath).isSymbolicLink()) {
    throw new Error(
      [
        "Next standalone emitted app/node_modules as a symlink.",
        "electron-builder preserves extraResources symlinks, which would make the packaged app",
        "depend on the original build machine path at runtime.",
        "",
        `Offending path: ${nodeModulesPath}`,
      ].join("\n")
    );
  }
}

function removeNativeModules(baseDir, prefixes = ["better-sqlite3", "keytar"]) {
  if (!existsSync(baseDir)) return;
  const dirs = readdirSync(baseDir);
  for (const dir of dirs) {
    if (prefixes.some((p) => dir.startsWith(p))) {
      const fullPath = join(baseDir, dir);
      rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

function stageStandalone(bundleDir) {
  rmSync(ELECTRON_STANDALONE_DIR, { recursive: true, force: true });
  mkdirSync(ELECTRON_STANDALONE_DIR, { recursive: true });

  cpSync(bundleDir, ELECTRON_STANDALONE_DIR, { recursive: true, force: true });

  const staticSource = join(NINEROUTER_SOURCE, DIST_DIR, "static");
  const staticDestination = join(ELECTRON_STANDALONE_DIR, DIST_DIR, "static");
  if (existsSync(staticSource)) {
    mkdirSync(dirname(staticDestination), { recursive: true });
    cpSync(staticSource, staticDestination, { recursive: true, force: true });
  }
}

const bundleDir = resolveStandaloneBundleDir();
assertBundleIsPackagable(bundleDir);

stageStandalone(bundleDir);

removeNativeModules(join(ELECTRON_STANDALONE_DIR, "node_modules"), ["keytar"]);

console.log(
  `[electron] prepared standalone bundle: ${ELECTRON_STANDALONE_DIR}`
);
