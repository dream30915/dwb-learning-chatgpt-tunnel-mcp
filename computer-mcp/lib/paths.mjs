import fs from "node:fs";
import path from "node:path";

export function isInsideRoot(rootReal, candidate) {
  const relative = path.relative(rootReal, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function ensureWorkspaceRoot(root) {
  fs.mkdirSync(root, { recursive: true });
  return fs.realpathSync.native(root);
}

export function resolveSafePath(workspaceRoot, relativePath = ".") {
  const rel =
    relativePath === undefined || relativePath === null || relativePath === ""
      ? "."
      : relativePath;
  if (typeof rel !== "string") {
    throw new Error("path must stay inside computer-workspace");
  }

  const rootReal = ensureWorkspaceRoot(workspaceRoot);
  const target = path.resolve(rootReal, rel);
  if (!isInsideRoot(rootReal, target)) {
    throw new Error("path must stay inside computer-workspace");
  }

  if (fs.existsSync(target)) {
    const real = fs.realpathSync.native(target);
    if (!isInsideRoot(rootReal, real)) {
      throw new Error("path must stay inside computer-workspace");
    }
    return real;
  }

  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      throw new Error("path must stay inside computer-workspace");
    }
    ancestor = parent;
  }

  const ancestorReal = fs.realpathSync.native(ancestor);
  if (!isInsideRoot(rootReal, ancestorReal)) {
    throw new Error("path must stay inside computer-workspace");
  }

  const remainder = path.relative(ancestor, target);
  if (!remainder || remainder.startsWith("..") || path.isAbsolute(remainder)) {
    throw new Error("path must stay inside computer-workspace");
  }

  const joined = path.join(ancestorReal, remainder);
  if (!isInsideRoot(rootReal, joined)) {
    throw new Error("path must stay inside computer-workspace");
  }
  return joined;
}
