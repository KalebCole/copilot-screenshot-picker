// sources.mjs — config loading + path/glob expansion + file listing.
//
// Source resolution priority:
//   1. Config file: ~/.copilot/screenshot-picker.json -> screenshot-picker.sources
//   2. Env var: COPILOT_SCREENSHOTS_DIR (single path)
//   3. Platform defaults

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export const CONFIG_PATH = path.join(os.homedir(), ".copilot", "screenshot-picker.json");

/**
 * Expand env vars (%VAR% on Windows, $VAR / ${VAR} elsewhere) and ~ to homedir.
 */
export function expandPath(input) {
  if (typeof input !== "string") return input;
  let s = input;
  // ~ at start
  if (s.startsWith("~")) {
    s = path.join(os.homedir(), s.slice(1));
  }
  // %VAR% (Windows)
  s = s.replace(/%([^%]+)%/g, (m, name) => {
    const v = process.env[name];
    return v != null ? v : m;
  });
  // ${VAR} and $VAR (POSIX-ish)
  s = s.replace(/\$\{([^}]+)\}/g, (m, name) => {
    const v = process.env[name];
    return v != null ? v : m;
  });
  s = s.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, name) => {
    const v = process.env[name];
    return v != null ? v : m;
  });
  return s;
}

export function platformDefaults() {
  if (process.platform === "win32") {
    const od = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer;
    const out = [];
    if (od) out.push(path.join(od, "screenshots"));
    out.push(path.join(os.homedir(), "Pictures", "Screenshots"));
    return out;
  }
  return [
    path.join(os.homedir(), "Pictures", "Screenshots"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Screenshots"),
  ];
}

/**
 * Load configured sources. Returns an array of source specs (strings),
 * each of which is a directory or glob.
 *
 * Options: { configPath, env } — for testing.
 */
export function loadSources(options = {}) {
  const configPath = options.configPath ?? CONFIG_PATH;
  const env = options.env ?? process.env;

  // 1. Config file
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      const json = JSON.parse(raw);
      const arr = json?.["screenshot-picker"]?.sources;
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map(expandPath);
      }
    }
  } catch (_e) {
    // fall through
  }

  // 2. Env var
  if (env.COPILOT_SCREENSHOTS_DIR) {
    return [expandPath(env.COPILOT_SCREENSHOTS_DIR)];
  }

  // 3. Defaults
  return platformDefaults().map(expandPath);
}

/**
 * Determine if a glob pattern (contains *, **, ?, or {a,b}).
 */
function isGlob(s) {
  return /[*?]|\{[^}]+\}/.test(s);
}

/**
 * Naive glob matcher sufficient for our purposes:
 *  - **    -> any path segments
 *  - *     -> any chars except path separator
 *  - ?     -> single char
 *  - {a,b} -> alternation
 */
function globToRegex(glob) {
  let g = glob.replace(/\\/g, "/");
  // alternation
  g = g.replace(/\{([^}]+)\}/g, (m, body) => "(?:" + body.split(",").map(escapeRe).join("|") + ")");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        re += ".*";
        i++;
        if (g[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$+.()|[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$", "i");
}

function escapeRe(s) {
  return s.replace(/[\\^$+.()|[\]{}*?]/g, "\\$&");
}

function isImage(file) {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase());
}

function walkDir(dir, out, depth = 6) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(p, out, depth - 1);
    } else if (e.isFile() && isImage(p)) {
      out.push(p);
    }
  }
}

/**
 * Resolve one source spec to an array of absolute file paths.
 * Source may be:
 *   - a directory (lists images in that dir, non-recursive)
 *   - a glob pattern (matches recursively under the static prefix)
 *   - a file (returned as-is if it exists and is an image)
 */
export function listSource(source) {
  const expanded = expandPath(source);
  if (!isGlob(expanded)) {
    let stat;
    try {
      stat = fs.statSync(expanded);
    } catch (_e) {
      return [];
    }
    if (stat.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(expanded, { withFileTypes: true });
      } catch (_e) {
        return [];
      }
      return entries
        .filter((e) => e.isFile() && isImage(e.name))
        .map((e) => path.join(expanded, e.name));
    }
    if (stat.isFile() && isImage(expanded)) return [expanded];
    return [];
  }

  // Glob: split into static base + glob tail
  const norm = expanded.replace(/\\/g, "/");
  const segs = norm.split("/");
  const staticParts = [];
  for (const s of segs) {
    if (isGlob(s)) break;
    staticParts.push(s);
  }
  const base = staticParts.join("/") || ".";
  const re = globToRegex(norm);
  const collected = [];
  walkDir(base, collected);
  return collected.filter((f) => re.test(f.replace(/\\/g, "/")) && isImage(f));
}

/**
 * List all sources, returning entries grouped by source.
 *  Returns: [{ source, files: [{ path, mtimeMs, size }, ...] }, ...]
 *  Files within each group are sorted by mtime descending (newest first).
 */
export function listAllSources(options = {}) {
  const sources = options.sources ?? loadSources(options);
  return sources.map((source) => {
    const paths = listSource(source);
    const files = [];
    for (const p of paths) {
      try {
        const st = fs.statSync(p);
        files.push({ path: path.resolve(p), mtimeMs: st.mtimeMs, size: st.size });
      } catch (_e) {
        // skipped
      }
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { source, files };
  });
}

/**
 * Flatten all source groups into a single deduplicated, mtime-sorted list.
 */
export function listFlat(options = {}) {
  const groups = listAllSources(options);
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    for (const f of g.files) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      out.push({ ...f, source: g.source });
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}
