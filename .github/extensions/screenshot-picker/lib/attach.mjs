// attach.mjs — Convert staged file paths to MCP image content blocks.
//
// SDK shape (from copilot-sdk/types.d.ts:197):
//   { type: "image", data: <base64>, mimeType: <string> }
//
// These blocks compose into an MCP CallToolResult:
//   { content: [<text>, <image>, ...], isError?: false }
// which the SDK's convertMcpCallToolResult() turns into a ToolResultObject.

import fs from "node:fs";
import path from "node:path";

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const TEN_MB = 10 * 1024 * 1024;

export function mimeFor(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Build an MCP image content block from a file path.
 * Returns null if the file can't be read.
 *
 * options.warn(message) — called for >10MB files or read errors.
 */
export function buildImageBlock(filePath, options = {}) {
  const warn = options.warn ?? (() => {});
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      warn(`Skipping missing file: ${filePath}`);
    } else {
      warn(`Skipping unreadable file: ${filePath} (${e?.message ?? e})`);
    }
    return null;
  }
  if (buf.length > TEN_MB) {
    warn(`Image >10MB (${(buf.length / 1024 / 1024).toFixed(1)} MB): ${filePath}. Proceeding without resize.`);
  }
  return {
    type: "image",
    data: buf.toString("base64"),
    mimeType: mimeFor(filePath),
  };
}

/**
 * Build the full MCP CallToolResult for a list of staged paths.
 * Skips ENOENT/unreadable files, including a text block summarizing what was attached.
 */
export function buildToolResult(stagedPaths, options = {}) {
  const warn = options.warn ?? (() => {});
  const blocks = [];
  const attached = [];
  const skipped = [];
  for (const p of stagedPaths) {
    const block = buildImageBlock(p, { warn });
    if (block) {
      blocks.push(block);
      attached.push(p);
    } else {
      skipped.push(p);
    }
  }
  const summary =
    attached.length === 0
      ? "No images attached."
      : `Attached ${attached.length} screenshot(s):\n` + attached.map((p) => `  - ${p}`).join("\n") +
        (skipped.length > 0 ? `\nSkipped ${skipped.length} file(s).` : "");
  return {
    content: [{ type: "text", text: summary }, ...blocks],
    isError: false,
  };
}
