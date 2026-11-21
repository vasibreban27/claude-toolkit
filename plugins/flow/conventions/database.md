# Database conventions

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `database-engineer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Migrations live where the project's migration tool expects them:

| Tool | Path |
|---|---|
| Flyway (Java) | `src/main/resources/db/migration/V<n>__<description>.sql` |
| Liquibase | `src/main/resources/db/changelog/` with a master changelog |
| Alembic (Python) | `migrations/versions/` |
| Node (knex, node-pg-migrate, better-sqlite3 runner) | `migrations/` at the project root, or `src/main/db/migrations/` in Electron |
| MongoDB | `migrations/` with the project's runner; schema validators next to them |

One migration per task. A database task owns only its new migration file(s), never application code.

## Rules
### PostgreSQL
- Use the project's migration tool (Flyway or Liquibase) and its naming/version scheme. Never edit a migration that may already be applied; add a new one.
- Safe changes on big tables: add a nullable column, backfill in batches, then add the constraint (`NOT VALID` then `VALIDATE`); `CREATE INDEX CONCURRENTLY` (outside a transaction block); avoid rewriting the table or long locks.
- Every new query path gets an index that matches its filter and sort order; check with `EXPLAIN` on realistic data. Do not add indexes nobody uses.
- Declare primary keys, foreign keys, `NOT NULL` and `CHECK` constraints; use `timestamptz` and `numeric` for money.
- Make destructive changes (drop, rename) a separate, later migration after the code stops using the old name.

### MongoDB
- Design the document around the access pattern. Avoid unbounded arrays and very large documents.
- Create indexes explicitly (compound order: equality, sort, range); check with `explain()`. Use TTL and unique indexes where the domain needs them.
- Add schema validation (`$jsonSchema`) for collections the project controls; evolve it in a backward-compatible way.
- Index builds on large collections must not block traffic; report if the project has no migration mechanism.
