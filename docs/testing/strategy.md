# Test architecture and evidence

| Layer | Boundary tested | Real dependencies | Evidence |
|---|---|---|---|
| Domain Jupiter | Money and immutable account rules | Java BigDecimal | Surefire XML |
| PostgreSQL integration | HTTP + transaction + persistence | Actual Spring context and PostgreSQL | Failsafe XML, JaCoCo |
| Cucumber | Independent client contract | Running API over HTTP | HTML, JSON, JUnit |
| TestNG | Parameterized invalid payment matrix | Running API over HTTP | Surefire/TestNG XML |
| Bruno | Versioned API collection | Running API over HTTP | CLI output |
| UI | Selected visitor workflows | Next.js + API + PostgreSQL + real browsers | JUnit, screenshots, Playwright traces |

Run the five scope commands in README order: core (`verify.cjs` or `verify.ps1`), public (`public-verify.cjs`), web (`web-verify.cjs --container-web`), browser (`ui-verify.cjs`) and quality (`quality-verify.cjs`). Finish with `python infrastructure/verify-evidence.py --all`. Run one verification process at a time. Use `--format` for development formatting; CI checks formatting. Local orchestration requires Docker, Git, Node and Python3.10+. The database is internal to this project's Compose network. The private API binds to 127.0.0.1:18081.

Each scope archives entire prior Maven targets before execution and freezes its own sanitized reports before another scope can overwrite shared outputs. `.work/evidence/runs/` contains command logs, UTC outcomes, source/HEAD/PR provenance and original/snapshot hashes. Raw diagnostics and prior targets stay private under `.work/evidence/private/`. Validation rejects unsuccessful commands, stale source or report times, missing suites, skips, failed hooks and tampered reports. A passing old report cannot replace a current execution. `python -m unittest infrastructure/test_evidence_run.py -v` exercises these rejection paths without running application suites.

PostgreSQL integration tests use a separate application instance with a random port and fresh account fixtures. Cucumber targets the packaged running service and imports no application classes. Both use the isolated project database, never CreditOps/Neon production. Tests never truncate shared tables. Domain behavior is not replaced with mocks or H2.

Public Cucumber/TestNG runs use the separate `public-test` Compose profile, database, API and high test quotas, with no public API/database host port. Optional `CREDITFLOW_PROVISION_KEY` is read only from the automation process environment and sent alongside account ownership tokens. The local helper generates its separate test key in ignored state. Never run high-volume suites against the conservative public demo quotas or reuse a public deployment's credentials.

`LedgerIT.failureDuringInsertRollsBackBalanceAndReturnsSafeError` exercises a real unexpected service failure by creating an account-targeted trigger in the test database, calling the payment HTTP endpoint, asserting safe 500 output and unchanged database state, then removing only that test trigger and retrying successfully. It is deliberately outside the public Gherkin fixture: there is no production fault-injection endpoint.

The API uses per-account locks and unique account/idempotency keys. Tests assert both business results and exact posting counts. Concurrent tests coordinate with a latch and bounded futures rather than sleeps. The replay test posts another transaction before retrying the original payment, proving receipt identity is independent of current balance.

Cucumber independently walks cursor pages, compares receipt identities and snapshots, and sums literal initial balance plus purchases minus payments before checking current balances. Foreign-token read/write attempts leave both accounts unchanged. The Playwright lost-response journey observes the first POST201 and receipt before aborting delivery, verifies an identical retry intent and replayed receipt, then reloads and asserts exactly one persisted posting.

Health integration tests cover healthy and unavailable PostgreSQL targets. The unavailable fixture has its own application/data source and interrupts no running database. Public liveness is independent of database readiness; aggregate/readiness probes remain protected. Hikari minimum idle0, disabled keepalive and bounded idle retirement permit an unused pool to empty; the earlier Neon/Railway sleep measurements are historical pilot evidence. Current Railway production has API sleep disabled and frontend sleep enabled; see [current deployment settings](../railway-production.md).

The source requires Java21 and Maven3.9.11. JUnit is Boot-managed Jupiter6.0.3; the concepts transfer to JUnit5, but the repository does not mislabel the version. TestNG is isolated in a separate module to avoid provider ambiguity. Selenium/Playwright cover selected journeys; Cypress and FitNesse are omitted because they add little evidence before the core is stable.

Reports and exact pass counts must be read from `docs/evidence/STATUS.md` and linked GitHub runs. Jenkinsfile requires a Linux Docker agent with Git, Node, Python3.10+, Maven Wrapper support and the Jenkins JUnit plugin; Java21/Maven run in Compose. Its quality stage retains complete inventory generation, OSV, Gitleaks, Compose validation, Groovy AST parsing and bounded, rolled-back runtime-role SQL checks. JUnit reads frozen scope snapshots; sanitized run artifacts are archived even on failure. The [actual local Jenkins execution](../evidence/jenkins-execution.md) passed on pinned source 47984ef3 with 123 published cases. The quality command checks syntax only; the separate controller receipt records pipeline execution. Fixed local ports require one project stack per agent; concurrent builds of this job are disabled.

The first complete advisory scan flagged Jackson2/3, embedded Tomcat and the test-only schema validator's Rhino dependency. Patched compatible lines are explicitly managed in the parent POM: Jackson2.21.7/3.1.7, Tomcat11.0.25 and Rhino1.7.15.1. Versions were checked against OSV's affected ranges and Maven Central artifacts. The scan fails on every returned affected component, including test dependencies; no advisory suppression is used. This is an advisory inventory check, not proof that every dependency or container image is safe.

Browser network-failure fixtures abort transport after a genuine POST has executed, or interrupt the subsequent GET. They do not replace ledger behavior with fabricated responses. Negative UI journeys reload the account before checking unchanged persistence. Playwright trace archives redact authentication/cookie values and fail if the actual session cookie remains; raw trace archives are deleted before artifacts are published.
