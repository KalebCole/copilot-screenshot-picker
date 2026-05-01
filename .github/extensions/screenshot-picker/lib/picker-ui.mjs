// picker-ui.mjs — Interactive TUI screenshot picker.
//
// Why a child subprocess? The extension host's stdin/stdout are reserved for
// JSON-RPC. We can't render a TUI on those streams without corrupting the
// protocol. Instead we spawn a child Node process whose stdio is wired to the
// controlling terminal (/dev/tty on POSIX, \\.\CONIN$ + \\.\CONOUT$ on Windows).
// The child runs the picker, prints the selected absolute paths (one per line)
// to a result file, then exits. The parent reads the result and stages.
//
// Design choice (locked, see README): raw readline + ANSI rather than Ink or
// Blessed. Both pulled in React/screen-buffer dependencies and would require
// extra plumbing through the subprocess boundary. The custom renderer is
// ~150 lines and has zero deps.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run the picker. files is a flat list of { path, mtimeMs, size, source }.
 * Returns a promise resolving to the array of selected absolute paths
 * (empty array if the user cancelled or staged nothing).
 *
 * options.signal — AbortSignal to cancel.
 * options.onLog(level, message) — surface picker events to caller.
 */
export async function runPicker(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    options.onLog?.("info", "No screenshots found in any configured source.");
    return [];
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-"));
  const inputFile = path.join(tmpDir, "input.json");
  const outputFile = path.join(tmpDir, "output.json");
  fs.writeFileSync(inputFile, JSON.stringify({ files }), "utf8");

  const childScript = path.join(__dirname, "picker-child.mjs");

  const result = await new Promise((resolve) => {
    let ttyIn, ttyOut;
    try {
      if (process.platform === "win32") {
        ttyIn = fs.openSync("\\\\.\\CONIN$", "r+");
        ttyOut = fs.openSync("\\\\.\\CONOUT$", "r+");
      } else {
        ttyIn = fs.openSync("/dev/tty", "r");
        ttyOut = fs.openSync("/dev/tty", "w");
      }
    } catch (e) {
      options.onLog?.("error", `Cannot open controlling TTY for picker: ${e.message}`);
      resolve({ error: e });
      return;
    }

    const child = spawn(process.execPath, [childScript, inputFile, outputFile], {
      stdio: [ttyIn, ttyOut, "inherit"],
      windowsHide: false,
    });

    child.on("error", (err) => resolve({ error: err }));
    child.on("close", (code) => {
      try { fs.closeSync(ttyIn); } catch (_e) {}
      try { fs.closeSync(ttyOut); } catch (_e) {}
      resolve({ code });
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        try { child.kill(); } catch (_e) {}
      });
    }
  });

  let selected = [];
  try {
    if (fs.existsSync(outputFile)) {
      const out = JSON.parse(fs.readFileSync(outputFile, "utf8"));
      if (Array.isArray(out.selected)) selected = out.selected;
    }
  } catch (e) {
    options.onLog?.("error", `Picker output parse failed: ${e.message}`);
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) {}

  if (result.error) {
    options.onLog?.("error", `Picker failed: ${result.error.message}`);
  }
  return selected;
}
