# copilot-screenshot-picker

A [GitHub Copilot CLI](https://github.com/github/copilot-cli) extension that adds a `/ss` slash command for staging screenshots into your prompts. Modeled on [Graffioh/pi-screenshots-picker](https://github.com/Graffioh/pi-screenshots-picker), retargeted to Copilot CLI and built to bridge a corp Windows laptop to a remote Linux devbox via a shared OneDrive folder.

I take screenshots on Windows with `Win+Shift+S` and need them as context for Copilot CLI on my remote devbox. Without this extension I have no clean path: I can't attach a corp-laptop screenshot to a devbox prompt without manually copying the file. `/ss` opens a TUI picker over my OneDrive screenshots folder, lets me arrow-key/space-stage what I want, and the staged images are auto-attached to the model's context. The transport is solved out-of-band by OneDrive (Windows native) plus rclone or onedriver on the Linux side.

## Prerequisites

- Node.js 18 or newer (Copilot CLI requires it).
- GitHub Copilot CLI installed and working.
- On Windows: OneDrive client signed in.
- On Linux/Mac: a sync mechanism that mirrors the same OneDrive folder locally (see [Remote dev](#remote-dev-linuxmac) below).

## Install

### Windows

```pwsh
git clone https://github.com/kalebcole/copilot-screenshot-picker.git C:\repos\copilot-screenshot-picker
cd C:\repos\copilot-screenshot-picker
.\install.ps1
```

The installer:

1. Verifies Node 18+.
2. Creates `%OneDrive%\screenshots` if missing.
3. Copies `.github/extensions/screenshot-picker/` into `~/.copilot/extensions/`. Symlinks/junctions are not detected by the Copilot CLI extension scanner on Windows, so we copy and re-run on updates.
4. Writes a default `~/.copilot/screenshot-picker.json`.

Re-run with `-Verify` to print install state, `-DryRun` to preview, or `-Uninstall` to remove.

### Linux / Mac (manual)

```sh
git clone https://github.com/kalebcole/copilot-screenshot-picker.git ~/repos/copilot-screenshot-picker
mkdir -p ~/.copilot/extensions
cp -R ~/repos/copilot-screenshot-picker/.github/extensions/screenshot-picker ~/.copilot/extensions/
cat > ~/.copilot/screenshot-picker.json <<EOF
{ "screenshot-picker": { "sources": ["~/onedrive/screenshots"] } }
EOF
```

(Symlinks may also work on POSIX — try `ln -s` if you prefer to develop in-place. The Windows installer copies because the discovery scanner doesn't follow symlinks/junctions there.)

## Usage

Open a Copilot CLI session and run:

- `/ss` — open the picker. Arrow keys navigate. `space` toggles a screenshot's staged state. `enter` confirms. `q` cancels. `c` clears selection. `d` deletes the highlighted file (with `y/n` confirm). `o` opens it in the system viewer.
- `/ss_clear` — clear the staged set without opening the picker.

After confirming, the staged images are returned as MCP image content blocks attached to the tool result, so the model can see them. They stay staged for the rest of the session and a hook reminds the model on each subsequent prompt.

> **Hotkey support:** `Ctrl+Shift+S` / `Ctrl+Shift+X` are not bound. The Copilot CLI SDK (1.0.40-3) does not expose hotkey registration to extensions yet. Slash commands are the supported invocation path.

## Configuration

Resolution priority (highest first):

1. **Config file** `~/.copilot/screenshot-picker.json`:
   ```json
   {
     "screenshot-picker": {
       "sources": [
         "%OneDrive%\\screenshots",
         "~/Pictures/Screenshots",
         "C:\\my\\extra\\path\\**\\*.png"
       ]
     }
   }
   ```
2. **Env var** `COPILOT_SCREENSHOTS_DIR` (single path).
3. **Platform defaults**:
   - Windows: `%OneDrive%\screenshots`, `~/Pictures/Screenshots`
   - Linux/Mac: `~/Pictures/Screenshots`, `~/Desktop`, `~/Screenshots`

Each source can be a directory or a glob pattern (`*`, `**`, `?`, `{a,b}`). `~`, `%VAR%` (Windows), and `${VAR}`/`$VAR` (POSIX) are expanded at load time.

Supported image formats: PNG, JPG, JPEG, WebP, GIF.

## Remote dev (Linux/Mac)

The transport layer is **out of scope** for this extension. The recommended setup mirrors a single OneDrive folder onto both machines:

### Option 1: rclone mount (lightweight, recommended)

```sh
rclone config           # Add a "onedrive" remote
mkdir -p ~/onedrive
rclone mount onedrive: ~/onedrive --vfs-cache-mode full --daemon
```

Configure `~/.copilot/screenshot-picker.json` on the devbox to point at `~/onedrive/screenshots`.

### Option 2: onedriver (FUSE filesystem)

```sh
sudo apt install onedriver
onedriver-launcher
```

### Option 3: any other sync (Syncthing, scp watcher, Dropbox, etc.)

The picker only cares that screenshots show up under one of the configured paths. Any sync mechanism that does that will work.

## Limitations

- No transport implementation — bring your own OneDrive/rclone/whatever.
- Image-only (PNG/JPG/JPEG/WebP/GIF). No screen-recording video.
- No in-picker annotation or editing.
- No image resizing or compression in v1; files >10 MB log a warning and are sent as-is.
- Hotkey registration not yet supported by the SDK.
- TUI runs in a child process attached to the controlling TTY. If you're invoking Copilot CLI in a non-interactive context (CI, headless), `/ss` will fail to open the picker.

## How it works

```
.github/extensions/screenshot-picker/   ← deployed unit (copied to ~/.copilot/extensions/)
  ├── extension.mjs                     ← entry, calls joinSession()
  └── lib/
      ├── sources.mjs                   ← config + glob expansion + listing
      ├── stage.mjs                     ← in-memory Set, session-lifetime
      ├── attach.mjs                    ← base64 → MCP image content blocks
      ├── picker-ui.mjs                 ← spawns child subprocess attached to TTY
      ├── picker-child.mjs              ← raw readline + ANSI TUI
      └── register.mjs                  ← tool/hook registration (testable)
tests/                                  ← Node built-in test runner
install.ps1                             ← Windows installer
```

When `/ss` is called, the extension spawns a child Node process whose stdio is wired to `/dev/tty` (POSIX) or `\\.\CONIN$` + `\\.\CONOUT$` (Windows). This avoids fighting the JSON-RPC stream that Copilot CLI uses on the extension's own stdio.

## Testing

```sh
npm test
```

Uses Node's built-in test runner. No build step, no test framework dependency.

## PRD

The original product requirements live in a Todoist comment: [task 6gVv99G3G62Q5WWp / comment 6gWHj6hpMXv92CFG](https://app.todoist.com/app/task/6gVv99G3G62Q5WWp#comment-6gWHj6hpMXv92CFG).

## License

MIT — see [LICENSE](LICENSE).
