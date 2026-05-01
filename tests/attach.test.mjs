import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildImageBlock, buildToolResult, mimeFor } from "../.github/extensions/screenshot-picker/lib/attach.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");
const F1 = path.join(FIX, "screenshot-1.png");
const F2 = path.join(FIX, "screenshot-2.png");

test("mimeFor returns image/png for .png", () => {
  assert.equal(mimeFor("foo.png"), "image/png");
  assert.equal(mimeFor("foo.JPG"), "image/jpeg");
  assert.equal(mimeFor("foo.webp"), "image/webp");
  assert.equal(mimeFor("foo.gif"), "image/gif");
});

test("buildImageBlock returns SDK-shaped block", () => {
  const block = buildImageBlock(F1);
  assert.equal(block.type, "image");
  assert.equal(block.mimeType, "image/png");
  assert.equal(typeof block.data, "string");
  // data should be valid base64 of file contents
  const expected = fs.readFileSync(F1).toString("base64");
  assert.equal(block.data, expected);
  // PNG signature in base64 starts with "iVBORw0KGgo"
  assert.match(block.data, /^iVBORw0KGgo/);
});

test("buildImageBlock returns null and warns on ENOENT", () => {
  const warnings = [];
  const block = buildImageBlock(path.join(FIX, "_does_not_exist.png"), {
    warn: (m) => warnings.push(m),
  });
  assert.equal(block, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing/i);
});

test("buildToolResult includes text summary and image blocks", () => {
  const result = buildToolResult([F1, F2]);
  assert.equal(result.isError, false);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /Attached 2 screenshot/);
  assert.equal(result.content[1].type, "image");
  assert.equal(result.content[2].type, "image");
});

test("buildToolResult skips missing files gracefully", () => {
  const warnings = [];
  const result = buildToolResult([F1, "/nope/missing.png"], {
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.content.filter((c) => c.type === "image").length, 1);
  assert.match(result.content[0].text, /Attached 1 screenshot/);
  assert.match(result.content[0].text, /Skipped 1 file/);
  assert.equal(warnings.length, 1);
});

test("buildToolResult returns empty-state text when nothing succeeds", () => {
  const result = buildToolResult(["/a.png", "/b.png"], { warn: () => {} });
  assert.equal(result.content.length, 1);
  assert.match(result.content[0].text, /No images attached/);
});
