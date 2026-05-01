// register.mjs — Pure registration logic. Takes a joinSession function so it
// can be unit-tested with a fake SDK.

import { listFlat } from "./sources.mjs";
import { createStage } from "./stage.mjs";
import { buildToolResult } from "./attach.mjs";
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
    tools: [
      {
        name: "ss",
        description:
          "Open the interactive screenshot picker. Lets the user browse and " +
          "stage recent screenshots from configured sources. Staged screenshots " +
          "are returned as image content blocks so the model can see them.",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          const files = listFiles();
          if (files.length === 0) {
            await log("No screenshots found in any configured source.", { level: "warning" });
            return {
              textResultForLlm:
                "No screenshots were found in any configured source. " +
                "Configure ~/.copilot/screenshot-picker.json or set COPILOT_SCREENSHOTS_DIR.",
            };
          }

          const selected = await runPicker(files, {
            onLog: (level, msg) => log(msg, { level }),
          });

          if (selected.length === 0) {
            return { textResultForLlm: "Picker cancelled — no screenshots staged." };
          }

          stage.addMany(selected);
          await log(`Staged ${selected.length} screenshot(s).`);

          const mcpResult = buildToolResult(stage.list(), {
            warn: (msg) => log(msg, { level: "warning" }),
          });

          return {
            textResultForLlm: mcpResult.content[0].text,
            resultType: "success",
            content: mcpResult.content,
          };
        },
      },
      {
        name: "ss_clear",
        description: "Clear all staged screenshots.",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          const n = stage.clear();
          await log(`Cleared ${n} staged screenshot(s).`);
          return `Cleared ${n} staged screenshot(s).`;
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
