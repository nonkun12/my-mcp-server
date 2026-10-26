import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("MCP HTTP payload size is bounded and raw request bodies are not logged", async () => {
  const source = await read("../index.js");
  assert.match(source, /express\.json\(\{\s*limit:\s*["']256kb["']\s*\}\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(req\.body/);
});

test("broad admin note export is not registered as a public MCP tool", async () => {
  const source = await read("../tools/index.js");
  assert.doesNotMatch(source, /registerAdminListNotesTool/);
});

test("admin note export requires a distinct admin credential", async () => {
  const source = await read("../tools/admin-list-notes.js");
  assert.match(source, /MCP_ADMIN_API_KEY/);
  assert.match(source, /adminKey === process\.env\.MCP_API_KEY/);
});

test("PostgreSQL TLS certificate validation is enabled", async () => {
  const source = await read("../database.js");
  assert.match(source, /rejectUnauthorized:\s*true/);
});

test("note and memory contents are not emitted to application logs", async () => {
  const saveNote = await read("../tools/save-note.js");
  const memory = await read("../tools/memory.js");
  const reminders = await read("../tools/reminder.js");
  assert.doesNotMatch(saveNote, /console\.log\([\s\S]{0,160}\bbody\b/);
  assert.doesNotMatch(memory, /GET_ALL_MEMORY RESULT/);
  assert.doesNotMatch(reminders, /TOOL CALL.*message=\$\{message\}/);
});
