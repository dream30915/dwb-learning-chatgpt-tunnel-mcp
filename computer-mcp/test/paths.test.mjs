import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { listWorkspace, readTextFile, writeTextFile } from "../lib/files.mjs";
import { resolveSafePath } from "../lib/paths.mjs";
import { makeTempWorkspace } from "./helpers.mjs";

test("rejects parent traversal", () => {
  const root = makeTempWorkspace();
  fs.writeFileSync(path.join(root, "inside.txt"), "ok");
  const secret = path.join(path.dirname(root), "outside-secret.txt");
  fs.writeFileSync(secret, "nope");
  assert.throws(() => resolveSafePath(root, ".."), /must stay inside/);
  assert.throws(() => resolveSafePath(root, "../outside-secret.txt"), /must stay inside/);
  assert.throws(() => readTextFile(root, "../outside-secret.txt"), /must stay inside/);
  assert.throws(() => writeTextFile(root, "../pwned.txt", "x"), /must stay inside/);
  assert.throws(() => listWorkspace(root, ".."), /must stay inside/);
});

test("rejects absolute paths outside the workspace", () => {
  const root = makeTempWorkspace();
  const outside = path.join(os.tmpdir(), `computer-mcp-abs-${Date.now()}.txt`);
  fs.writeFileSync(outside, "abs");
  assert.throws(() => resolveSafePath(root, outside), /must stay inside/);
  assert.throws(() => readTextFile(root, outside), /must stay inside/);
  assert.throws(() => writeTextFile(root, outside, "x"), /must stay inside/);
});

test("write stays inside workspace including nested create", () => {
  const root = makeTempWorkspace();
  const saved = writeTextFile(root, "nested/dir/note.txt", "hello");
  assert.equal(saved.saved, true);
  const onDisk = fs.readFileSync(path.join(root, "nested", "dir", "note.txt"), "utf8");
  assert.equal(onDisk, "hello");
  const read = readTextFile(root, "nested/dir/note.txt");
  assert.equal(read.content, "hello");
});

test("junction cannot be used to read or write outside the workspace", () => {
  const root = makeTempWorkspace();
  const outsideDir = makeTempWorkspace("computer-mcp-out-");
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "outside-secret");
  const junctionPath = path.join(root, "escape");
  try {
    fs.symlinkSync(outsideDir, junctionPath, "junction");
  } catch (error) {
    const code = error?.code || "";
    if (code === "EPERM" || code === "ENOTSUP") {
      return;
    }
    throw error;
  }

  assert.throws(() => resolveSafePath(root, "escape"), /must stay inside/);
  assert.throws(() => readTextFile(root, "escape/secret.txt"), /must stay inside/);
  assert.throws(() => writeTextFile(root, "escape/pwned.txt", "x"), /must stay inside/);
  const listing = listWorkspace(root, ".");
  const escaped = listing.entries.some((entry) => entry.path === "escape" || entry.path.startsWith("escape/"));
  assert.equal(escaped, false);
  assert.equal(fs.existsSync(path.join(outsideDir, "pwned.txt")), false);
});

test("file symlink cannot be used to read outside the workspace", () => {
  const root = makeTempWorkspace();
  const outsideFile = path.join(path.dirname(root), `computer-mcp-link-target-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, "symlink-secret");
  const linkPath = path.join(root, "leak.txt");
  try {
    fs.symlinkSync(outsideFile, linkPath, "file");
  } catch (error) {
    const code = error?.code || "";
    if (code === "EPERM" || code === "ENOTSUP" || code === "EEXIST") {
      return;
    }
    throw error;
  }
  assert.throws(() => readTextFile(root, "leak.txt"), /must stay inside/);
});
