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

function makeCtx(name, args = "") {
  return {
    sessionId: "test",
    command: `/${name}${args ? ` ${args}` : ""}`,
    commandName: name,
    args,
  };
}

test("registers ss and ss_clear as slash commands", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => [],
  });
  const names = sdk.config.commands.map((c) => c.name).sort();
  assert.deepEqual(names, ["ss", "ss_clear"]);
});

test("does not register MCP tools (commands only)", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => [],
  });
  assert.equal(sdk.config.tools, undefined, "tools field must not be set");
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

test("/ss logs warning when no screenshots are configured", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [],
    runPicker: async () => { throw new Error("picker should not run"); },
  });
  const ssCmd = sdk.config.commands.find((c) => c.name === "ss");
  const result = await ssCmd.handler(makeCtx("ss"));
  assert.equal(result, undefined, "command handler must return void");
  const warn = sdk.session.logs.find((l) => /No screenshots/.test(l.msg));
  assert.ok(warn, "expected a 'No screenshots' log");
  assert.equal(warn.opts.level, "warning");
});

test("/ss logs cancelled message when picker returns no selection", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [],
  });
  const ssCmd = sdk.config.commands.find((c) => c.name === "ss");
  await ssCmd.handler(makeCtx("ss"));
  const cancel = sdk.session.logs.find((l) => /cancelled/i.test(l.msg));
  assert.ok(cancel, "expected a 'cancelled' log");
});

test("/ss stages selections and logs count", async () => {
  const sdk = makeFakeSdk();
  const { stage } = await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [
      { path: F1, mtimeMs: Date.now(), size: 100 },
      { path: F2, mtimeMs: Date.now() - 1000, size: 100 },
    ],
    runPicker: async () => [F1, F2],
  });
  const ssCmd = sdk.config.commands.find((c) => c.name === "ss");
  const result = await ssCmd.handler(makeCtx("ss"));
  assert.equal(result, undefined);
  assert.equal(stage.list().length, 2);
  const staged = sdk.session.logs.find((l) => /Staged 2 screenshot/.test(l.msg));
  assert.ok(staged, "expected a 'Staged 2 screenshot' log");
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

test("hook adds context line listing staged paths after /ss runs", async () => {
  const sdk = makeFakeSdk();
  await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [F1],
  });
  const ssCmd = sdk.config.commands.find((c) => c.name === "ss");
  await ssCmd.handler(makeCtx("ss"));
  const out = await sdk.config.hooks.onUserPromptSubmitted({ prompt: "hi" }, {});
  assert.ok(out);
  assert.match(out.additionalContext, /1 staged screenshot/);
  assert.match(out.additionalContext, /screenshot-1\.png/);
});

test("/ss_clear empties the stage and logs the count", async () => {
  const sdk = makeFakeSdk();
  const { stage } = await registerExtension({
    joinSession: sdk.joinSession,
    listFiles: () => [{ path: F1, mtimeMs: Date.now(), size: 100 }],
    runPicker: async () => [F1],
  });
  const ssCmd = sdk.config.commands.find((c) => c.name === "ss");
  const clearCmd = sdk.config.commands.find((c) => c.name === "ss_clear");
  await ssCmd.handler(makeCtx("ss"));
  assert.equal(stage.list().length, 1);
  await clearCmd.handler(makeCtx("ss_clear"));
  assert.equal(stage.list().length, 0);
  const cleared = sdk.session.logs.find((l) => /Cleared 1/.test(l.msg));
  assert.ok(cleared, "expected a 'Cleared 1' log");
  // After clear, hook should return nothing.
  const out = await sdk.config.hooks.onUserPromptSubmitted({ prompt: "hi" }, {});
  assert.equal(out, undefined);
});
