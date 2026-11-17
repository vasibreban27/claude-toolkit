#!/usr/bin/env node
// Validates a flow plan against the format in docs/plan-format.md.
// Usage: node plan-lint.js <plan.md>   (exit 0 = valid, 1 = invalid, 2 = usage error)
// Dependency-free on purpose. Bump FORMAT together with docs/plan-format.md and the app's parser.
"use strict";
const fs = require("node:fs");

const FORMAT = "flow-plan/1";
const WORKERS = ["java-developer", "python-developer", "node-developer", "frontend-developer", "database-engineer"];
const STATUS = /^\[( |~|x|!)\] (todo|built|verified|blocked(: .+)?)$/;
const AUTONOMY = ["supervised", "checkpoints", "autonomous"];
const MODELS = ["haiku", "sonnet", "opus"];
const REQUIRED = ["Status", "Worker", "Size", "Sensitive", "Contract", "Owns", "Read first", "Depends on", "Done when", "Acceptance criteria"];
const OPTIONAL = ["Model", "Tests"];
const MAX_TASKS = 8;
const MAX_SOURCE_FILES = 3;
const FIELD = /^- ([A-Za-z][A-Za-z ]*?):[ \t]*(.*)$/;
const NON_SOURCE = /(^|\/)(tests?|__tests__|docs?)\/|\.(test|spec)\.[a-z]+$|\.md$/i;
const AUDITOR_PASS = /\b(auditor|reviewer|security[- ]audit\w*)\b[^\n]*\bPASS\b/i;

function splitList(v) {
  return v.split(",").map((s) => s.trim().replace(/^`|`$/g, "").trim()).filter(Boolean);
}
function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
function overlaps(a, b) {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const errors = [];
  const err = (line, msg) => errors.push({ line, msg });
  const plan = { lines, header: {}, headings: [], waves: [], tasks: [] };

  let wave = null;
  let task = null;
  let inAcceptance = false;
  let sawHeading = false;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = /^(#{1,6}) (.*)$/.exec(line))) {
      sawHeading = true;
      const level = m[1].length;
      const title = m[2].trim();
      inAcceptance = false;
      if (level === 2) {
        plan.headings.push(title);
        task = null;
        if ((m = /^Wave (\d+)\b/.exec(title))) {
          wave = { n: Number(m[1]), line: n, tasks: [] };
          plan.waves.push(wave);
        } else {
          wave = null;
        }
      } else if (level === 3 && /^T\d+\b/.test(title)) {
        const t = /^(T\d+): (.+)$/.exec(title);
        if (!t) err(n, `task heading must be "### T<n>: <title>", got "${title}"`);
        task = { id: t ? t[1] : title.split(/\s/)[0], title: t ? t[2] : title, line: n, wave: wave ? wave.n : null, fields: {}, acceptance: [] };
        if (!wave) err(n, `task ${task.id} is outside a "## Wave <n>" section`);
        else wave.tasks.push(task);
        plan.tasks.push(task);
      } else if (level <= 3) {
        task = null;
      }
      return;
    }
    if (!sawHeading) {
      if ((m = /^([A-Za-z][A-Za-z ]*): ?(.*)$/.exec(line))) plan.header[m[1]] = { value: m[2].trim(), line: n };
      return;
    }
    if (!task) return;
    if (inAcceptance && /^\s+- /.test(line)) {
      task.acceptance.push({ text: line.replace(/^\s+- /, ""), line: n });
      return;
    }
    if ((m = FIELD.exec(line))) {
      const name = m[1];
      inAcceptance = name === "Acceptance criteria";
      if (task.fields[name]) err(n, `${task.id}: duplicate field "${name}"`);
      else task.fields[name] = { value: m[2].trim(), line: n };
      if (![...REQUIRED, ...OPTIONAL].includes(name)) err(n, `${task.id}: unknown field "${name}"`);
    }
  });
  plan.errors = errors;
  return plan;
}

