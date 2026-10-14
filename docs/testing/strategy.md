# Test architecture and evidence

| Layer | Boundary tested | Real dependencies | Evidence |
|---|---|---|---|
| Domain Jupiter | Money and immutable account rules | Java BigDecimal | Surefire XML |
| PostgreSQL integration | HTTP + transaction + persistence | Actual Spring context and PostgreSQL | Failsafe XML, JaCoCo |
| Cucumber | Independent client contract | Running API over HTTP | HTML, JSON, JUnit |
| TestNG | Parameterized invalid payment matrix | Running API over HTTP | Surefire/TestNG XML |
| Bruno | Versioned API collection | Running API over HTTP | CLI output |
| UI | Selected visitor workflows | Next.js + API + PostgreSQL + real browsers | JUnit, screenshots, Playwright traces |

Run `node infrastructure/verify.cjs` or `infrastructure/verify.ps1` on Chopin. Use `--format` to apply the formatter before a development verification. CI uses check-only formatting and fails on test or evidence failures. The database is reachable only inside the project Compose network; no shared host database port is needed. Containers bind the application to 127.0.0.1:18081 for local access.

PostgreSQL integration tests use a separate application instance with a random port and fresh account fixtures. Cucumber targets the packaged running service and imports no application classes. Both use the isolated project database, never CreditOps/Neon production. Tests never truncate shared tables. Domain behavior is not replaced with mocks or H2.

`LedgerIT.failureDuringInsertRollsBackBalanceAndReturnsSafeError` exercises a real unexpected service failure by creating an account-targeted trigger in the test database, calling the payment HTTP endpoint, asserting safe 500 output and unchanged database state, then removing only that test trigger and retrying successfully. It is deliberately outside the public Gherkin fixture: there is no production fault-injection endpoint.

The API uses per-account locks and unique account/idempotency keys. Tests assert both business results and exact posting counts. Concurrent tests coordinate with a latch and bounded futures rather than sleeps. The replay test posts another transaction before retrying the original payment, proving receipt identity is independent of current balance.

The source requires Java21 and Maven3.9.11. JUnit is Boot-managed Jupiter6.0.3; the concepts transfer to JUnit5, but the repository does not mislabel the version. TestNG is isolated in a separate module to avoid provider ambiguity. Selenium/Playwright cover selected journeys; Cypress and FitNesse are omitted because they add little evidence before the core is stable.

Reports and exact pass counts must be read from `docs/evidence/STATUS.md` and linked GitHub runs. Jenkinsfile requires a Linux Docker agent with Java21, Maven Wrapper support, Python3, OpenSSL and the Jenkins JUnit plugin. No Jenkins server execution is claimed until a real server accepts and runs it. Fixed local ports require one project stack per agent; concurrent builds of this job are disabled.

The first complete advisory scan flagged Jackson2/3, embedded Tomcat and the test-only schema validator's Rhino dependency. Patched compatible lines are explicitly managed in the parent POM: Jackson2.21.7/3.1.7, Tomcat11.0.25 and Rhino1.7.15.1. Versions were checked against OSV's affected ranges and Maven Central artifacts. The scan fails on every returned affected component, including test dependencies; no advisory suppression is used. This is an advisory inventory check, not proof that every dependency or container image is safe.

Browser network-failure fixtures abort transport after a genuine POST has executed, or interrupt the subsequent GET. They do not replace ledger behavior with fabricated responses. Negative UI journeys reload the account before checking unchanged persistence. Playwright trace archives redact authentication/cookie values and fail if the actual session cookie remains; raw trace archives are deleted before artifacts are published.
