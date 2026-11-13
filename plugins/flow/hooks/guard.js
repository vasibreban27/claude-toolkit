#!/usr/bin/env node
// PreToolUse guard for the flow plugin. Reads the hook JSON on stdin.
// Exit 2 + message on stderr = block the tool call (the message goes back to the agent).
// Exit 0 = allow. Any internal error also allows, so a bug here never blocks your work.

const SAFE_ENV_SUFFIX = /\.(example|sample|template|dist|defaults?)$/i;

// A path/token that points at a secret file.
function isSecretPath(raw) {
  const p = String(raw).replace(/\\/g, "/").toLowerCase();
  const base = p.split("/").pop();
  if (/^\.env([.*?].*)?$/.test(base) && !SAFE_ENV_SUFFIX.test(base)) return ".env file";
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(base)) return "key/certificate file";
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(base) && !base.endsWith(".pub")) return "SSH private key";
  if (/(^|\/)\.aws\/credentials$/.test(p) || /^credentials(\.\w+)?$/.test(base)) return "credentials file";
  if (/^secrets?(\.\w+)?$/.test(base) || /(^|\/)secrets?\//.test(p)) return "secrets file";
  if (/^application-(prod|production)\.(ya?ml|properties)$/.test(base)) return "production config";
  return null;
}

// Find secret-file references inside a shell command string.
function secretInCommand(cmd) {
  const tokens = cmd.split(/[\s"'`=<>|;&()]+/).filter(Boolean);
  for (const t of tokens) {
    const why = isSecretPath(t);
    if (why) return { token: t, why };
  }
  return null;
}

// ---- Rule: noise directories (token savers) -------------------------------------------------
// Dependencies, build output and VCS internals are never worth reading. Disable with FLOW_ALLOW_NOISE=1.
const NOISE_ANYWHERE = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".angular", ".next", ".gradle", ".idea", ".mvn/wrapper"]);
// These names are also legitimate package/folder names deep in source trees, so they only count
// when they are a top-level folder or a module's folder (first two segments below the project root).
const NOISE_TOPLEVEL = new Set(["target", "dist", "build", "out", "coverage"]);

function relSegments(p, cwd) {
  let n = String(p).replace(/\\/g, "/");
  const root = String(cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (root && n.toLowerCase().startsWith(root.toLowerCase() + "/")) n = n.slice(root.length + 1);
  return n.split("/").filter((s) => s && s !== "." && s !== "**" && s !== "*");
}

function noiseReason(p, cwd) {
  if (/(^|[\\/])!/.test(String(p))) return null; // negated glob ("!**/node_modules/**") is an exclusion, not a read
  const segs = relSegments(p, cwd);
  for (let i = 0; i < segs.length; i++) {
    if (NOISE_ANYWHERE.has(segs[i])) return segs[i];
    if (i < 2 && NOISE_TOPLEVEL.has(segs[i])) return segs[i];
  }
  const base = (segs[segs.length - 1] || "").toLowerCase();
  if (/\.min\.(js|css)$/.test(base) || /\.map$/.test(base)) return "minified/sourcemap file";
  return null;
}

// ---- Rule: protected paths (no direct writes) ------------------------------------------------
// Disable with FLOW_ALLOW_PROTECTED=1.
const LOCKFILES = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|pipfile\.lock|composer\.lock|cargo\.lock|gradle\.lockfile)$/i;

function isMigrationPath(p) {
  const n = String(p).replace(/\\/g, "/");
  const base = n.split("/").pop();
  if (/^R__/.test(base)) return false; // Flyway repeatable migrations are meant to change
  return /(^|\/)db\/(migration|changelog)\//i.test(n) || /(^|\/)migrations\//i.test(n) || /^V\d+(_\d+)*__.+\.sql$/i.test(base);
}

function git(args, cwd) {
  try {
    return require("child_process").execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

// "Applied" = the file already exists on the main branch. Migrations added on the current
// feature branch stay editable (verify may need to fix them); anything that reached main is immutable.
function existsOnMain(absPath, cwd) {
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  if (!top) return false;
  // Resolve Windows short names (SERGIU~1) and symlinks so both paths use the same spelling.
  const fs = require("fs");
  const path = require("path");
  const real = (p) => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      try {
        return path.join(fs.realpathSync.native(path.dirname(p)), path.basename(p));
      } catch {
        return p;
      }
    }
  };
  let rel = real(String(absPath)).replace(/\\/g, "/");
  const t = real(top).replace(/\\/g, "/").replace(/\/$/, "");
  if (rel.toLowerCase().startsWith(t.toLowerCase() + "/")) rel = rel.slice(t.length + 1);
  for (const main of ["origin/main", "origin/master", "main", "master"]) {
    if (git(["rev-parse", "--verify", "--quiet", main], top) === null) continue;
    const base = git(["merge-base", "HEAD", main], top);
    return Boolean(base) && git(["cat-file", "-e", `${base}:${rel}`], top) !== null;
  }
  return false;
}

