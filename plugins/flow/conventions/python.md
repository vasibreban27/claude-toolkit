# Python conventions

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `python-developer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Package under `src/<package>/` (or the flat `<package>/` the project already uses), layer-first:

| Path | Holds |
|---|---|
| `api/` | HTTP routers or CLI entry points; parse and validate input, call a service, map errors |
| `services/` | business logic, no framework or HTTP types |
| `repositories/` | database access |
| `models/` | ORM models and domain types |
| `schemas/` | request/response models (Pydantic or dataclasses) |
| `core/` | settings, logging, dependency wiring |

Tests: `tests/unit/` and `tests/integration/`, mirroring the package. Migrations: `migrations/` (Alembic) at the project root.
Do not invent other top-level packages (`utils/`, `helpers/`, `lib/`, feature folders) unless the project already uses them.

## Rules
- **Environment**: use the project's existing venv/uv/poetry setup; do not create a new one or `pip install` globally.
- **Typing**: add type hints matching the project's strictness; keep `mypy`/`pyright` clean.
- **Mutable defaults**: never `def f(x=[])`; use `None` and create inside.
- **Exceptions**: catch specific exceptions, never bare `except:`; re-raise with context (`raise ... from e`).
- **Resources**: use `with` for files, connections and sessions; always set timeouts on HTTP calls.
- **Boundaries**: validate external input at the edge (Pydantic or dataclasses as the project does); keep I/O out of pure logic.
- **Async**: do not call blocking code inside `async def`; do not mix sync and async DB sessions.
- **Naive datetimes**: use timezone-aware datetimes; store UTC.
- **Tests**: pytest with fixtures; one behavior per test; no shared mutable state between tests; mock at the boundary (network, clock), not internals; cover error paths.
