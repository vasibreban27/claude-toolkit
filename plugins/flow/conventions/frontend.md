# Frontend conventions (Angular / React)

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `frontend-developer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Feature-first under the app root (`src/app/` for Angular, `src/` for React):

| Path | Holds |
|---|---|
| `core/` | singletons used once: API client and interceptors, auth, layout shell, app config |
| `shared/` | reusable presentational components, pipes, directives, hooks, utilities with no feature knowledge |
| `features/<feature>/` | one folder per feature (kebab-case): its pages/components, its data service or hooks, its models and its routes |

Inside a feature: `components/`, `pages/` (routed), `services/` (Angular) or `hooks/` and `api/` (React), `models/`. Component files and their test sit together (`*.spec.ts` / `*.test.tsx`).
API models are typed from the plan's API contract and live in the feature's `models/` (or `core/api/` when several features share them).
Do not invent other top-level folders unless the project already uses them.

## Rules
- **Version fit**: use the patterns of the installed version only (e.g. Angular standalone/signals only if the project already uses them; React hooks, not classes). Do not migrate existing code.
- **Three states**: every data-driven view needs loading, empty and error states, not just the happy path.
- **Accessibility**: semantic elements, labels for inputs, keyboard operability, visible focus, `alt` text, ARIA only when native elements cannot do the job.
- **Forms**: validation messages tied to fields; disable submit while pending; prevent double submit.
- **Angular**: unsubscribe (`takeUntilDestroyed`, `async` pipe); avoid logic in templates; typed forms; `OnPush` if the project uses it.
- **React**: complete effect dependency arrays; do not derive state that can be computed; stable keys; clean up effects.
- **API calls**: go through the project's existing service/client layer; do not hardcode URLs.
- **Tests**: test behavior through the DOM (Testing Library, TestBed harnesses), not implementation details; mock the API layer; no snapshot-only tests.
