import fs from "node:fs";
import path from "node:path";

import { ensureWorkspaceRoot, isInsideRoot, resolveSafePath } from "./paths.mjs";

export const MAX_FILE_BYTES = 1 * 1024 * 1024;

function listEntry(fullPath, relativePath) {
  const stats = fs.lstatSync(fullPath);
  const followed = stats.isSymbolicLink() ? fs.statSync(fullPath) : stats;
  return {
    path: relativePath.replaceAll("\\", "/"),
    type: followed.isDirectory() ? "directory" : "file",
    bytes: followed.isFile() ? followed.size : undefined,
  };
}

function tryRealpath(fullPath) {
  try {
    return fs.realpathSync.native(fullPath);
  } catch {
    return null;
  }
}

function walkDir(rootReal, dir, relativeDir, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  const names = fs.readdirSync(dir);
  for (const name of names) {
    const fullPath = path.join(dir, name);
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    const real = tryRealpath(fullPath);
    if (!real || !isInsideRoot(rootReal, real)) {
      continue;
    }
    out.push(listEntry(fullPath, relativePath));
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      walkDir(rootReal, real, relativePath, depth + 1, maxDepth, out);
    }
  }
}

export function listWorkspace(workspaceRoot, relativePath, maxDepth = 3) {
  const rootReal = ensureWorkspaceRoot(workspaceRoot);
  const target = resolveSafePath(rootReal, relativePath || ".");
  if (!fs.existsSync(target)) {
    throw new Error(`Not found: ${relativePath || "."}`);
  }
  const stats = fs.statSync(target);
  const shown = relativePath ? relativePath.replaceAll("\\", "/") : "";
  if (stats.isFile()) {
    return {
      workspace_root: rootReal,
      entries: [listEntry(target, shown || path.basename(target))],
    };
  }
  const entries = [];
  walkDir(rootReal, target, shown, 1, maxDepth, entries);
  return { workspace_root: rootReal, entries };
}

export function readTextFile(workspaceRoot, relativePath) {
  const file = resolveSafePath(workspaceRoot, relativePath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${bytes} bytes`);
  }
  return {
    relative_path: relativePath,
    content: fs.readFileSync(file, "utf8"),
  };
}

export function writeTextFile(workspaceRoot, relativePath, content) {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new Error("content is too large");
  }
  const file = resolveSafePath(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return {
    relative_path: relativePath,
    bytes: Buffer.byteLength(content, "utf8"),
    saved: true,
  };
}
