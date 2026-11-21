# Node / TypeScript conventions

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `node-developer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Source under `src/`, layer-first. For a service or CLI:

| Path | Holds |
|---|---|
| `src/routes/` (or `src/commands/` for a CLI) | entry points: parse and validate input, call a service, map errors |
| `src/services/` | business logic, no transport types |
| `src/repositories/` | database and file-store access |
| `src/types/` | shared types and schemas (one module per boundary: API, IPC, DB rows) |
| `src/config/` | configuration loading and validation |

For Electron: `src/main/` (main process, split as above), `src/preload/`, `src/renderer/` (UI, see the frontend conventions), and `src/shared/` for channel names and payload types used by all three.
Tests: next to the code as `*.test.ts`, slow ones as `*.slow.test.ts`.
Do not invent other top-level folders (`utils/`, `helpers/`, `lib/`) unless the project already uses them.

## Rules
- **Types**: no `any`; validate data crossing a boundary (IPC payloads, JSON, DB rows, process output) at the edge and type it after. Share channel and payload types between main, preload and renderer from one module.
- **Async**: no floating promises; every `await` path has error handling; never block the event loop with sync file, CPU or child-process work in hot paths; cancel or clean up long-running work.
- **Child processes and CLIs**: use `execFile`/`spawn` with an argument array, never string-built shell commands; set `cwd`; handle non-zero exit, stderr and timeouts; stream large output instead of buffering it.
- **Paths and OS**: use `path`/`os` helpers, no hardcoded separators; the project must work on Windows, macOS and Linux unless `CLAUDE.md` says otherwise.
- **Electron main/preload**: keep `contextIsolation: true` and `nodeIntegration: false`; expose a minimal typed API with `contextBridge` instead of the whole `ipcRenderer`; validate every IPC payload in the handler (never trust the renderer); no `remote`, no `shell.openExternal` on unvalidated URLs; remove listeners and windows on quit.
- **Secrets**: never log or persist API keys in plaintext; use the OS keychain (`safeStorage`) or environment variables, and keep them out of the renderer.
- **SQLite (better-sqlite3)**: prepared statements with parameters only, never string-built SQL; wrap multi-statement changes in a transaction; schema changes go through versioned migrations, not ad-hoc `ALTER`; it is a native module, so respect the project's rebuild step for Electron.
- **Errors and logging**: throw typed errors, map them once at the boundary, log with context, never swallow.
- **Tests**: unit-test pure logic; mock the process, filesystem and network boundaries, not internals; use a temporary directory or in-memory database for integration tests; cover failure paths; no real network or global state.
