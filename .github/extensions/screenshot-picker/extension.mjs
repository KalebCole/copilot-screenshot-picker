// extension.mjs — Copilot CLI extension entry point.
// Thin wrapper: imports the SDK and delegates to lib/register.mjs.
//
// Registers /ss (picker) and /ss_clear (reset stage) tools, plus an
// onUserPromptSubmitted hook that reminds the model of staged screenshots.
//
// Hotkey registration (Ctrl+Shift+S, Ctrl+Shift+X) is NOT yet supported by
// the SDK (1.0.40-3); slash commands are the supported invocation path.

import { joinSession } from "@github/copilot-sdk/extension";
import { registerExtension } from "./lib/register.mjs";

registerExtension({ joinSession }).catch((err) => {
  process.stderr.write(`screenshot-picker failed to start: ${err?.stack ?? err}\n`);
  process.exit(1);
});
