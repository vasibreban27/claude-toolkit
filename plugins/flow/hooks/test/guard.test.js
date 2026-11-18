// Run: node --test plugins/flow/hooks/guard.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const GUARD = path.join(__dirname, "..", "guard.js");
let proj; // temp project on branch "main", with a Node module "web/" and a source folder "src/build/"

before(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
  fs.mkdirSync(path.join(proj, "web", "dist"), { recursive: true });
  fs.mkdirSync(path.join(proj, "src", "build"), { recursive: true });
  fs.writeFileSync(path.join(proj, "web", "package.json"), "{}");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: proj });
});
after(() => fs.rmSync(proj, { recursive: true, force: true }));

function run(tool_name, tool_input, extra = {}) {
  const env = { ...process.env };
  delete env.FLOW_ALLOW_NOISE;
  delete env.FLOW_ALLOW_PROTECTED;
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_name, tool_input, cwd: proj, ...extra }), env });
  return { code: r.status, err: String(r.stderr) };
}
const bash = (command, extra) => run("Bash", { command }, extra);
const sub = { agent_id: "a1", agent_type: "java-developer" };

// [name, tool, input, extra, "allow" | "block"]
const CASES = [
  // 1. ordinary words must not block
  ["word 'credentials' in grep", "Bash", { command: "grep -rn credentials src" }, {}, "allow"],
  ["word 'secrets' in commit message", "Bash", { command: 'git commit -m "rotate secrets handling" -- a.ts' }, {}, "allow"],
  ["Grep pattern 'credentials'", "Grep", { pattern: "credentials", path: "src" }, {}, "allow"],
  ["Grep pattern 'secrets'", "Grep", { pattern: "secrets|password" }, {}, "allow"],
  ["Glob for secrets word in name", "Glob", { pattern: "**/*credentials*.ts" }, {}, "allow"],
  // 2. source files and folders
  ["Read secrets/store.ts", "Read", { file_path: "src/secrets/store.ts" }, {}, "allow"],
  ["cat secrets/store.ts", "Bash", { command: "cat secrets/store.ts" }, {}, "allow"],
  ["Read credentials.ts", "Read", { file_path: "src/credentials.ts" }, {}, "allow"],
  ["Read src/build/Tasks.java", "Read", { file_path: "src/build/Tasks.java" }, {}, "allow"],
  ["Read abs path src/build", "Read", { file_path: path.join(proj, "src", "build", "Tasks.java") }, {}, "allow"],
  ["ls secrets/ listing", "Bash", { command: "ls secrets/" }, {}, "allow"],
  ["Read .env.example", "Read", { file_path: ".env.example" }, {}, "allow"],
  ["Read secrets/db.json", "Read", { file_path: "secrets/db.json" }, {}, "block"],
  ["cat config/secrets.yml", "Bash", { command: "cat config/secrets.yml" }, {}, "block"],
  ["cat credentials.json", "Bash", { command: "cat credentials.json" }, {}, "block"],
  ["Read .env", "Read", { file_path: ".env" }, {}, "block"],
  ["Write .env.local", "Write", { file_path: "app/.env.local" }, {}, "block"],
  ["cat .env", "Bash", { command: "cat .env" }, {}, "block"],
  ["cat .env with .gitignore tacked on", "Bash", { command: "cat .env && echo .gitignore" }, {}, "block"],
  ["add .env to .gitignore", "Bash", { command: 'echo ".env" >> .gitignore' }, {}, "allow"],
  ["Read server.pem", "Read", { file_path: "certs/server.pem" }, {}, "block"],
  ["Read ~/.aws/credentials", "Read", { file_path: "C:/Users/me/.aws/credentials" }, {}, "block"],
  ["Read application-prod.yml", "Read", { file_path: "src/main/resources/application-prod.yml" }, {}, "block"],
  ["Grep path into secrets dir", "Grep", { pattern: "x", path: "secrets/" }, {}, "block"],
  // noise directories
  ["Read node_modules", "Read", { file_path: "node_modules/x/index.js" }, {}, "block"],
  ["Read top-level dist", "Read", { file_path: "dist/app.js" }, {}, "block"],
  ["Read web/dist (module with package.json)", "Read", { file_path: "web/dist/app.js" }, {}, "block"],
  ["Glob web/dist/**", "Glob", { pattern: "web/dist/**" }, {}, "block"],
  ["Read app.min.js", "Read", { file_path: "src/app.min.js" }, {}, "block"],
  ["Glob negated node_modules", "Glob", { pattern: "!**/node_modules/**" }, {}, "allow"],
  // 3. PowerShell is covered
  ["PS Get-Content .env", "PowerShell", { command: "Get-Content .env" }, {}, "block"],
  ["PS Get-Content secrets/store.ts", "PowerShell", { command: "Get-Content secrets/store.ts" }, {}, "allow"],
  ["PS dir env:", "PowerShell", { command: "Get-ChildItem Env:" }, {}, "block"],
  ["PS $env:API_KEY", "PowerShell", { command: 'Write-Output $env:API_KEY' }, {}, "block"],
  ["PS $env:PATH", "PowerShell", { command: "Write-Output $env:PATH" }, {}, "allow"],
  ["PS Remove-Item -Recurse C:\\", "PowerShell", { command: "Remove-Item -Recurse -Force C:\\" }, {}, "block"],
  ["PS Remove-Item -Recurse build\\tmp", "PowerShell", { command: "Remove-Item -Recurse -Force build\\tmp" }, {}, "allow"],
  ["PS force push", "PowerShell", { command: "git push --force origin feature" }, {}, "block"],
  ["PS push to main", "PowerShell", { command: "git push origin HEAD:main" }, {}, "block"],
  // 4. pushes to main/master
  ["push HEAD:main", "Bash", { command: "git push origin HEAD:main" }, {}, "block"],
  ["push HEAD:refs/heads/main", "Bash", { command: "git push origin HEAD:refs/heads/main" }, {}, "block"],
  ["push feature:master", "Bash", { command: "git push origin feature:master" }, {}, "block"],
  ["push origin main", "Bash", { command: "git push origin main" }, {}, "block"],
  ["push upstream main", "Bash", { command: "git push -u upstream main" }, {}, "block"],
  ["push delete main", "Bash", { command: "git push origin :main" }, {}, "block"],
  ["git -C push main", "Bash", { command: "git -C . push origin main" }, {}, "block"],
  ["push chained", "Bash", { command: "npm test && git push origin HEAD:main" }, {}, "block"],
  ["push inside bash -c", "Bash", { command: 'bash -c "git push origin HEAD:main"' }, {}, "block"],
  ["push --all", "Bash", { command: "git push --all origin" }, {}, "block"],
  ["bare push while on main", "Bash", { command: "git push" }, {}, "block"],
  ["push HEAD while on main", "Bash", { command: "git push origin HEAD" }, {}, "block"],
  ["force push", "Bash", { command: "git push --force origin feature" }, {}, "block"],
  ["force push -f", "Bash", { command: "git push -f origin feature" }, {}, "block"],
  ["force push +refspec", "Bash", { command: "git push origin +feature" }, {}, "block"],
  ["push feature branch", "Bash", { command: "git push -u origin feature/cancel-order" }, {}, "allow"],
  ["push HEAD:feature", "Bash", { command: "git push origin HEAD:feature/x" }, {}, "allow"],
  ["push branch named maintenance", "Bash", { command: "git push origin maintenance" }, {}, "allow"],
  ["echo mentioning main after push", "Bash", { command: 'git push origin feature && echo "merged to main"' }, {}, "allow"],
  ["--no-verify", "Bash", { command: "git commit --no-verify -m x" }, {}, "block"],
  ["commit -n", "Bash", { command: "git commit -n -m x" }, {}, "block"],
  ["push -n is a dry run", "Bash", { command: "git push -n origin feature" }, {}, "allow"],
  ["env dump", "Bash", { command: "printenv" }, {}, "block"],
  ["rm -rf /", "Bash", { command: "rm -rf /" }, {}, "block"],
  ["rm -rf build", "Bash", { command: "rm -rf build" }, {}, "allow"],
  // subagent rules
  ["subagent push", "Bash", { command: "git push origin feature" }, sub, "block"],
  ["subagent merge", "Bash", { command: "git merge feature" }, sub, "block"],
  ["subagent checkout branch", "Bash", { command: "git checkout -b other" }, sub, "block"],
  ["subagent checkout -- file", "Bash", { command: "git checkout -- a.ts" }, sub, "allow"],
  ["subagent git add -A", "Bash", { command: "git add -A" }, sub, "block"],
  ["subagent git add .", "Bash", { command: "git add ." }, sub, "block"],
  ["subagent git add explicit files", "Bash", { command: "git add -- src/a.ts src/b.ts" }, sub, "allow"],
  ["subagent commit -a", "Bash", { command: 'git commit -am "x"' }, sub, "block"],
  ["subagent commit without paths", "Bash", { command: 'git commit -m "x"' }, sub, "block"],
  ["subagent commit with paths", "Bash", { command: 'git commit -m "x" -- src/a.ts' }, sub, "allow"],
  ["main thread commit without paths", "Bash", { command: 'git commit -m "x"' }, {}, "allow"],
  ["main thread git add .", "Bash", { command: "git add ." }, {}, "allow"],
  // protected paths
  ["Edit lockfile", "Edit", { file_path: "package-lock.json" }, {}, "block"],
  ["Edit generated code", "Edit", { file_path: "src/generated/Api.java" }, {}, "block"],
  ["Edit normal file", "Edit", { file_path: "src/app.ts" }, {}, "allow"],
  // never crash on odd input
  ["unknown tool", "WebFetch", { url: "https://example.com" }, {}, "allow"],
  ["Bash without command", "Bash", {}, {}, "allow"],
];

for (const [name, tool, input, extra, expect] of CASES) {
  test(`${expect}: ${name}`, () => {
    const r = run(tool, input, extra);
    assert.strictEqual(r.code, expect === "block" ? 2 : 0, r.err);
    if (expect === "block") assert.match(r.err, /BLOCKED by flow guard/);
  });
}

test("garbage stdin allows", () => {
  assert.strictEqual(spawnSync("node", [GUARD], { input: "not json" }).status, 0);
});
