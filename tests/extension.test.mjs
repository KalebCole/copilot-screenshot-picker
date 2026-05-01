import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerExtension } from "../.github/extensions/screenshot-picker/lib/register.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");
const F1 = path.join(FIX, "screenshot-1.png");
const F2 = path.join(FIX, "screenshot-2.png");

function makeFakeSdk() {
  let captured = null;
  const session = {
    logs: [],
    log: async (msg, opts) => {
      session.logs.push({ msg, opts });
    },
  };
  const joinSession = async (config) => {
    captured = config;
    return session;
  };
  return { joinSession, session, get config() { return captured; } };
}

test("registers ss and ss_clear tools", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => [],
  });
  const names = sdk.config.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["ss", "ss_clear"]);
});

test("registers onUserPromptSubmitted hook", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => [],
  });
  assert.equal(typeof sdk.config.hooks.onUserPromptSubmitted, "function");
});

test("/ss returns no-screenshots message when no files", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => { throw new Error("should not run picker"); },
  });
  const ssTool = sdk.config.tools.find((t) => t.name === "ss");
  const result = await ssTool.handler({}, {});
  assert.match(result.textResultForLlm, /No screenshots/);
});

test("/ss returns cancelled message when picker returns []", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [],
  });
  const ssTool = sdk.config.tools.find((t) => t.name === "ss");
  const result = await ssTool.handler({}, {});
  assert.match(result.textResultForLlm, /cancelled/i);
});

test("/ss stages selections and returns image content blocks", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [
      { path: F1, mtimeMs: Date.now(), size: 100 },
      { path: F2, mtimeMs: Date.now() - 1000, size: 100 },
    ],
    runPicker: async () => [F1, F2],
  });
  const ssTool = sdk.config.tools.find((t) => t.name === "ss");
  const result = await ssTool.handler({}, {});
  assert.equal(result.resultType, "success");
  assert.match(result.textResultForLlm, /Attached 2 screenshot/);
  const imageBlocks = result.content.filter((c) => c.type === "image");
  assert.equal(imageBlocks.length, 2);
  assert.equal(imageBlocks[0].mimeType, "image/png");
  assert.match(imageBlocks[0].data, /^iVBORw0KGgo/);
});

test("hook returns nothing when stage is empty", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => [],
  });
  const out = await sdk.config.hooks.onUserPromptSubmitted({ prompt: "hi" }, {});
  assert.equal(out, undefined);
});

test("hook adds context line listing staged paths after /ss", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [F1],
  });
  const ssTool = sdk.config.tools.find((t) => t.name === "ss");
  await ssTool.handler({}, {});
  const out = await sdk.config.hooks.onUserPromptSubmitted({ prompt: "hi" }, {});
  assert.ok(out);
  assert.match(out.additionalContext, /1 staged screenshot/);
  assert.match(out.additionalContext, /screenshot-1\.png/);
});

test("/ss_clear empties the stage", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [F1],
  });
  const ssTool = sdk.config.tools.find((t) => t.name === "ss");
  const clearTool = sdk.config.tools.find((t) => t.name === "ss_clear");
  await ssTool.handler({}, {});
  const result = await clearTool.handler({}, {});
  assert.match(String(result), /Cleared 1/);
  // After clear, hook should return nothing
  const out = await sdk.config.hooks.onUserPromptSubmitted({ prompt: "hi" }, {});
  assert.equal(out, undefined);
});
