#!/usr/bin/env node
// Notification hook: a desktop alert when the session needs you (permission prompt, idle, a question), so you
// can walk away during an autonomous run. Opt-in: set FLOW_NOTIFY=1, otherwise this exits at once.
// The message goes to the OS command through an environment variable or a plain argument, never into a shell
// string. Fails open. The desktop app has its own notifications; use this for the terminal.
"use strict";
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const TYPES = new Set(["permission_prompt", "idle_prompt", "elicitation_dialog"]);

const clean = (s) => String(s || "needs your attention").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200) || "needs your attention";

const WIN_SCRIPT =
  "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; " +
  "$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; " +
  "$n.ShowBalloonTip(5000, 'flow', $env:FLOW_NOTIFY_MSG, [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 6; $n.Dispose()";

// The OS command for a message: { cmd, args, env } or null when the platform has no known notifier.
function command(platform, message) {
  const msg = clean(message);
  if (platform === "win32") return { cmd: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WIN_SCRIPT], env: { FLOW_NOTIFY_MSG: msg } };
  if (platform === "darwin") return { cmd: "osascript", args: ["-e", "on run argv", "-e", 'display notification (item 1 of argv) with title "flow"', "-e", "end run", msg], env: {} };
  if (platform === "linux") return { cmd: "notify-send", args: ["--", "flow", msg], env: {} };
  return null;
}

function main() {
  if (process.env.FLOW_NOTIFY !== "1") return;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (_) {
    return;
  }
  if (!input || (input.notification_type && !TYPES.has(input.notification_type))) return;
  const c = command(process.platform, input.message);
  if (!c) return;
  const child = spawn(c.cmd, c.args, { env: { ...process.env, ...c.env }, stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

module.exports = { command, clean, TYPES };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    try {
      process.stderr.write("flow notify: " + e.message + "\n");
    } catch (_) {}
  }
  process.exitCode = 0;
}
