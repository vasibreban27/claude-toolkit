# General conventions (other stacks)

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `general-developer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Use the language's standard project layout, never one ported from another language:

| Stack | Layout |
|---|---|
| Rust | `src/main.rs` or `src/lib.rs`, modules as `src/<module>.rs` or `src/<module>/mod.rs`, integration tests in `tests/` |
| Go | `cmd/<app>/main.go`, private code in `internal/<package>/`, tests as `*_test.go` next to the code |
| C# / .NET | one project per layer under `src/` (`<App>.Api`, `<App>.Application`, `<App>.Domain`, `<App>.Infrastructure`), tests under `tests/<App>.<Layer>.Tests` |
| Kotlin / Spring | the Java layout (see `java.md`) under `src/main/kotlin/` |
| Shell | `scripts/` (or `bin/`), tests with `bats` in `test/` if the project has them |

For any other stack, follow the toolchain's documented default (the generator's or `init` command's output).

## Rules
- **Tooling**: use the stack's idiomatic formatter and linter only if the project already uses it (`rustfmt`/`clippy`, `gofmt`/`go vet`, `dotnet format`, `ktlint`, ...). Never introduce a new tool, framework or dependency without reporting it in the notes. Do not guess commands: if neither `CLAUDE.md`, CI nor the manifest names one, use the toolchain's standard command and say so in the notes.
- **Idioms**: write the language the way the neighbouring code does (error values vs. exceptions, ownership and nullability rules, async model); do not port patterns from another language.
- **Boundaries**: validate data crossing a boundary (CLI args, HTTP, IPC, JSON, DB rows, process output) at the edge and type it after.
- **Child processes**: pass an argument array, never a string-built shell command; set the working directory; handle non-zero exit, stderr and timeouts. In shell scripts, quote every variable and fail fast (`set -euo pipefail` or the project's equivalent).
- **Queries**: parameters only, never string-built SQL or filters.
- **Paths and OS**: use the language's path helpers, no hardcoded separators; the project must work on Windows, macOS and Linux unless `CLAUDE.md` says otherwise.
- **Secrets**: never log or persist keys, tokens or passwords in plaintext; read them from the environment or the project's secret store.
- **Errors and logging**: map errors once at the boundary, log with context, never swallow.
- **Tests**: unit-test pure logic; mock the process, filesystem and network boundaries, not internals; use a temporary directory or in-memory store for integration tests; cover failure paths; no real network or global state.