function lint(text) {
  const plan = parse(text);
  const errors = plan.errors;
  const err = (line, msg) => errors.push({ line, msg });

  // header
  if (plan.lines[0].trim() !== `Format: ${FORMAT}`) err(1, `first line must be "Format: ${FORMAT}"`);
  for (const [k, v] of Object.entries(plan.header)) {
    if (k === "Format") continue;
    if (k === "Autonomy") {
      if (!AUTONOMY.includes(v.value)) err(v.line, `Autonomy must be one of ${AUTONOMY.join(" | ")}`);
    } else err(v.line, `unknown header field "${k}"`);
  }

  // sections
  for (const h of ["Goal", "Follow-ups"]) {
    if (!plan.headings.some((t) => t === h || t.startsWith(h + " "))) err(1, `missing "## ${h}" section`);
  }
  if (!plan.waves.length) err(1, 'no "## Wave <n>" section');
  plan.waves.forEach((w, i) => {
    if (w.n !== i + 1) err(w.line, `waves must be numbered 1, 2, 3... in order (found Wave ${w.n} at position ${i + 1})`);
    if (!w.tasks.length) err(w.line, `Wave ${w.n} has no tasks`);
  });

  // tasks
  if (plan.tasks.length > MAX_TASKS) err(1, `${plan.tasks.length} tasks; at most ${MAX_TASKS} per plan, split the phase into separate plans`);
  const ids = new Map();
  for (const t of plan.tasks) {
    if (ids.has(t.id)) err(t.line, `duplicate task id ${t.id}`);
    ids.set(t.id, t);
  }
  for (const t of plan.tasks) {
    const f = (k) => (t.fields[k] ? t.fields[k].value : undefined);
    for (const k of REQUIRED) if (!t.fields[k]) err(t.line, `${t.id}: missing field "${k}"`);

    if (f("Status") !== undefined && !STATUS.test(f("Status"))) err(t.fields.Status.line, `${t.id}: Status must be "[ ] todo", "[~] built", "[x] verified" or "[!] blocked: <note>"`);
    if (f("Worker") !== undefined && !WORKERS.includes(f("Worker"))) err(t.fields.Worker.line, `${t.id}: Worker must be one of ${WORKERS.join(" | ")}`);
    if (f("Size") !== undefined) {
      if (!/^[SML]$/.test(f("Size"))) err(t.fields.Size.line, `${t.id}: Size must be S, M or L`);
      else if (f("Size") === "L") err(t.fields.Size.line, `${t.id}: Size L is not allowed, split the task`);
    }
    if (f("Sensitive") !== undefined && !/^(yes|no)$/.test(f("Sensitive"))) err(t.fields.Sensitive.line, `${t.id}: Sensitive must be yes or no`);
    if (f("Model") !== undefined && !MODELS.includes(f("Model"))) err(t.fields.Model.line, `${t.id}: Model must be one of ${MODELS.join(" | ")}`);
    if (f("Tests") !== undefined && f("Tests") !== "writer") err(t.fields.Tests.line, `${t.id}: Tests must be "writer" when present`);

    if (f("Owns") !== undefined) {
      const owns = splitList(f("Owns"));
      if (!owns.length || owns.some((o) => o.toLowerCase() === "none")) err(t.fields.Owns.line, `${t.id}: Owns must list at least one file or directory`);
      const src = owns.filter((o) => !o.endsWith("/") && !NON_SOURCE.test(normPath(o)));
      if (src.length > MAX_SOURCE_FILES) err(t.fields.Owns.line, `${t.id}: ${src.length} source files in Owns; at most ${MAX_SOURCE_FILES} per task, split the task`);
      t.owns = owns.map(normPath);
    }
    if (f("Read first") !== undefined && !splitList(f("Read first")).length) err(t.fields["Read first"].line, `${t.id}: Read first must list files or say "none"`);
    if (f("Done when") !== undefined && !/`[^`]+`/.test(f("Done when"))) err(t.fields["Done when"].line, `${t.id}: Done when must contain one command in backticks`);

    if (f("Depends on") !== undefined) {
      const raw = f("Depends on");
      const deps = /^none$/i.test(raw) ? [] : splitList(raw);
      for (const d of deps) {
        const dt = ids.get(d);
        if (!dt) err(t.fields["Depends on"].line, `${t.id}: depends on unknown task ${d}`);
        else if (dt.wave === null || t.wave === null || dt.wave >= t.wave) err(t.fields["Depends on"].line, `${t.id}: depends on ${d}, which is not in an earlier wave`);
      }
      if (!deps.length && !/^none$/i.test(raw)) err(t.fields["Depends on"].line, `${t.id}: Depends on must be task ids or "none"`);
    }

    if (t.fields["Acceptance criteria"] && !t.acceptance.length) err(t.fields["Acceptance criteria"].line, `${t.id}: Acceptance criteria needs at least one indented "- " bullet`);
    for (const a of t.acceptance) {
      if (AUDITOR_PASS.test(a.text)) err(a.line, `${t.id}: do not use an agent verdict as acceptance; write "no blocker or major findings after at most 2 fix rounds"`);
    }
  }

  // Owns overlap inside a wave
  for (const w of plan.waves) {
    for (let i = 0; i < w.tasks.length; i++) {
      for (let j = i + 1; j < w.tasks.length; j++) {
        const a = w.tasks[i], b = w.tasks[j];
        for (const pa of a.owns || []) {
          const hit = (b.owns || []).find((pb) => overlaps(pa, pb));
          if (hit !== undefined) err(b.line, `Wave ${w.n}: ${a.id} and ${b.id} both own "${pa}" / "${hit}"; move one to a later wave`);
        }
      }
    }
  }

  errors.sort((x, y) => x.line - y.line);
  return { errors, tasks: plan.tasks.length, waves: plan.waves.length };
}

module.exports = { lint, FORMAT };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: plan-lint <plan.md>");
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    console.error(`plan-lint: cannot read ${file}: ${e.message}`);
    process.exit(2);
  }
  const r = lint(text);
  if (r.errors.length) {
    for (const e of r.errors) console.error(`${file}:${e.line}: ${e.msg}`);
    console.error(`plan-lint: ${r.errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`plan-lint: ok (${r.tasks} tasks, ${r.waves} waves)`);
}