function protectedReason(p, cwd) {
  const n = String(p).replace(/\\/g, "/");
  const base = n.split("/").pop();
  if (LOCKFILES.test(base)) return `lockfile ${base} is changed by the package manager (npm/pnpm/yarn/poetry/uv...), never by hand. Run the install/update command instead.`;
  if (/(^|\/)(generated|generated-sources|__generated__)\//i.test(n) || /\.generated\./i.test(base))
    return `${base} is generated code. Change the generator input (OpenAPI spec, schema, template) and regenerate.`;
  if (isMigrationPath(n) && existsOnMain(p, cwd))
    return `${base} is an applied migration (it already exists on main). Never edit it: its checksum is recorded. Add a new migration instead.`;
  return null;
}

function block(msg) {
  process.stderr.write(`BLOCKED by flow guard: ${msg}\n`);
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  try {
    const tool = input.tool_name || "";
    const ti = input.tool_input || {};
    const inSubagent = Boolean(input.agent_id || input.agent_type);

    // 1. Secret files: file tools and search tools.
    const pathKeys = ["file_path", "path", "notebook_path", "glob", "pattern"];
    if (/^(Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob)$/.test(tool)) {
      for (const k of pathKeys) {
        if (typeof ti[k] === "string") {
          const why = isSecretPath(ti[k]);
          if (why) block(`${tool} on a ${why} (${ti[k]}). Agents never read or write secrets. Use .env.example or ask the user.`);
        }
      }
    }

    const cwd = input.cwd || process.cwd();

    // 1b. Noise directories: do not read dependencies / build output (saves tokens).
    if (!process.env.FLOW_ALLOW_NOISE && /^(Read|Grep|Glob)$/.test(tool)) {
      const targets = tool === "Glob" ? [ti.path, ti.pattern] : [ti.file_path, ti.path];
      for (const t of targets) {
        if (typeof t !== "string") continue;
        const why = noiseReason(t, cwd);
        if (why) block(`${tool} on "${t}" ("${why}"). Dependencies, build output and VCS internals are not worth the tokens. Read the source files instead, or ask the user if you truly need it.`);
      }
    }

    // 1c. Protected paths: lockfiles, generated code, applied migrations.
    if (!process.env.FLOW_ALLOW_PROTECTED && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
      const target = ti.file_path || ti.notebook_path;
      if (typeof target === "string") {
        const why = protectedReason(target, cwd);
        if (why) block(why);
      }
    }

    // 2. Bash rules.
    if (tool === "Bash" && typeof ti.command === "string") {
      const cmd = ti.command;

      if (!/\.gitignore/.test(cmd)) {
        const hit = secretInCommand(cmd);
        if (hit) block(`command touches a ${hit.why} (${hit.token}). Agents never read or write secrets. Use .env.example or ask the user.`);
      }
      if (/(^|[;&|]\s*)(printenv|env|set)\s*($|[;&|>])/.test(cmd) || /\bprintenv\s+\w*(KEY|TOKEN|SECRET|PASSWORD|PASS)\w*/i.test(cmd))
        block("dumping environment variables can expose secrets.");

      if (/\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|--force-with-lease|\s\+\S)/.test(cmd)) block("force push is not allowed.");
      if (/\bgit\s+push\b[^\n]*\s(origin\s+)?(main|master)\b/.test(cmd)) block("pushing directly to main/master is not allowed. Use a feature branch and a PR.");
      if (/\bgit\s+(commit|push|merge|rebase)\b[^\n]*--no-verify/.test(cmd)) block("--no-verify skips the project's checks.");
      if (/\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME|\*|\.)(\s|$)/i.test(cmd)) block("recursive delete of a root/home/cwd target.");

      // Subagents (workers, reviewer, ...) never publish or move branches.
      if (inSubagent) {
        if (/\bgit\s+push\b/.test(cmd)) block("subagents never push. The orchestrator or the user does that via the pr skill.");
        if (/\bgit\s+(checkout|switch)\b(?![^\n]*--\s)/.test(cmd) && !/\bgit\s+checkout\s+--\s/.test(cmd))
          block("subagents never switch branches.");
        if (/\bgit\s+merge\b/.test(cmd)) block("subagents never merge.");
      }
    }
  } catch {
    process.exit(0);
  }
  process.exit(0);
});
