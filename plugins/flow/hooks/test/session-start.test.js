// Run: node --test plugins/flow/hooks/session-start.test.js
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { contextLines, followUps } = require("../session-start.js");

const HOOK = path.join(__dirname, "..", "session-start.js");
const VALID = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "fixtures", "valid-plan.md"), "utf8");
let proj;

beforeEach(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "sstart-"));
  fs.mkdirSync(path.join(proj, "docs", "plans"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "feat/x"], { cwd: proj });
});
afterEach(() => fs.rmSync(proj, { recursive: true, force: true }));

const writePlan = (name, text) => fs.writeFileSync(path.join(proj, "docs", "plans", name), text);
const setStatus = (text, id, status) => text.replace(new RegExp(`(### ${id}:.*\\n- Status: ).*`), `$1${status}`);
function run(input = {}, env = {}) {
  const r = spawnSync("node", [HOOK], { input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: proj, ...input }), env: { ...process.env, CLAUDE_PROJECT_DIR: "", ...env } });
  return { code: r.status, out: String(r.stdout) };
}
const ctx = (r) => JSON.parse(r.out).hookSpecificOutput.additionalContext;

test("fresh plan: all todo, current wave 1, next is build", () => {
  writePlan("cancel.md", VALID);
  const r = run();
  assert.strictEqual(r.code, 0);
  assert.strictEqual(JSON.parse(r.out).hookSpecificOutput.hookEventName, "SessionStart");
  const c = ctx(r);
  assert.match(c, /branch feat\/x/);
  assert.match(c, /docs\/plans\/cancel\.md \(flow-plan\/1, autonomy checkpoints\)/);
  assert.match(c, /0 verified, 0 built, 0 blocked, 3 todo of 3; current wave 1/);
  assert.match(c, /continues with wave 1/);
  assert.ok(c.split("\n").length <= 8, "at most 8 lines");
});

test("wave 1 built: resumes at verify", () => {
  writePlan("cancel.md", setStatus(setStatus(VALID, "T1", "[~] built"), "T2", "[~] built"));
  assert.match(ctx(run()), /resumes at verify of wave 1/);
});

test("wave 1 verified: current wave 2", () => {
  writePlan("cancel.md", setStatus(setStatus(VALID, "T1", "[x] verified"), "T2", "[x] verified"));
  const c = ctx(run());
  assert.match(c, /2 verified, 0 built, 0 blocked, 1 todo of 3; current wave 2/);
  assert.match(c, /continues with wave 2/);
});

test("blocked task is shown with its note and drives the next step", () => {
  writePlan("cancel.md", setStatus(VALID, "T2", "[!] blocked: needs the contract decided"));
  const c = ctx(run());
  assert.match(c, /T2 blocked: needs the contract decided/);
  assert.match(c, /decide what the blocked task needs/);
});

test("follow-ups are counted", () => {
  writePlan("cancel.md", VALID.replace("## Follow-ups\n", "## Follow-ups\n- F2 a.ts minor thing\n- F3 b.ts other\n"));
  assert.match(ctx(run()), /2 follow-up\(s\)/);
  assert.strictEqual(followUps("## Follow-ups\n"), 0);
  assert.strictEqual(followUps("# x\n## Follow-ups\n- a\n## Next\n- not counted\n"), 1);
});

test("fully verified plan: silent", () => {
  let t = VALID;
  for (const id of ["T1", "T2", "T3"]) t = setStatus(t, id, "[x] verified");
  writePlan("cancel.md", t);
  const r = run();
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
});

test("newest unfinished plan wins, finished ones are skipped", () => {
  let done = VALID;
  for (const id of ["T1", "T2", "T3"]) done = setStatus(done, id, "[x] verified");
  writePlan("old-open.md", VALID);
  writePlan("newest-done.md", done);
  fs.utimesSync(path.join(proj, "docs", "plans", "old-open.md"), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  assert.match(ctx(run()), /docs\/plans\/old-open\.md/);
});

test("no plans directory, empty directory, non-plan markdown: silent", () => {
  fs.rmSync(path.join(proj, "docs"), { recursive: true });
  assert.strictEqual(run().out, "");
  fs.mkdirSync(path.join(proj, "docs", "plans"), { recursive: true });
  assert.strictEqual(run().out, "");
  writePlan("notes.md", "# just notes\nno tasks here\n");
  assert.strictEqual(run().out, "");
});

test("works for resume and compact sources too", () => {
  writePlan("cancel.md", VALID);
  for (const source of ["resume", "compact"]) assert.match(ctx(run({ source })), /current wave 1/);
});

test("on main the branch line says so", () => {
  writePlan("cancel.md", VALID);
  execFileSync("git", ["checkout", "-q", "-B", "main"], { cwd: proj });
  assert.match(ctx(run()), /branch main \(not a feature branch\)/);
});

test("FLOW_SESSION_CONTEXT=off, bad stdin: silent and exit 0", () => {
  writePlan("cancel.md", VALID);
  assert.strictEqual(run({}, { FLOW_SESSION_CONTEXT: "off" }).out, "");
  for (const input of ["not json", "", "null"]) {
    const r = spawnSync("node", [HOOK], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
    assert.strictEqual(r.status, 0, input);
  }
});

test("contextLines returns [] without an unfinished plan", () => {
  assert.deepStrictEqual(contextLines(proj, "feat/x"), []);
});
