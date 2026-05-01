import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  expandPath,
  loadSources,
  listSource,
  listAllSources,
  listFlat,
  platformDefaults,
} from "../.github/extensions/screenshot-picker/lib/sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");

test("expandPath expands ~ to homedir", () => {
  const out = expandPath("~/foo");
  assert.equal(out, path.join(os.homedir(), "foo"));
});

test("expandPath expands %VAR% on Windows-style", () => {
  process.env._SSP_TEST = "C:\\X";
  try {
    const out = expandPath("%_SSP_TEST%\\screenshots");
    assert.equal(out, "C:\\X\\screenshots");
  } finally {
    delete process.env._SSP_TEST;
  }
});

test("expandPath leaves unknown vars in place", () => {
  const out = expandPath("%__NOT_DEFINED_VAR__%\\x");
  assert.match(out, /__NOT_DEFINED_VAR__/);
});

test("expandPath expands ${VAR} POSIX-style", () => {
  process.env._SSP_TEST2 = "/home/u";
  try {
    assert.equal(expandPath("${_SSP_TEST2}/pics"), "/home/u/pics");
  } finally {
    delete process.env._SSP_TEST2;
  }
});

test("listSource returns image files in a directory", () => {
  const files = listSource(FIX);
  const names = files.map((f) => path.basename(f)).sort();
  assert.deepEqual(names, ["screenshot-1.png", "screenshot-2.png"]);
});

test("listSource returns [] for empty directory", () => {
  const files = listSource(path.join(FIX, "empty"));
  assert.deepEqual(files, []);
});

test("listSource returns [] for nonexistent path", () => {
  const files = listSource(path.join(FIX, "nope-does-not-exist"));
  assert.deepEqual(files, []);
});

test("listSource handles glob with ** and *.png", () => {
  const glob = path.join(FIX, "**", "*.png").replace(/\\/g, "/");
  const files = listSource(glob);
  const names = files.map((f) => path.basename(f)).sort();
  assert.ok(names.includes("screenshot-1.png"));
  assert.ok(names.includes("screenshot-2.png"));
});

test("listAllSources orders files by mtime descending", () => {
  // Touch screenshot-2 to be newer
  const f1 = path.join(FIX, "screenshot-1.png");
  const f2 = path.join(FIX, "screenshot-2.png");
  const now = Date.now();
  fs.utimesSync(f1, new Date(now - 60000), new Date(now - 60000));
  fs.utimesSync(f2, new Date(now), new Date(now));

  const groups = listAllSources({ sources: [FIX] });
  assert.equal(groups.length, 1);
  assert.equal(path.basename(groups[0].files[0].path), "screenshot-2.png");
  assert.equal(path.basename(groups[0].files[1].path), "screenshot-1.png");
});

test("listFlat dedupes across sources and sorts by mtime", () => {
  const flat = listFlat({ sources: [FIX, FIX] });
  const names = flat.map((f) => path.basename(f.path));
  assert.equal(names.length, 2);
  assert.equal(names[0], "screenshot-2.png");
});

test("loadSources reads from config file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-cfg-"));
  const cfg = path.join(tmp, "screenshot-picker.json");
  fs.writeFileSync(cfg, JSON.stringify({
    "screenshot-picker": { sources: ["~/Pictures/Foo", "C:\\bar"] },
  }));
  const out = loadSources({ configPath: cfg, env: {} });
  assert.equal(out.length, 2);
  assert.equal(out[0], path.join(os.homedir(), "Pictures", "Foo"));
});

test("loadSources falls back to env var when no config", () => {
  const out = loadSources({ configPath: "/nonexistent/file.json", env: { COPILOT_SCREENSHOTS_DIR: "/some/dir" } });
  assert.deepEqual(out, ["/some/dir"]);
});

test("loadSources falls back to platform defaults", () => {
  const out = loadSources({ configPath: "/nonexistent/file.json", env: {} });
  assert.ok(out.length >= 1);
  assert.deepEqual(out, platformDefaults().map(expandPath));
});
