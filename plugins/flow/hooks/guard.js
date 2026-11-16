#!/usr/bin/env node
// PreToolUse guard for the flow plugin. Reads the hook JSON on stdin.
// Exit 2 + message on stderr = block the tool call (the message goes back to the agent).
// Exit 0 = allow. Any internal error also allows, so a bug here never blocks your work.
// Tests: `node --test plugins/flow/hooks/guard.test.js` (guard.test.js).

const fs = require("fs");
const path = require("path");

const SAFE_ENV_SUFFIX = /\.(example|sample|template|dist|defaults?)$/i;
// Source files that merely live in a folder or carry a name like "secrets": never secret material themselves.
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|java|kt|kts|scala|groovy|py|go|rs|cs|rb|php|swift|c|cc|cpp|h|hpp|md|html|css|scss|vue|svelte)$/;
const DATA_EXT = "json|ya?ml|toml|ini|txt|env|properties|conf|cfg|xml";

// A path/token that points at a secret file. opts.shell = the token comes from a command line, where a
// bare word such as "credentials" or "secrets" is ordinary text (a search term, a commit message), not a file.
function isSecretPath(raw, opts = {}) {
  const p = String(raw).replace(/\\/g, "/").toLowerCase();
  const base = p.split("/").pop();
  if (/^\.env([.*?].*)?$/.test(base) && !SAFE_ENV_SUFFIX.test(base)) return ".env file";
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(base)) return "key/certificate file";
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return "SSH private key";
  if (/(^|\/)\.aws\/credentials$/.test(p)) return "credentials file";
  if (new RegExp(`^(credentials|secrets?)\\.(${DATA_EXT})$`).test(base)) return "secrets file";
  if (!opts.shell && /^(credentials|secrets?)$/.test(base)) return "secrets file";
  if (/(^|\/)secrets?\//.test(p) && !SOURCE_EXT.test(base)) {
    // "secrets/" with no file after it is a directory listing in a shell command; a content search into it is not.
    if (base === "" && opts.shell) return null;
    return "secrets file";
  }
  if (/^application-(prod|production)\.(ya?ml|properties)$/.test(base)) return "production config";
  return null;
}

