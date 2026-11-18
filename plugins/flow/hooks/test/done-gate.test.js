// Run: node --test plugins/flow/hooks/done-gate.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { check } = require("../done-gate.js");

const GATE = path.join(__dirname, "..", "done-gate.js");

const DONE = 'Task: T3 – done\nFiles: a.ts\nTests: pass\n\nREPORT_JSON: {"task":"T3","status":"done","files":["a.ts"],"tests":"pass","stop":null}';
const BLOCKED = 'Task: T3 – blocked\nSTOP: blocked: build is broken\n\nREPORT_JSON: {"task":"T3","status":"blocked","files":[],"tests":"none","stop":"blocked"}';
const REVIEW_OK = 'Verdict: PASS\nFindings: none\nREPORT_JSON: {"verdict":"PASS","open":{"blocker":0,"major":0,"minor":1},"findings":["F1"],"stop":null}';
const REVIEW_FAIL = 'Verdict: FAIL\nFindings:\n- F1 [major] a.ts:1 – x. Scenario: y. Fix: z.\nREPORT_JSON: {"verdict":"FAIL","open":{"blocker":0,"major":1,"minor":0},"findings":["F1"],"stop":null}';
const TESTS_OK = 'Tests added: 3\nREPORT_JSON: {"tests_added":3,"production_bugs":0,"stop":null}';

// [name, agent_type, message, expected number of problems matching regex or 0]
const CASES = [
  ["valid done report", "node-developer", DONE, null],
  ["valid done report, plugin-scoped agent type", "flow:java-developer", DONE, null],
  ["valid hyphen instead of en dash", "node-developer", DONE.replace("–", "-"), null],
  ["valid blocked report", "database-engineer", BLOCKED, null],
  ["valid reviewer PASS", "reviewer", REVIEW_OK, null],
  ["valid reviewer FAIL", "flow:security-auditor", REVIEW_FAIL, null],
  ["valid test-writer", "test-writer", TESTS_OK, null],
  ["missing Task line", "node-developer", DONE.replace("Task: T3 – done\n", ""), /missing the line `Task:/],
  ["missing REPORT_JSON", "node-developer", "Task: T3 – done\nall good", /last line must be `REPORT_JSON/],
  ["text after REPORT_JSON", "node-developer", DONE + "\nThanks!", /last line must be `REPORT_JSON/],
  ["invalid JSON", "node-developer", 'Task: T3 – done\nREPORT_JSON: {"task":"T3",', /not a valid one-line JSON/],
  ["JSON array rather than object", "node-developer", "Task: T3 – done\nREPORT_JSON: [1]", /not a valid one-line JSON/],
  ["task id mismatch", "node-developer", DONE.replace('"task":"T3"', '"task":"T4"'), /`task` must equal the id/],
  ["status mismatch", "node-developer", DONE.replace('"status":"done"', '"status":"partial"'), /`status` must equal/],
  ["not done without STOP line", "node-developer", BLOCKED.replace("STOP: blocked: build is broken\n", ""), /`STOP: <code>: <reason>` line is required/],
  ["old STOP code rejected", "node-developer", BLOCKED.replace("STOP: blocked:", "STOP: env-failure:"), /not one of/],
  ["STOP code and JSON differ", "node-developer", BLOCKED.replace('"stop":"blocked"', '"stop":"scope"'), /`stop` must equal the STOP line/],
  ["done but JSON stop set", "node-developer", DONE.replace('"stop":null', '"stop":"blocked"'), /`stop` must be null/],
  ["JSON without stop key", "node-developer", DONE.replace(',"stop":null', ""), /`stop` key/],
  ["reviewer without verdict", "reviewer", REVIEW_OK.replace("Verdict: PASS\n", ""), /missing the line `Verdict/],
  ["reviewer verdict mismatch", "reviewer", REVIEW_OK.replace('"verdict":"PASS"', '"verdict":"FAIL"'), /`verdict` must equal/],
  ["PASS with open major", "reviewer", REVIEW_OK.replace('"major":0', '"major":2'), /contradicts/],
  ["reviewer open counts missing", "reviewer", REVIEW_OK.replace('"open":{"blocker":0,"major":0,"minor":1},', ""), /`open` must be/],
  ["test-writer missing counts", "test-writer", 'REPORT_JSON: {"stop":null}', /tests_added/],
  // not our business: no problems
  ["unrelated agent type is ignored", "Explore", "free text, no footer", null],
  ["empty agent type is ignored", "", "free text", null],
  ["empty message fails open", "node-developer", "", null],
  ["undefined message fails open", "node-developer", undefined, null],
];

for (const [name, type, msg, re] of CASES) {
  test(name, () => {
    const problems = check(type, msg);
    if (re === null) assert.deepStrictEqual(problems, []);
    else assert.ok(problems.some((p) => re.test(p)), `expected /${re}/ in ${JSON.stringify(problems)}`);
  });
}

function run(input, env = {}) {
  const r = spawnSync("node", [GATE], { input: typeof input === "string" ? input : JSON.stringify(input), env: { ...process.env, ...env } });
  return { code: r.status, out: String(r.stdout), err: String(r.stderr) };
}
const base = { hook_event_name: "SubagentStop", agent_id: "a1", agent_type: "node-developer" };

test("CLI: malformed report is blocked once with a reason", () => {
  const r = run({ ...base, stop_hook_active: false, last_assistant_message: "done, bye" });
  assert.strictEqual(r.code, 0);
  const o = JSON.parse(r.out);
  assert.strictEqual(o.decision, "block");
  assert.match(o.reason, /Task: <id>/);
  assert.match(o.reason, /REPORT_JSON/);
});

test("CLI: stop_hook_active=true never blocks (no loop)", () => {
  const r = run({ ...base, stop_hook_active: true, last_assistant_message: "still wrong" });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
});

test("CLI: valid report passes silently", () => {
  const r = run({ ...base, stop_hook_active: false, last_assistant_message: DONE });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
});

test("CLI: garbage stdin and empty stdin fail open", () => {
  for (const input of ["not json", "", "null", "[]"]) {
    const r = run(input);
    assert.strictEqual(r.code, 0, input);
    assert.strictEqual(r.out, "", input);
  }
});

test("CLI: FLOW_DONE_GATE=off disables the gate", () => {
  const r = run({ ...base, last_assistant_message: "bad" }, { FLOW_DONE_GATE: "off" });
  assert.strictEqual(r.out, "");
});

test("CLI: non-flow agent is never blocked", () => {
  const r = run({ ...base, agent_type: "general-purpose", last_assistant_message: "bad" });
  assert.strictEqual(r.out, "");
});
