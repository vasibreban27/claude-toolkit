// Run: node --test plugins/flow/bin/plan-lint.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lint } = require("./plan-lint.js");

const VALID = fs.readFileSync(path.join(__dirname, "fixtures", "valid-plan.md"), "utf8");
const msgs = (text) => lint(text).errors.map((e) => e.msg);
const has = (text, re) => assert.ok(msgs(text).some((m) => re.test(m)), `expected /${re}/ in:\n${msgs(text).join("\n")}`);

test("valid plan has no errors", () => {
  const r = lint(VALID);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.tasks, 3);
  assert.strictEqual(r.waves, 2);
});

test("CRLF line endings are accepted", () => {
  assert.deepStrictEqual(lint(VALID.replace(/\n/g, "\r\n")).errors, []);
});

test("missing or wrong format line", () => {
  has(VALID.replace("Format: flow-plan/1", "Format: flow-plan/2"), /first line must be/);
  has(VALID.replace(/^Format: .*\n/, ""), /first line must be/);
});

test("bad autonomy value, unknown header field", () => {
  has(VALID.replace("Autonomy: checkpoints", "Autonomy: yolo"), /Autonomy must be/);
  has(VALID.replace("Autonomy: checkpoints", "Mood: calm"), /unknown header field/);
});

test("missing required task field", () => {
  for (const f of ["Size", "Sensitive", "Read first", "Done when", "Owns", "Worker", "Contract", "Status"]) {
    const text = VALID.replace(new RegExp(`^- ${f}:.*\\n`, "m"), "");
    has(text, new RegExp(`missing field "${f}"`));
  }
});

test("unknown and duplicate fields", () => {
  has(VALID.replace("- Size: M\n", "- Size: M\n- Colour: red\n"), /unknown field "Colour"/);
  has(VALID.replace("- Size: M\n", "- Size: M\n- Size: S\n"), /duplicate field "Size"/);
});

test("size L is rejected, other values too", () => {
  has(VALID.replace("- Size: M", "- Size: L"), /Size L is not allowed/);
  has(VALID.replace("- Size: M", "- Size: XL"), /Size must be/);
});

test("enum fields", () => {
  has(VALID.replace("- Sensitive: yes", "- Sensitive: maybe"), /Sensitive must be/);
  has(VALID.replace("- Model: haiku", "- Model: gpt"), /Model must be/);
  has(VALID.replace("- Tests: writer", "- Tests: always"), /Tests must be/);
  has(VALID.replace("java-developer", "ruby-developer"), /Worker must be/);
  has(VALID.replace("- Status: [ ] todo", "- Status: pending"), /Status must be/);
});

test("duplicate task id", () => {
  has(VALID.replace("### T3:", "### T2:"), /duplicate task id T2/);
});

test("dependency must be in an earlier wave", () => {
  has(VALID.replace("- Depends on: none\n- Done when: `npm", "- Depends on: T1\n- Done when: `npm"), /not in an earlier wave/);
  has(VALID.replace("Depends on: T1, T2", "Depends on: T9"), /unknown task T9/);
});

test("Owns overlap inside a wave (equal and nested)", () => {
  has(VALID.replace("web/src/app/orders/order-detail/", "src/main/java/shop/orders/OrderService.java"), /both own/);
  has(VALID.replace("web/src/app/orders/order-detail/", "src/main/java/shop/"), /both own/);
});

test("Owns overlap across waves is fine", () => {
  const text = VALID.replace("docs/notes/cancel-order.md\n- Read", "src/main/java/shop/orders/OrderService.java\n- Read");
  assert.deepStrictEqual(lint(text).errors, []);
});

test("more than 3 source files per task", () => {
  const text = VALID.replace("- Owns: docs/notes/cancel-order.md", "- Owns: a/A.java, a/B.java, a/C.java, a/D.java");
  has(text, /4 source files/);
});

test("test and doc paths do not count as source files", () => {
  const text = VALID.replace("- Owns: docs/notes/cancel-order.md", "- Owns: a/A.java, a/B.java, a/C.java, a/A.test.ts, docs/x.md, src/test/");
  assert.deepStrictEqual(lint(text).errors, []);
});

test("more than 8 tasks", () => {
  let text = VALID.replace("## Follow-ups", "");
  for (let i = 4; i <= 10; i++) {
    text += `\n### T${i}: extra ${i}\n- Status: [ ] todo\n- Worker: node-developer\n- Size: S\n- Sensitive: no\n- Contract: none\n- Owns: x/f${i}.ts\n- Read first: none\n- Depends on: T1\n- Done when: \`true\`\n- Acceptance criteria:\n  - Given a When b Then c\n`;
  }
  text += "\n## Follow-ups\n";
  has(text, /10 tasks; at most 8/);
});

test("Done when needs a backticked command", () => {
  has(VALID.replace("`mvn -q test -Dtest=Order*`", "tests pass"), /Done when must contain/);
});

test("acceptance criteria need bullets and must not rely on an agent verdict", () => {
  has(VALID.replace("  - Given a foreign order When POST cancel Then 403\n", "").replace(/  - Given .*\n/g, ""), /needs at least one/);
  has(VALID.replace("Then 403", "Then 403 and the auditor returns PASS"), /do not use an agent verdict/);
  has(VALID.replace("Then 403", "Then 403 and security-auditor reports PASS"), /do not use an agent verdict/);
});

test("task outside a wave, waves out of order, missing sections", () => {
  has(VALID.replace("## Wave 1", "## Wave 2").replace("## Wave 2\n\n### T3", "## Wave 3\n\n### T3"), /numbered 1, 2, 3/);
  has(VALID.replace("## Goal", "## Aim"), /missing "## Goal"/);
  has(VALID.replace("## Follow-ups\n", ""), /missing "## Follow-ups"/);
  has(VALID.replace("## Wave 2", "## Later"), /outside a "## Wave/);
});

test("CLI exit codes", () => {
  const script = path.join(__dirname, "plan-lint.js");
  const ok = spawnSync("node", [script, path.join(__dirname, "fixtures", "valid-plan.md")]);
  assert.strictEqual(ok.status, 0);
  assert.match(String(ok.stdout), /ok \(3 tasks, 2 waves\)/);
  const tmp = path.join(require("node:os").tmpdir(), `bad-plan-${process.pid}.md`);
  fs.writeFileSync(tmp, VALID.replace("- Size: M", "- Size: L"));
  const bad = spawnSync("node", [script, tmp]);
  fs.rmSync(tmp);
  assert.strictEqual(bad.status, 1);
  assert.match(String(bad.stderr), /Size L is not allowed/);
  assert.strictEqual(spawnSync("node", [script]).status, 2);
  assert.strictEqual(spawnSync("node", [script, "nope.md"]).status, 2);
});
