#!/usr/bin/env node
// SessionStart hook (matcher startup|resume|compact): injects at most 8 short lines about the active plan,
// so a resumed or compacted build keeps its place without asking `status`. Silent when there is no unfinished plan.
// Fails open. Disable with FLOW_SESSION_CONTEXT=off. Costs tokens every session, so keep the output short.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parse } = require("../bin/plan-lint.js");

const klass = (status) => {
  const c = /^\[(.)\]/.exec(status || "");
  return c ? ({ " ": "todo", "~": "built", x: "verified", "!": "blocked" }[c[1]] || "todo") : "todo";
};

// Newest plan in docs/plans/ that still has a task that is not verified; null if none.
function activePlan(root) {
  const dir = path.join(root, "docs", "plans");
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }));
  } catch (_) {
    return null;
  }
  files.sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const rel = `docs/plans/${f}`;
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const plan = parse(text);
    if (!plan.tasks.length) continue;
    const tasks = plan.tasks.map((t) => ({ id: t.id, wave: t.wave, state: klass(t.fields.Status && t.fields.Status.value), note: (t.fields.Status && t.fields.Status.value) || "" }));
    if (tasks.every((t) => t.state === "verified")) continue;
    return { rel, text, plan, tasks };
  }
  return null;
}

function followUps(text) {
  const i = text.search(/^## Follow-ups\s*$/m);
  if (i < 0) return 0;
  const rest = text.slice(i).split(/\r?\n/).slice(1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).filter((l) => /^\s*(-|\*|\d+\.) \S/.test(l)).length;
}

// Returns the context lines (array) or [] when there is nothing to say.
function contextLines(root, branch) {
  const p = activePlan(root);
  if (!p) return [];
  const { tasks, rel } = p;
  const count = (s) => tasks.filter((t) => t.state === s).length;
  const wave = Math.min(...tasks.filter((t) => t.state !== "verified").map((t) => t.wave || 99));
  const inWave = tasks.filter((t) => t.wave === wave);
  const blocked = tasks.filter((t) => t.state === "blocked");
  const fmt = p.plan.lines[0].trim();
  const auto = p.plan.header.Autonomy ? `, autonomy ${p.plan.header.Autonomy.value}` : "";
  const lines = ["flow: unfinished plan in this project (resume with /flow:build, details with /flow:status)"];
  if (branch) lines.push(`flow: branch ${branch}${/^(main|master)$/.test(branch) ? " (not a feature branch)" : ""}`);
  lines.push(`flow: plan ${rel} (${fmt.replace(/^Format: /, "") || "unknown format"}${auto})`);
  lines.push(`flow: ${count("verified")} verified, ${count("built")} built, ${count("blocked")} blocked, ${count("todo")} todo of ${tasks.length}; current wave ${wave}`);
  for (const b of blocked.slice(0, 2)) lines.push(`flow: ${b.id} ${b.note.replace(/^\[.\]\s*/, "")}`);
  let next;
  if (blocked.length) next = "decide what the blocked task needs, then /flow:build " + rel;
  else if (inWave.length && inWave.every((t) => t.state === "built")) next = `/flow:build ${rel} resumes at verify of wave ${wave}`;
  else next = `/flow:build ${rel} continues with wave ${wave}`;
  lines.push(`flow: next: ${next}`);
  const fu = followUps(p.text);
  if (fu) lines.push(`flow: ${fu} follow-up(s) in the plan`);
  return lines;
}

function main() {
  if (process.env.FLOW_SESSION_CONTEXT === "off") return;
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8")) || {};
  } catch (_) {
    return;
  }
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  let branch = "";
  try {
    branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).toString().trim();
  } catch (_) {}
  const lines = contextLines(root, branch);
  if (!lines.length) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") } }));
}

module.exports = { contextLines, activePlan, followUps };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    try {
      process.stderr.write("flow session-start: " + e.message + "\n");
    } catch (_) {}
  }
  process.exitCode = 0;
}
