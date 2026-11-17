// Run: node --test plugins/flow/hooks/timing.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TIMING = path.join(__dirname, "timing.js");
let proj;
before(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "timing-"));
});
after(() => fs.rmSync(proj, { recursive: true, force: true }));

const DONE = 'Task: T7 – done\nREPORT_JSON: {"task":"T7","status":"done","files":[],"tests":"pass","stop":null}';
const log = () => path.join(proj, ".flow", "timing.jsonl");
const rows = () => (fs.existsSync(log()) ? fs.readFileSync(log(), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
function run(input, env = {}) {
  const r = spawnSync("node", [TIMING], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: proj, ...env },
  });
  return { code: r.status, out: String(r.stdout), err: String(r.stderr) };
}
const ev = (name, extra = {}) => ({ hook_event_name: name, session_id: "s1", agent_id: "ag1", agent_type: "node-developer", cwd: proj, ...extra });

test("start then stop appends one row with duration, turns and task id", () => {
  const transcript = path.join(proj, "agent.jsonl");
  fs.writeFileSync(transcript, ['{"type":"user"}', '{"type":"assistant"}', "garbage", '{"message":{"role":"assistant"}}', '{"type":"assistant"}', ""].join("\n"));
  assert.strictEqual(run(ev("SubagentStart")).code, 0);
  assert.ok(fs.existsSync(path.join(proj, ".flow", "running", "ag1")));
  // age the start marker so duration is clearly positive
  fs.writeFileSync(path.join(proj, ".flow", "running", "ag1"), String(Date.now() - 5000));
  const r = run(ev("SubagentStop", { stop_hook_active: false, last_assistant_message: DONE, agent_transcript_path: transcript }));
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
  const [row] = rows();
  assert.strictEqual(rows().length, 1);
  assert.strictEqual(row.agent_type, "node-developer");
  assert.strictEqual(row.task, "T7");
  assert.strictEqual(row.turns, 3);
  assert.ok(row.duration_ms >= 5000 && row.duration_ms < 60000, String(row.duration_ms));
  assert.ok(!fs.existsSync(path.join(proj, ".flow", "running", "ag1")), "marker removed");
  assert.strictEqual(fs.readFileSync(path.join(proj, ".flow", ".gitignore"), "utf8").trim(), "*");
});

test("stop without a recorded start still logs, duration is null", () => {
  run(ev("SubagentStop", { agent_id: "ag2", last_assistant_message: DONE }));
  const row = rows().find((x) => x.agent_id === "ag2");
  assert.strictEqual(row.duration_ms, null);
  assert.strictEqual(row.turns, null);
});

test("a stop the done gate will send back is not logged (it stops again later)", () => {
  const before = rows().length;
  run(ev("SubagentStop", { agent_id: "ag3", stop_hook_active: false, last_assistant_message: "no footer" }));
  assert.strictEqual(rows().length, before);
  run(ev("SubagentStop", { agent_id: "ag3", stop_hook_active: true, last_assistant_message: "still no footer" }));
  assert.strictEqual(rows().length, before + 1);
});

test("non-flow agents are ignored", () => {
  const before = rows().length;
  run(ev("SubagentStop", { agent_id: "ag4", agent_type: "Explore", last_assistant_message: DONE }));
  assert.strictEqual(rows().length, before);
});

test("FLOW_TIMING=off writes nothing", () => {
  const before = rows().length;
  run(ev("SubagentStop", { agent_id: "ag5", last_assistant_message: DONE }), { FLOW_TIMING: "off" });
  assert.strictEqual(rows().length, before);
});

test("bad input and unwritable directory fail open (exit 0)", () => {
  for (const input of ["not json", "", "null", "[]"]) assert.strictEqual(run(input).code, 0, input);
  const blocker = path.join(proj, "afile");
  fs.writeFileSync(blocker, "x");
  const r = run(ev("SubagentStart", { agent_id: "ag6" }), { CLAUDE_PROJECT_DIR: blocker });
  assert.strictEqual(r.code, 0);
});

test("agent ids with path characters cannot escape .flow/running", () => {
  run(ev("SubagentStart", { agent_id: "../../evil" }));
  assert.ok(!fs.existsSync(path.join(proj, "evil")));
  assert.ok(fs.existsSync(path.join(proj, ".flow", "running", ".._.._evil")));
});
