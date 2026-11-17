# Protected paths (shared list)

`plugins/flow/hooks/protected-paths.json` is the one source for the path lists used by the toolkit guard (`hooks/guard.js`) and by the claude-desk app guard. Both read this file; neither keeps its own copy. The matching logic stays in each guard, so this page says what each list means.

| Section | Meaning | Rule |
|---|---|---|
| `secrets.envSafeSuffixes` | `.env.example`, `.env.sample`, ... are templates, not secrets | a `.env*` file with one of these suffixes is allowed |
| `secrets.keyExtensions` | key and certificate files (`.pem`, `.key`, ...) | never read or written |
| `secrets.sshKeyNames` | SSH private keys (`id_rsa`, ...) | never read or written |
| `secrets.awsCredentialsPath` | `.aws/credentials` | never read or written |
| `secrets.names` | files named `credentials` or `secrets` with a data extension (`.json`, `.yml`, `.env`, ...); a bare file of that name outside shell commands | never read or written |
| `secrets.dirs` | files inside a `secret/` or `secrets/` folder, except source code files (`.ts`, `.java`, `.md`, ...) | never read or written |
| `secrets.productionConfigEnvs` | `application-prod.yml` style production config | never read or written |
| `noise.anywhere` | `node_modules`, `.git`, ... | read, grep and glob are blocked (token saver); `FLOW_ALLOW_NOISE=1` lifts it |
| `noise.projectLevel` | `build`, `dist`, `target`, ... | blocked only at the project top or next to a project marker, because `src/build/` is source |
| `noise.projectMarkers` | `package.json`, `pom.xml`, ... | what makes a folder a project for the rule above |
| `noise.fileSuffixes` | minified files and source maps | read, grep and glob are blocked |
| `noWrite.lockfiles` | lockfiles (lowercase names) | no direct edits; run the package manager |
| `noWrite.generatedDirs`, `generatedInfix` | generated code | no direct edits; change the generator input |

Not in the file (logic, documented in `guard.js`): applied migrations (a migration that already exists on `main` is immutable), force-push and `main` push rules, `--no-verify`, environment dumps, recursive deletes, and the subagent rules (explicit staging and commit paths).

## Changing the lists
Edit the JSON, add a case to `plugins/flow/hooks/guard.test.js`, bump the plugin version, and tell the app. `hooks/shared.test.js` checks that every list exists and is non-empty, so a broken file fails CI instead of silently dropping protection.
