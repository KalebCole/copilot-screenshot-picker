import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createStage } from "../.github/extensions/screenshot-picker/lib/stage.mjs";

test("add stages a path", () => {
  const s = createStage();
  assert.equal(s.add("/tmp/a.png"), true);
  assert.equal(s.size(), 1);
  assert.ok(s.has("/tmp/a.png"));
});

test("add dedupes by resolved absolute path", () => {
  const s = createStage();
  s.add("/tmp/a.png");
  assert.equal(s.add("/tmp/a.png"), false);
  assert.equal(s.size(), 1);
});

test("add normalizes via path.resolve", () => {
  const s = createStage();
  s.add("/tmp/a.png");
  assert.equal(s.add(path.resolve("/tmp/a.png")), false);
  assert.equal(s.size(), 1);
});

test("addMany returns count of newly added", () => {
  const s = createStage();
  const n = s.addMany(["/a.png", "/b.png", "/a.png"]);
  assert.equal(n, 2);
  assert.equal(s.size(), 2);
});

test("remove deletes a staged path", () => {
  const s = createStage();
  s.add("/a.png");
  assert.equal(s.remove("/a.png"), true);
  assert.equal(s.size(), 0);
});

test("clear empties the set and returns previous size", () => {
  const s = createStage();
  s.add("/a.png");
  s.add("/b.png");
  const n = s.clear();
  assert.equal(n, 2);
  assert.equal(s.size(), 0);
});

test("list returns all staged paths", () => {
  const s = createStage();
  s.add("/a.png");
  s.add("/b.png");
  const out = s.list();
  assert.equal(out.length, 2);
});

test("multiple invocations accumulate", () => {
  const s = createStage();
  s.addMany(["/a.png", "/b.png"]);
  s.addMany(["/b.png", "/c.png"]);
  assert.equal(s.size(), 3);
});

test("rejects non-string and empty input", () => {
  const s = createStage();
  assert.equal(s.add(""), false);
  assert.equal(s.add(null), false);
  assert.equal(s.add(undefined), false);
  assert.equal(s.size(), 0);
});
