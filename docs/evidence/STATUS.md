# Execution evidence — 2026-10-14

## Verified local gates

Executed on Chopin in `D:\Dev\Repos\creditflow-qe`, branch `feat/banking-core`, using project-scoped Java21/Maven3.9.11 and actual PostgreSQL17.11 containers. No H2 or mocked ledger replaces integration behavior.

| Gate | Actual result |
|---|---|
| Domain/request-budget unit tests | 31 passed, 0 failed/errors/skipped |
| PostgreSQL + HTTP integration | 14 passed, 0 failed/errors/skipped |
| Independent Cucumber/REST Assured | 28 scenarios passed |
| Separate TestNG data-provider suite | 6 passed, 0 failed/errors/skipped |
| Java Selenium | 2 journeys passed |
| Java Playwright | 4 journeys passed, including real-commit transport loss and failed refresh |
| BFF HTTP contracts / trace redaction | 4 + 1 passed |
| Frontend request/session unit tests | 5 passed |
| Next.js build / TypeScript | Both passed |
| Bruno CLI4.2.1 | 7 requests passed; 11/11 checks |
| Spotless / SpotBugs | Checks passed; 0 reported SpotBugs defects |
| npm audit | 0 vulnerabilities reported |
| Gitleaks source scan | No leaks found; redacted output |
| Jenkinsfile | Groovy syntax parsed; Jenkins server execution NOT RUN |
| Runtime database role SQL | Executed in a local transaction then rolled back; insert/balance-update allowed, ledger-update/expiry-update/schema-create denied |

The full core reactor finished successfully at `2026-10-14T23:09:55Z`. The browser module also completed successfully after aligning Selenium4.51 and correcting click synchronization. `infrastructure/verify-evidence.py` independently reads XML/JSON and rejects failures, skipped tests, empty scenarios and insufficient execution counts.

JaCoCo's local application report measured 222/239 lines (92.9%) and 101/119 branches (84.9%); domain lines30/30 and branches22/25. These are generated execution measurements, not a production-readiness claim. CI generates its own clean-workspace report and is the preferred reproducible evidence.

The advisory scan initially found six affected dependency components. Jackson2/3, Tomcat and test-only Rhino were patched, then OSV returned zero affected components across the resolved inventory. No advisory was suppressed. The final inventory and query timestamp are generated in CI artifacts; this is not a container-image security certification.

## Debugging and review evidence

Fresh independent source reviews identified a matrix-path quota bypass, expiry after waiting for an account lock, and unsafe UI recovery after a committed payment followed by a failed read. Genuine regression failures were observed before repairs. History defensive-copy and missing public server-access checks also failed before implementation.

Actual UI execution found `crypto.randomUUID` unavailable on the Docker HTTP hostname; traces identified the exception before any POST. The fix uses cryptographic random bytes. Selenium's smooth-scroll click interception was corrected with instant scrolling and an explicit hit-target condition, without JavaScript-click bypasses or assertion weakening. Negative UI journeys reload persisted state before asserting unchanged balances.

The rollback integration test uses an account-targeted PostgreSQL trigger in the isolated local test database; it verifies a real HTTP500, safe error output, unchanged balance/ledger and successful retry after removing only its own fixture. There is no public failure-injection endpoint.

## Environment and repository

- Chopin online: Windows11, PowerShell5.1, Git2.56.0, Docker29.8.2, Node26.11.1/npm11.20.0, D drive approximately900GB free.
- GitHub CLI authenticated as farhan-shafee over HTTPS with repo/workflow access. New public repository created and cloned; no existing repository overwritten.
- Host JRE17.0.19/JDK17.0.16 found; global Maven3.9.11 resolves the JRE. No JDK21 found in standard locations/registry. Java21 runs in project containers; no system installation performed.
- Initial wrapper/bootstrap validated, committed and pushed as `0b88290d1f3bf961377da795898b8cc9d4ded522`.
- Implementation is written by the current Codex agent through filesystem tools and Desktop Commander. No external host Codex executable was available or claimed.
- Existing CreditOps services/data preserved. A conflicting host database port was resolved by removing this project's unnecessary host database port; the database is internal to Compose.

## Remaining gates

- GitHub Actions: configuration implemented; run links and exact implementation commit will be recorded after push/PR execution. Until then, cloud CI is NOT VERIFIED.
- Deployment: PREPARED, NOT DEPLOYED. New cloud resources, public services and DNS require the owner's separate approval and confirmed provider cost/limits.
- Portfolio: existing patterns and actual hyphenated domain inspected read-only; integration proposal prepared, not applied.
- Jenkins: no server available for an actual pipeline run.
- Browser Use/cloud browser: never opened. Java headless browser suites ran locally as authorized by the master prompt.

No production-readiness, customer-activity, security-certification or professional-workplace achievement is claimed.
