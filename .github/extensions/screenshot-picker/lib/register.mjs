// register.mjs — Pure registration logic. Takes a joinSession function so it
// can be unit-tested with a fake SDK.

import { listFlat } from "./sources.mjs";
import { createStage } from "./stage.mjs";
import { runPicker as defaultRunPicker } from "./picker-ui.mjs";

export async function registerExtension({
  joinSession,
  runPicker = defaultRunPicker,
  listFiles = listFlat,
} = {}) {
  if (typeof joinSession !== "function") {
    throw new Error("registerExtension: joinSession must be a function");
  }

  const stage = createStage();
  let session;

  const log = async (msg, opts) => {
    if (session?.log) {
      try { await session.log(msg, opts); } catch (_e) {}
    }
  };

  session = await joinSession({
    commands: [
      {
        name: "ss",
        description:
          "Open the interactive screenshot picker. Browse and stage recent " +
          "screenshots from configured sources; staged screenshots will attach " +
          "to your next prompt.",
        handler: async (_ctx) => {
          const files = listFiles();
          if (files.length === 0) {
            await log(
              "No screenshots found. Configure ~/.copilot/screenshot-picker.json or set COPILOT_SCREENSHOTS_DIR.",
              { level: "warning", ephemeral: true }
            );
            return;
          }

          const selected = await runPicker(files, {
            onLog: (level, msg) => log(msg, { level }),
          });

          if (selected.length === 0) {
            await log("Picker cancelled — no screenshots staged.", { ephemeral: true });
            return;
          }

          stage.addMany(selected);
          await log(
            `Staged ${selected.length} screenshot(s) — they will attach on your next prompt.`,
            { ephemeral: true }
          );
        },
      },
      {
        name: "ss_clear",
        description: "Clear all staged screenshots.",
        handler: async (_ctx) => {
          const n = stage.clear();
          await log(`Cleared ${n} staged screenshot(s).`, { ephemeral: true });
        },
      },
    ],
    hooks: {
      onUserPromptSubmitted: async () => {
        const list = stage.list();
        if (list.length === 0) return;
        return {
          additionalContext:
            `[screenshot-picker] ${list.length} staged screenshot(s):\n` +
            list.map((p) => `  - ${p}`).join("\n"),
        };
      },
      onSessionStart: async () => {
        await log("screenshot-picker ready — use /ss to pick screenshots.");
      },
    },
  });

  return { session, stage };
}
