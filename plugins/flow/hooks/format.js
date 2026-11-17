#!/usr/bin/env node
// PostToolUse hook (Write|Edit|MultiEdit): formats only the file that was just edited, and only if the project
// has a formatter configured and installed: Prettier (local node_modules + a Prettier config) for web/Node files,
// Ruff (a [tool.ruff] section in pyproject.toml) for Python. Never runs a typecheck or a whole-project command.
// No output, fails open (exit 0). Disable with FLOW_FORMAT=off. Costs a Node start plus the formatter per edit.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PRETTIER_EXT = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".json", ".css", ".scss", ".html", ".vue"]);
const PRETTIER_CONFIGS = [".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.mjs", ".prettierrc.toml", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs", "prettier.config.ts"];
const SKIP_PATH = /(^|\/)(node_modules|\.git|dist|build|target|coverage|generated|__generated__|docs\/plans)\//;

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
};
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
};

// Directories from the file's directory up to the project root (inclusive).
function chain(file, root) {
  const dirs = [];
  let d = path.dirname(file);
  for (;;) {
    dirs.push(d);
    if (d === root || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  return dirs;
}

// { script, cwd } for a local Prettier with a config in the chain, else null.
function findPrettier(dirs) {
  const hasConfig = dirs.some((d) => PRETTIER_CONFIGS.some((c) => exists(path.join(d, c))) || ((readJson(path.join(d, "package.json")) || {}).prettier !== undefined));
  if (!hasConfig) return null;
  for (const d of dirs) {
    const pkgPath = path.join(d, "node_modules", "prettier", "package.json");
    const pkg = readJson(pkgPath);
    if (!pkg) continue;
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin && pkg.bin.prettier;
    if (!bin) return null;
    const script = path.join(path.dirname(pkgPath), bin);
    return exists(script) ? { script, cwd: d } : null;
  }
  return null;
}

function hasRuffConfig(dirs) {
  return dirs.some((d) => {
    try {
      return /^\s*\[tool\.ruff[\].]/m.test(fs.readFileSync(path.join(d, "pyproject.toml"), "utf8")) || exists(path.join(d, "ruff.toml"));
    } catch (_) {
      return false;
    }
  });
}

function real(p) {
  try {
    return fs.realpathSync.native(p);
  } catch (_) {
    return p;
  }
}

// Returns what ran ("prettier" | "ruff") or null.
function formatFile(file, root) {
  const abs = real(path.resolve(root, file));
  const rootReal = real(root);
  const rel = path.relative(rootReal, abs).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || SKIP_PATH.test(rel + "/") || !exists(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  const dirs = chain(abs, rootReal);
  const opts = { stdio: "ignore", timeout: 15000, windowsHide: true };
  if (PRETTIER_EXT.has(ext)) {
    const p = findPrettier(dirs);
    if (!p) return null;
    execFileSync(process.execPath, [p.script, "--write", "--log-level", "silent", abs], { ...opts, cwd: p.cwd });
    return "prettier";
  }
  if (ext === ".py" && hasRuffConfig(dirs)) {
    execFileSync("ruff", ["format", "--quiet", abs], { ...opts, cwd: path.dirname(abs) });
    return "ruff";
  }
  return null;
}

function main() {
  if (process.env.FLOW_FORMAT === "off") return;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (_) {
    return;
  }
  const ti = (input && input.tool_input) || {};
  const file = ti.file_path;
  if (typeof file !== "string" || !/^(Write|Edit|MultiEdit)$/.test(input.tool_name || "")) return;
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  try {
    formatFile(file, root);
  } catch (_) {
    // formatter missing, crashed or timed out: leave the file as the agent wrote it
  }
}

module.exports = { formatFile, findPrettier, hasRuffConfig };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    try {
      process.stderr.write("flow format: " + e.message + "\n");
    } catch (_) {}
  }
  process.exitCode = 0;
}
