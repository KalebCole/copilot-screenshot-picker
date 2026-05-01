// picker-child.mjs — Runs in a child process with stdio wired to the user's TTY.
// Reads { files: [...] } from input file, renders an interactive list,
// writes { selected: [...] } to output file on Enter or quit.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const [, , inputPath, outputPath] = process.argv;

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const files = input.files;

let cursor = 0;
const staged = new Set();
let confirmingDelete = -1;
let statusMessage = "";

const stdin = process.stdin;
const stdout = process.stdout;

stdout.write("\x1b[?25l"); // hide cursor
if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");
readline.emitKeypressEvents(stdin);

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

function clearScreen() {
  stdout.write("\x1b[2J\x1b[H");
}

function render() {
  clearScreen();
  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;
  const header = `Screenshot Picker — ${files.length} files  |  Staged: ${staged.size}`;
  stdout.write(`\x1b[1;36m${header}\x1b[0m\n`);
  stdout.write(`\x1b[2m↑↓ navigate · space stage · enter confirm · d delete · o open · q quit · c clear\x1b[0m\n\n`);

  const visible = Math.max(5, rows - 6);
  const start = Math.max(0, Math.min(cursor - Math.floor(visible / 2), files.length - visible));
  const end = Math.min(files.length, start + visible);

  for (let i = start; i < end; i++) {
    const f = files[i];
    const isStaged = staged.has(f.path);
    const isCursor = i === cursor;
    const mark = isStaged ? "✓" : " ";
    const name = path.basename(f.path);
    const meta = `${relativeTime(f.mtimeMs)} · ${formatSize(f.size)}`;
    const line = `${mark} ${name}  \x1b[2m${meta}\x1b[0m`;
    const truncated = line.length > cols - 4 ? line.slice(0, cols - 4) : line;
    if (isCursor) {
      stdout.write(`\x1b[7m> ${truncated}\x1b[0m\n`);
    } else {
      stdout.write(`  ${truncated}\n`);
    }
  }

  if (confirmingDelete === cursor && cursor < files.length) {
    stdout.write(`\n\x1b[31mDelete ${path.basename(files[cursor].path)}? (y/n)\x1b[0m`);
  } else if (statusMessage) {
    stdout.write(`\n\x1b[33m${statusMessage}\x1b[0m`);
  }
}

function writeOutputAndExit(selected) {
  fs.writeFileSync(outputPath, JSON.stringify({ selected }), "utf8");
  stdout.write("\x1b[?25h"); // show cursor
  if (stdin.isTTY) stdin.setRawMode(false);
  clearScreen();
  process.exit(0);
}

function openFile(p) {
  try {
    if (process.platform === "win32") {
      spawnSync("cmd", ["/c", "start", "", p], { stdio: "ignore", detached: true });
    } else if (process.platform === "darwin") {
      spawnSync("open", [p], { stdio: "ignore", detached: true });
    } else {
      spawnSync("xdg-open", [p], { stdio: "ignore", detached: true });
    }
  } catch (_e) {}
}

stdin.on("keypress", (str, key) => {
  if (!key) return;

  if (confirmingDelete >= 0) {
    if (key.name === "y") {
      const target = files[confirmingDelete];
      try {
        fs.unlinkSync(target.path);
        staged.delete(target.path);
        files.splice(confirmingDelete, 1);
        if (cursor >= files.length) cursor = Math.max(0, files.length - 1);
        statusMessage = `Deleted ${path.basename(target.path)}`;
      } catch (e) {
        statusMessage = `Delete failed: ${e.message}`;
      }
      confirmingDelete = -1;
    } else if (key.name === "n" || key.name === "escape") {
      confirmingDelete = -1;
      statusMessage = "";
    }
    render();
    return;
  }

  statusMessage = "";

  if (key.ctrl && key.name === "c") {
    writeOutputAndExit([]);
    return;
  }
  switch (key.name) {
    case "up": cursor = Math.max(0, cursor - 1); break;
    case "down": cursor = Math.min(files.length - 1, cursor + 1); break;
    case "pageup": cursor = Math.max(0, cursor - 10); break;
    case "pagedown": cursor = Math.min(files.length - 1, cursor + 10); break;
    case "home": cursor = 0; break;
    case "end": cursor = files.length - 1; break;
    case "space": {
      if (files[cursor]) {
        const p = files[cursor].path;
        if (staged.has(p)) staged.delete(p);
        else staged.add(p);
      }
      break;
    }
    case "return":
      writeOutputAndExit([...staged]);
      return;
    case "q":
    case "escape":
      writeOutputAndExit([]);
      return;
    case "c":
      staged.clear();
      statusMessage = "Cleared selection";
      break;
    case "d":
      if (files[cursor]) confirmingDelete = cursor;
      break;
    case "o":
      if (files[cursor]) {
        openFile(files[cursor].path);
        statusMessage = `Opened ${path.basename(files[cursor].path)}`;
      }
      break;
  }
  render();
});

render();
