// Run: node --test plugins/flow/hooks/optional-hooks.test.js   (notify.js and format.js)
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { command, clean } = require("../notify.js");

const NOTIFY = path.join(__dirname, "..", "notify.js");
const FORMAT = path.join(__dirname, "..", "format.js");

// ---- notify ----
test("notify: command per platform keeps the message out of the shell", () => {
  const w = command("win32", "Allow Bash? it's \"risky\"; $(calc)");
  assert.strictEqual(w.cmd, "powershell.exe");
  assert.ok(!w.args.join(" ").includes("calc"), "message is not part of the script");
  assert.strictEqual(w.env.FLOW_NOTIFY_MSG, "Allow Bash? it's \"risky\"; $(calc)");
  const m = command("darwin", 'x" & do shell script "evil');
  assert.strictEqual(m.args[m.args.length - 1], 'x" & do shell script "evil');
  assert.ok(!m.args.slice(0, -1).join(" ").includes("evil"));
  const l = command("linux", "--help");
  assert.deepStrictEqual(l.args, ["--", "flow", "--help"]);
  assert.strictEqual(command("freebsd", "x"), null);
});
test("notify: message is cleaned and truncated", () => {
  assert.strictEqual(clean("a\nb\u0007c"), "a b c");
  assert.strictEqual(clean("x".repeat(500)).length, 200);
  assert.strictEqual(clean(""), "needs your attention");
  assert.strictEqual(clean(undefined), "needs your attention");
});
test("notify: off by default, fails open on bad input", () => {
  const env = { ...process.env };
  delete env.FLOW_NOTIFY;
  for (const input of [JSON.stringify({ message: "hi", notification_type: "idle_prompt" }), "not json", ""]) {
    const r = spawnSync("node", [NOTIFY], { input, env });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(String(r.stdout), "");
  }
  // enabled but a type we ignore, and garbage: still exit 0 and silent
  for (const input of [JSON.stringify({ message: "x", notification_type: "auth_success" }), "not json"]) {
    const r = spawnSync("node", [NOTIFY], { input, env: { ...env, FLOW_NOTIFY: "1" } });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(String(r.stdout), "");
  }
});

// ---- format ----
let proj;
const stubLog = () => path.join(proj, "prettier-calls.log");
before(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "format-"));
  const dir = path.join(proj, "node_modules", "prettier");
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "prettier", bin: "bin/prettier.cjs" }));
  // stub formatter: logs its arguments and marks the file
  fs.writeFileSync(
    path.join(dir, "bin", "prettier.cjs"),
    `const fs=require("fs");const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(stubLog())},JSON.stringify(a)+"\\n");fs.appendFileSync(a[a.length-1],"\\n/*formatted*/");`
  );
  fs.mkdirSync(path.join(proj, "src"), { recursive: true });
  fs.mkdirSync(path.join(proj, "docs", "plans"), { recursive: true });
});
after(() => fs.rmSync(proj, { recursive: true, force: true }));

function edit(rel, { tool = "Edit", env = {}, root = proj } = {}) {
  const r = spawnSync("node", [FORMAT], { input: JSON.stringify({ tool_name: tool, tool_input: { file_path: path.join(root, rel) }, cwd: root }), env: { ...process.env, CLAUDE_PROJECT_DIR: "", ...env } });
  return { code: r.status, out: String(r.stdout) };
}
const put = (rel, text = "const a = 1\n") => {
  const f = path.join(proj, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
};
const marked = (f) => fs.readFileSync(f, "utf8").includes("/*formatted*/");
const calls = () => (fs.existsSync(stubLog()) ? fs.readFileSync(stubLog(), "utf8").trim().split("\n").filter(Boolean).length : 0);

test("format: no Prettier config in the project: nothing runs", () => {
  const f = put("src/a.ts");
  const r = edit("src/a.ts");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
  assert.ok(!marked(f));
});

test("format: with a Prettier config, only the edited file is formatted", () => {
  fs.writeFileSync(path.join(proj, ".prettierrc"), "{}");
  const a = put("src/a.ts");
  const b = put("src/b.ts");
  const before = calls();
  assert.strictEqual(edit("src/a.ts").code, 0);
  assert.ok(marked(a));
  assert.ok(!marked(b));
  assert.strictEqual(calls(), before + 1);
  const args = JSON.parse(fs.readFileSync(stubLog(), "utf8").trim().split("\n").pop());
  assert.deepStrictEqual(args.slice(0, 3), ["--write", "--log-level", "silent"]);
  assert.strictEqual(path.resolve(args[3]).toLowerCase(), fs.realpathSync.native(a).toLowerCase());
});

test("format: Write and MultiEdit are handled, other tools are ignored", () => {
  const f = put("src/c.ts");
  edit("src/c.ts", { tool: "Write" });
  assert.ok(marked(f));
  const g = put("src/d.ts");
  const before = calls();
  edit("src/d.ts", { tool: "Read" });
  assert.ok(!marked(g));
  assert.strictEqual(calls(), before);
});

test("format: skipped paths and extensions", () => {
  const before = calls();
  for (const rel of ["docs/plans/p.md", "notes.md", "node_modules/prettier/x.js", "dist/out.js", "src/generated/g.ts", "src/data.txt", "src/script.py"]) {
    const f = put(rel);
    edit(rel);
    assert.ok(!marked(f), rel);
  }
  assert.strictEqual(calls(), before);
});

test("format: a file outside the project is never touched", () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "format-out-"));
  try {
    const f = path.join(other, "x.ts");
    fs.writeFileSync(f, "x");
    const r = spawnSync("node", [FORMAT], { input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: f }, cwd: proj }), env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
    assert.strictEqual(r.status, 0);
    assert.ok(!marked(f));
    const up = spawnSync("node", [FORMAT], { input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: path.join(proj, "..", path.basename(other), "x.ts") }, cwd: proj }), env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
    assert.strictEqual(up.status, 0);
    assert.ok(!marked(f));
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("format: FLOW_FORMAT=off, missing file, bad input: exit 0, silent", () => {
  const f = put("src/e.ts");
  edit("src/e.ts", { env: { FLOW_FORMAT: "off" } });
  assert.ok(!marked(f));
  assert.strictEqual(edit("src/missing.ts").code, 0);
  for (const input of ["not json", "", "null", JSON.stringify({ tool_name: "Edit", tool_input: {} })]) {
    const r = spawnSync("node", [FORMAT], { input, env: process.env });
    assert.strictEqual(r.status, 0, input);
    assert.strictEqual(String(r.stdout), "");
  }
});

test("format: a crashing formatter leaves the file alone and still exits 0", () => {
  const bin = path.join(proj, "node_modules", "prettier", "bin", "prettier.cjs");
  const saved = fs.readFileSync(bin, "utf8");
  fs.writeFileSync(bin, "process.exit(3)");
  try {
    const f = put("src/f.ts");
    const r = edit("src/f.ts");
    assert.strictEqual(r.code, 0);
    assert.ok(!marked(f));
  } finally {
    fs.writeFileSync(bin, saved);
  }
});
