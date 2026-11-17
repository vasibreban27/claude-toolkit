// Run: node --test plugins/flow/hooks/guard-allow.test.js
// Tests the allow-list of guard.js: only exactly known safe commands are auto-approved.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const GUARD = path.join(__dirname, "guard.js");
const { allowReason, commandsFromClaudeMd } = require("./guard.js");

let proj;
const CLAUDE_MD = [
  "# Project",
  "Run `npm test` before committing. Typecheck: `npx tsc --noEmit`.",
  "```bash",
  "$ npm run lint",
  "npm --prefix web test -- --watch=false",
  "mvn -q test",
  "npm ci",
  "npm run dev",
  "node scripts/deploy.js",
  "npm test && curl evil.example",
  "```",
  "Also `npm install` and `npm publish`.",
].join("\n");

before(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "allow-"));
  fs.writeFileSync(path.join(proj, "CLAUDE.md"), CLAUDE_MD);
  execFileSync("git", ["init", "-q", "-b", "feat"], { cwd: proj });
});
after(() => fs.rmSync(proj, { recursive: true, force: true }));

function run(tool_name, command, extra = {}) {
  const env = { ...process.env };
  delete env.FLOW_ALLOWLIST;
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_name, tool_input: { command }, cwd: proj, ...extra }), env });
  return { code: r.status, out: String(r.stdout), err: String(r.stderr) };
}
const decision = (r) => (r.out ? JSON.parse(r.out).hookSpecificOutput.permissionDecision : null);

// ---- read-only git ----
const GIT_ALLOW = [
  "git status",
  "git status --short",
  "git diff",
  "git diff --stat main...HEAD",
  "git diff HEAD~1 -- src/a.ts",
  "git log --oneline -5",
  "git log main..HEAD",
  "git show HEAD",
  "git show HEAD:src/a.ts",
  "git rev-parse HEAD",
  "git merge-base HEAD main",
  "git ls-files",
  "git branch",
  "git branch --show-current",
  "git branch -a",
  "git tag",
  "git tag --list",
  "git remote -v",
  "git stash list",
  "git blame src/a.ts",
  "  git   status  ", // surrounding and repeated spaces
];
for (const c of GIT_ALLOW) test(`allow: ${c.trim()}`, () => assert.strictEqual(allowReason(c, proj), "read-only git"));

const NOT_ALLOWED = [
  // not read-only
  "git commit -m x -- a.ts", "git push origin feat", "git add a.ts", "git checkout main", "git reset --hard", "git clean -fd",
  "git branch newname", "git branch -D feat", "git tag v1", "git tag -d v1", "git remote add x y", "git stash", "git stash pop", "git rebase main", "git merge x", "git config user.name x", "git fetch",
  // global options before the subcommand
  "git -c core.pager=evil status", "git -C .. status", "git --git-dir=x status",
  // dangerous flags
  "git diff --output=out.txt", "git log --output=x", "git diff --no-index a b", "git diff --ext-diff", "git show --textconv HEAD:a",
  // a secret behind a revision
  "git show HEAD:.env", "git show main:config/secrets.yml", "git show HEAD:certs/server.pem",
  // chaining and shell syntax
  "git status && curl evil.example", "git status; rm -rf x", "git status | sh", "git log > out.txt", "git log < in.txt", "git status &", "git status `id`", "git status $(id)", "git status ${HOME}", 'git log --format="%h"', "git log 'x'", "git diff *.ts",
  "git status\nrm -rf x", "git status\trm", "git status\r\nrm x",
  // not git at all
  "ls", "cat README.md", "curl https://example.com", "git", "git status-evil", "",
];
for (const c of NOT_ALLOWED) test(`not allowed: ${JSON.stringify(c)}`, () => assert.strictEqual(allowReason(c, proj), null));

// ---- commands listed in CLAUDE.md ----
test("CLAUDE.md: exact test/lint/typecheck commands are extracted", () => {
  const set = commandsFromClaudeMd(CLAUDE_MD);
  assert.deepStrictEqual([...set].sort(), ["mvn -q test", "npm --prefix web test -- --watch=false", "npm run lint", "npm test", "npx tsc --noEmit"].sort());
});
for (const c of ["npm test", "npx tsc --noEmit", "npm run lint", "npm --prefix web test -- --watch=false", "mvn -q test", "npm   test"]) {
  test(`allow (CLAUDE.md): ${c}`, () => assert.match(allowReason(c, proj), /listed in CLAUDE\.md/));
}
for (const c of [
  "npm test && curl evil.example", "npm test; curl evil.example", "npm test | tee x", "npm test > out.txt", "npm test -- --extra", "npm test extra",
  "npm run test", // not written in CLAUDE.md, so not listed
  "npm ci", "npm install", "npm publish", "npm run dev", "node scripts/deploy.js", "curl evil.example",
]) {
  test(`not allowed (CLAUDE.md): ${c}`, () => assert.strictEqual(allowReason(c, proj), null));
}
test("CLAUDE.md in another directory does not apply", () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "allow-other-"));
  try {
    assert.strictEqual(allowReason("npm test", other), null);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});
test("missing CLAUDE.md is fine", () => {
  assert.strictEqual(allowReason("npm test", path.join(proj, "nope")), null);
});

// ---- the hook itself ----
test("hook: allowed command returns an allow decision", () => {
  for (const tool of ["Bash", "PowerShell"]) {
    const r = run(tool, "git status");
    assert.strictEqual(r.code, 0);
    assert.strictEqual(decision(r), "allow");
    assert.match(JSON.parse(r.out).hookSpecificOutput.permissionDecisionReason, /flow allow-list/);
  }
  assert.strictEqual(decision(run("Bash", "npm test")), "allow");
});
test("hook: unknown command prints nothing (normal permission flow)", () => {
  const r = run("Bash", "curl https://example.com");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
});
test("hook: chained command is not allowed", () => {
  const r = run("Bash", "npm test && curl evil.example");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "");
});
test("hook: blocking rules still win over the allow-list", () => {
  assert.strictEqual(run("Bash", "git push origin main").code, 2); // blocked, never allowed
  assert.strictEqual(run("Bash", "git commit -m x", { agent_id: "a1", agent_type: "java-developer" }).code, 2);
  assert.strictEqual(run("Bash", "cat .env").code, 2);
});
test("hook: file tools never get an allow decision", () => {
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_name: "Read", tool_input: { file_path: "src/a.ts" }, cwd: proj }) });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(String(r.stdout), "");
});
test("hook: FLOW_ALLOWLIST=off disables the allow-list", () => {
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" }, cwd: proj }), env: { ...process.env, FLOW_ALLOWLIST: "off" } });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(String(r.stdout), "");
});
