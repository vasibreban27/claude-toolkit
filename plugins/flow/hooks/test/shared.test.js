// Run: node --test plugins/flow/hooks/shared.test.js
// Checks the pieces shared with the claude-desk app: worker prompt templates, protected-paths.json, REPORT_JSON docs.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { check } = require("../done-gate.js");

const FLOW = path.join(__dirname, "..", "..");
const REPO = path.join(FLOW, "..", "..");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

// ---- prompts ----
const PLACEHOLDERS = { "worker-task.md": ["task_id", "plan_path"], "worker-fix.md": ["finding_id", "finding", "plan_path"] };
for (const [file, allowed] of Object.entries(PLACEHOLDERS)) {
  test(`prompt ${file}: only known placeholders, all of them used`, () => {
    const text = read(FLOW, "prompts", file);
    const found = new Set([...text.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]));
    for (const f of found) assert.ok(allowed.includes(f), `unknown placeholder {{${f}}}`);
    for (const a of allowed) assert.ok(found.has(a), `placeholder {{${a}}} is not used`);
    assert.ok(text.endsWith("\n") && !text.includes("\r"), "LF line endings, trailing newline");
  });
}
test("prompt files are listed in docs/prompts.md and used by the skills", () => {
  const doc = read(REPO, "docs", "prompts.md");
  for (const file of Object.keys(PLACEHOLDERS)) assert.ok(doc.includes(file), `${file} missing in docs/prompts.md`);
  assert.ok(read(FLOW, "skills", "build", "SKILL.md").includes("prompts/worker-task.md"));
  assert.ok(read(FLOW, "skills", "verify", "SKILL.md").includes("prompts/worker-fix.md"));
});
test("worker prompts do not contradict the report rules", () => {
  for (const file of Object.keys(PLACEHOLDERS)) {
    const t = read(FLOW, "prompts", file);
    assert.match(t, /REPORT_JSON/);
    assert.match(t, /Never push/);
  }
});

// ---- protected-paths.json ----
test("protected-paths.json has every list, non-empty, no duplicates", () => {
  const pp = JSON.parse(read(__dirname, "..", "protected-paths.json"));
  const lists = {
    secrets: ["envSafeSuffixes", "keyExtensions", "sshKeyNames", "names", "dirs", "productionConfigEnvs"],
    noise: ["anywhere", "projectLevel", "projectMarkers", "fileSuffixes"],
    noWrite: ["lockfiles", "generatedDirs"],
  };
  for (const [group, keys] of Object.entries(lists)) {
    for (const k of keys) {
      const l = pp[group] && pp[group][k];
      assert.ok(Array.isArray(l) && l.length > 0, `${group}.${k} must be a non-empty array`);
      assert.strictEqual(new Set(l).size, l.length, `${group}.${k} has duplicates`);
      assert.ok(l.every((s) => typeof s === "string" && s.length > 0), `${group}.${k} must hold non-empty strings`);
    }
  }
  assert.strictEqual(typeof pp.secrets.awsCredentialsPath, "string");
  assert.strictEqual(typeof pp.noWrite.generatedInfix, "string");
  assert.ok(pp.noWrite.lockfiles.every((n) => n === n.toLowerCase()), "lockfile names are lowercase");
});
test("every protected-paths section is described in docs/protected-paths.md", () => {
  const doc = read(REPO, "docs", "protected-paths.md");
  for (const k of ["secrets.envSafeSuffixes", "secrets.keyExtensions", "secrets.sshKeyNames", "secrets.awsCredentialsPath", "secrets.names", "secrets.dirs", "secrets.productionConfigEnvs", "noise.anywhere", "noise.projectLevel", "noise.projectMarkers", "noise.fileSuffixes", "noWrite.lockfiles", "noWrite.generatedDirs"]) {
    assert.ok(doc.includes("`" + k), `${k} is not described`);
  }
});

// ---- docs/report-json.md ----
test("REPORT_JSON examples in docs/report-json.md pass the done gate", () => {
  const doc = read(REPO, "docs", "report-json.md");
  const examples = doc.split(/\r?\n/).filter((l) => l.startsWith("REPORT_JSON: "));
  assert.ok(examples.length >= 4, "expected the documented examples");
  for (const line of examples) {
    const j = JSON.parse(line.slice("REPORT_JSON: ".length));
    let type, text;
    if ("verdict" in j) {
      type = "reviewer";
      text = `Verdict: ${j.verdict}\n`;
    } else if ("tests_added" in j) {
      type = "test-writer";
      text = "";
    } else {
      type = "java-developer";
      text = `Task: ${j.task} – ${j.status}\n`;
    }
    if (j.stop) text += `STOP: ${j.stop}: reason\n`;
    assert.deepStrictEqual(check(type, text + line), [], line);
  }
});
test("STOP codes in docs match the gate", () => {
  const doc = read(REPO, "docs", "report-json.md");
  for (const code of require("../done-gate.js").STOP_CODES) assert.ok(doc.includes("`" + code + "`"), code);
});

// ---- conventions/ (shared by the plan skill and the workers) ----
const CONVENTIONS = { "java-developer": "java", "python-developer": "python", "node-developer": "node", "frontend-developer": "frontend", "database-engineer": "database", "general-developer": "general" };
for (const [worker, stack] of Object.entries(CONVENTIONS)) {
  test(`conventions/${stack}.md exists with Layout and Rules, and ${worker} reads it`, () => {
    const conv = read(FLOW, "conventions", `${stack}.md`);
    assert.match(conv, /^## Layout$/m, "missing ## Layout");
    assert.match(conv, /^## Rules$/m, "missing ## Rules");
    assert.ok(conv.endsWith("\n") && !conv.includes("\r"), "LF line endings, trailing newline");
    const agent = read(FLOW, "agents", `${worker}.md`);
    assert.ok(agent.includes("${CLAUDE_PLUGIN_ROOT}/conventions/" + stack + ".md"), `${worker} does not point at its conventions file`);
    assert.doesNotMatch(agent, /^## (House conventions|Guidance|Python guidance|PostgreSQL)/m, `${worker} keeps its own copy of the stack rules`);
  });
}
test("plan skill reads the conventions layout and names every stack", () => {
  const plan = read(FLOW, "skills", "plan", "SKILL.md");
  assert.ok(plan.includes("${CLAUDE_PLUGIN_ROOT}/conventions/<stack>.md"));
  for (const stack of Object.values(CONVENTIONS)) assert.ok(plan.includes("`" + stack + "`"), `plan skill does not name ${stack}`);
  assert.match(plan, /### Layout/);
  assert.match(plan, /## Project layout/);
});