// ---- Command-line parsing --------------------------------------------------------------------
// Splits a shell/PowerShell command into simple commands (on ; & | newline), each a list of tokens.
// Quotes group words and hide operators; no backslash escapes, because Windows paths use them.
function segmentsOf(cmd) {
  const segs = [];
  let cur = [];
  let tok = "";
  let has = false;
  let q = null;
  const endTok = () => {
    if (has) cur.push(tok);
    tok = "";
    has = false;
  };
  const endSeg = () => {
    endTok();
    if (cur.length) segs.push(cur);
    cur = [];
  };
  for (const ch of String(cmd)) {
    if (q) {
      if (ch === q) q = null;
      else tok += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (ch === "\n" || ch === ";" || ch === "|" || ch === "&") endSeg();
    else if (/\s/.test(ch) || ch === "(" || ch === ")") endTok();
    else {
      tok += ch;
      has = true;
    }
  }
  endSeg();
  return segs;
}

const CMD_PREFIX = /^(\w+=.*|sudo|command|time|env|nohup|exec|\$)$/i;

// If the segment runs git, return { sub, args, dir } (dir = the -C directory, if any).
function gitCall(seg) {
  let i = 0;
  while (i < seg.length && CMD_PREFIX.test(seg[i])) i++;
  if (!/^(.*[\\/])?git(\.exe)?$/i.test(seg[i] || "")) return null;
  let dir = null;
  for (i++; i < seg.length; i++) {
    const t = seg[i];
    if (t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree") {
      if (t === "-C") dir = seg[i + 1];
      i++;
    } else if (!t.startsWith("-")) return { sub: t.toLowerCase(), args: seg.slice(i + 1), dir };
  }
  return null;
}

function git(args, cwd) {
  try {
    return require("child_process").execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

const isFlag = (a) => a.startsWith("-");
const isProtectedBranch = (b) => /^(main|master)$/.test(String(b).replace(/^refs\/heads\//, ""));

// Returns a block reason for a `git push` (args = everything after "push"), or null.
function pushReason(args, cwd) {
  if (args.some((a) => a === "--force" || a === "-f" || /^--force-/.test(a) || /^-[a-z]*f[a-z]*$/i.test(a))) return "force push is not allowed.";
  if (args.some((a) => a === "--mirror" || a === "--all")) return "git push --all/--mirror pushes main/master too, which is not allowed.";
  const pos = args.filter((a) => !isFlag(a));
  const specs = pos.slice(1); // pos[0] is the remote
  if (specs.some((s) => s.startsWith("+"))) return "force push is not allowed.";
  const current = () => git(["branch", "--show-current"], cwd);
  for (const spec of specs) {
    // "HEAD:main", "feature:refs/heads/main", ":main" (delete) -> the destination is what counts.
    const dst = spec.includes(":") ? spec.split(":").pop() : spec === "HEAD" ? current() : spec;
    if (dst && isProtectedBranch(dst)) return "pushing directly to main/master is not allowed. Use a feature branch and a PR.";
  }
  if (specs.length === 0 && isProtectedBranch(current() || "")) return "you are on main/master, so this pushes to it. Use a feature branch and a PR.";
  return null;
}

const BROAD_PATHSPEC = new Set([".", "./", ".\\", "*", ":/"]);

// Rules for one git call. inSubagent adds the rules for workers sharing one checkout.
function gitReason(call, cwd, inSubagent) {
  const { sub, args } = call;
  const dir = call.dir ? path.resolve(cwd, call.dir) : cwd;
  if (["commit", "push", "merge", "rebase"].includes(sub) && args.includes("--no-verify")) return "--no-verify skips the project's checks.";
  if (sub === "commit" && args.some((a) => /^-[a-z]*n[a-z]*$/i.test(a) && !/^-[a-z]*m/i.test(a))) return "commit -n skips the project's checks (it is --no-verify).";
  if (sub === "push") {
    if (inSubagent) return "subagents never push. The orchestrator or the user does that via the pr skill.";
    return pushReason(args, dir);
  }
  if (!inSubagent) return null;
  if (sub === "merge") return "subagents never merge.";
  if ((sub === "checkout" || sub === "switch") && !args.includes("--")) return "subagents never switch branches.";
  // Workers share one checkout and one index: stage and commit only the files you own.
  if (sub === "add") {
    const pos = args.filter((a) => !isFlag(a));
    const sweeping = args.some((a) => /^(-A|--all|-u|--update)$/.test(a));
    if (pos.some((a) => BROAD_PATHSPEC.has(a)) || (sweeping && pos.length === 0))
      return "other workers edit this checkout at the same time. Stage only your own files by explicit path: git add -- <file> <file>.";
  }
  if (sub === "commit") {
    if (args.some((a) => a === "--all" || /^-[a-z]*a[a-z]*$/i.test(a)))
      return "git commit -a would commit other workers' files. Commit only yours: git commit -m \"msg\" -- <file> <file>.";
    const dd = args.indexOf("--");
    if (dd === -1 || dd === args.length - 1)
      return "other workers share this checkout and index. Commit only your own files: git commit -m \"msg\" -- <file> <file> (git add new files first).";
  }
  return null;
}

// Dangerous recursive deletes (rm -rf, Remove-Item -Recurse, rd /s) of a root, home, drive or the cwd.
function deleteReason(seg) {
  const name = (seg[0] || "").toLowerCase();
  if (!["rm", "remove-item", "ri", "rmdir", "rd", "del", "erase"].includes(name)) return null;
  const flags = seg.slice(1).filter((a) => a.startsWith("-") || /^\/[a-z]$/i.test(a));
  const recursive = flags.some(
    (f) => /^\/s$/i.test(f) || /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(f) || (name === "rm" && /^-[a-z]*r[a-z]*$/i.test(f))
  );
  if (!recursive) return null;
  const dangerous = /^(\/|\\|~|\*|\.|\.\/|\.\\|\$home|\$env:userprofile|%userprofile%|[a-z]:[\\/]?)$/i;
  return seg.slice(1).some((a) => !a.startsWith("-") && dangerous.test(a)) ? "recursive delete of a root/home/drive/cwd target." : null;
}

// ---- Rule: noise directories (token savers) -------------------------------------------------
// Dependencies, build output and VCS internals are never worth reading. Disable with FLOW_ALLOW_NOISE=1.
const NOISE_ANYWHERE = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".angular", ".next", ".gradle", ".idea"]);
// These names are also legitimate package/folder names inside source trees (src/build/), so they only count
// at the top of the project, or when the folder next to them is a project (has package.json, pom.xml, ...).
const NOISE_PROJECT_LEVEL = new Set(["target", "dist", "build", "out", "coverage"]);
const PROJECT_MARKERS = ["package.json", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "Cargo.toml", "pyproject.toml", "setup.py", "go.mod", "CMakeLists.txt", "angular.json"];

function isProjectDir(dir) {
  try {
    return PROJECT_MARKERS.some((m) => fs.existsSync(path.join(dir, m)));
  } catch {
    return false;
  }
}

function relParts(p, cwd) {
  let n = String(p).replace(/\\/g, "/");
  const root = String(cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
  let dir = null; // directory the segments are relative to; null when unknown (absolute path outside the project)
  if (root && n.toLowerCase().startsWith(root.toLowerCase() + "/")) {
    n = n.slice(root.length + 1);
    dir = root;
  } else if (!/^([a-z]:)?\//i.test(n)) dir = root || null;
  return { segs: n.split("/").filter((s) => s && s !== "." && s !== "**" && s !== "*"), dir };
}

function noiseReason(p, cwd) {
  if (/(^|[\\/])!/.test(String(p))) return null; // negated glob ("!**/node_modules/**") is an exclusion, not a read
  const { segs, dir } = relParts(p, cwd);
  for (let i = 0; i < segs.length; i++) {
    if (NOISE_ANYWHERE.has(segs[i])) return segs[i];
    if (NOISE_PROJECT_LEVEL.has(segs[i]) && (i === 0 || (dir && isProjectDir(path.join(dir, ...segs.slice(0, i)))))) return segs[i];
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

// "Applied" = the file already exists on the main branch. Migrations added on the current
// feature branch stay editable (verify may need to fix them); anything that reached main is immutable.
function existsOnMain(absPath, cwd) {
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  if (!top) return false;
  // Resolve Windows short names (SERGIU~1) and symlinks so both paths use the same spelling.
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

// Returns a block message for a Bash or PowerShell command, or null.
function shellReason(cmd, cwd, inSubagent, depth = 0) {
  const segs = segmentsOf(cmd);

  for (const seg of segs) {
    // Secret files. A segment that mentions .gitignore is editing the ignore list (adding ".env" to it is fine).
    if (!seg.includes(".gitignore")) {
      for (const t of seg.flatMap((x) => x.split(/[=<>`]+/))) {
        const why = t && isSecretPath(t, { shell: true });
        if (why) return `command touches a ${why} (${t}). Agents never read or write secrets. Use .env.example or ask the user.`;
      }
    }
    const del = deleteReason(seg);
    if (del) return del;
    const call = gitCall(seg);
    if (call) {
      const why = gitReason(call, cwd, inSubagent);
      if (why) return why;
    }
    // `bash -c "git push ..."`, `powershell -Command "..."`: look inside quoted payloads.
    if (depth < 2) {
      for (const t of seg) {
        if (/\s/.test(t) && /\bgit\b/.test(t)) {
          const why = shellReason(t, cwd, inSubagent, depth + 1);
          if (why) return why;
        }
      }
    }
  }

  // Environment dumps (bash, cmd and PowerShell).
  if (/(^|[;&|]\s*)(printenv|env|set)\s*($|[;&|>])/.test(cmd) || /\bprintenv\s+\w*(KEY|TOKEN|SECRET|PASSWORD|PASS)\w*/i.test(cmd))
    return "dumping environment variables can expose secrets.";
  if (/\b(Get-ChildItem|gci|dir|ls|Get-Item|gi|Get-Content|gc|cat|type)\s+(-\w+\s+)*['"]?env:/i.test(cmd) || /\[(System\.)?Environment\]::GetEnvironmentVariables/i.test(cmd) || /\$env:\w*(KEY|TOKEN|SECRET|PASSWORD|PASS)\w*/i.test(cmd))
    return "dumping environment variables can expose secrets.";
  return null;
}

module.exports = { isSecretPath, noiseReason, shellReason, segmentsOf };

if (require.main === module) {
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
      const cwd = input.cwd || process.cwd();

      // 1. Secret files: file tools and search tools. A Grep `pattern` is a regex over file contents
      // (searching for the word "credentials" is fine); only its path and glob point at files.
      if (/^(Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob)$/.test(tool)) {
        const pathKeys = tool === "Glob" ? ["path", "pattern"] : tool === "Grep" ? ["path", "glob"] : ["file_path", "path", "notebook_path"];
        for (const k of pathKeys) {
          if (typeof ti[k] === "string") {
            const why = isSecretPath(ti[k]);
            if (why) block(`${tool} on a ${why} (${ti[k]}). Agents never read or write secrets. Use .env.example or ask the user.`);
          }
        }
      }

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

      // 2. Shell rules: Bash and PowerShell get the same checks.
      if (/^(Bash|PowerShell)$/.test(tool) && typeof ti.command === "string") {
        const why = shellReason(ti.command, cwd, inSubagent);
        if (why) block(why);
      }
    } catch {
      process.exit(0);
    }
    process.exit(0);
  });
}
