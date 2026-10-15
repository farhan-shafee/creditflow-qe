# CreditFlow QE

A simulated credit-card ledger and independent Java quality engineering framework for hands-on financial-services interviews. Synthetic data only; no card numbers, real customers, settlement, or money movement.

Try the [verified live demo](https://creditflow.farhan-shafee.com). Its isolated API and database sleep when idle; the measured first custom-domain account request took 17.4 seconds. See the [current completion/release record](docs/evidence/completion.md) for source commits, HTTPS, banking/UI checks and limitations. The [original custom-domain record](docs/evidence/custom-domain.md) remains historical evidence. The [earlier provider pilot](docs/evidence/provider-pilot.md) retains its historical evidence.

## Run the working system

On Chopin, from `D:\Dev\Repos\creditflow-qe`:

```powershell
.\infrastructure\verify.ps1
node infrastructure/public-verify.cjs
node infrastructure/web-verify.cjs --container-web
node infrastructure/ui-verify.cjs
node infrastructure/quality-verify.cjs
python infrastructure/verify-evidence.py --all
```

Run these commands sequentially. The PowerShell entry point generates an ignored local database password, builds the Java21 application, starts isolated PostgreSQL and runs the core reactor. Public-mode automation uses a separate API/database, private generated server key and test quotas. The UI command starts the command center at **http://localhost:3100**, local Selenium/Playwright containers and Bruno. API: http://127.0.0.1:18081 ; contract: http://127.0.0.1:18081/openapi.yaml ; liveness: http://127.0.0.1:18081/actuator/health/liveness . PostgreSQL readiness is `/actuator/health/readiness` and requires the server key in public mode. Docker, Git, Node and Python3.10+ are prerequisites. Java21/Maven3.9.11 are supplied by project containers. With a host JDK21, Maven Wrapper also supports direct development.

`node infrastructure/verify.cjs --format` applies Java formatting during development. CI uses check-only formatting. The web command verifies the Next.js build, TypeScript, request/session tests and full npm advisory status. The quality command generates the complete UI/test-scope inventory through Compose Maven, queries OSV, scans source secrets and validates configuration/runtime-role SQL. Stop only this stack with `python infrastructure/evidence-run.py cleanup`; database volumes remain intact.

## What is implemented

- Spring Boot4.1.1 / Java21 / PostgreSQL17 / Flyway: exact USD arithmetic, account ownership, expiring synthetic sessions, purchases, payments, cursor history and structured errors.
- Atomic balance and ledger updates, per-account row locks, account-scoped idempotency, replay of original receipts and rollback on a genuine database failure.
- Independent Cucumber8 / REST Assured6 / JUnit Platform framework, scenario-scoped PicoContainer context, reusable clients, schemas, concurrency and negative cases. Separate TestNG data-provider module.
- Next.js16 / TypeScript command center with server-only API access, signed HttpOnly cookies, exact-origin writes, byte-limited JSON and safe retry/reconciliation flows.
- Java Selenium and Java Playwright journeys; screenshots and redacted traces; Bruno collection; Jenkinsfile; GitHub Actions; Spotless, SpotBugs, JaCoCo, CycloneDX, OSV and Gitleaks.

The current frontend is [81fceff0](https://github.com/farhan-shafee/creditflow-qe/commit/81fceff035c5ad23e761f6a1c49196e488f24d58), validated by [both Actions jobs](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38789200927), with unchanged API [20c91f5](https://github.com/farhan-shafee/creditflow-qe/commit/20c91f5e10658ab4ce3ec7f2727c8a4934f5b314). [Current release evidence](docs/evidence/completion.md) records the promoted deployment and all 11 hosted UI/BFF tests passing after correcting the test transport deadline; the original failed run is retained. The [portfolio case study](https://farhan-shafee.com/work/creditflow-qe) is deployed from merged main source 5c52f226 and passed 19 public HTTPS/content checks plus two public browser journeys. Its production dependency audit has zero findings; five unpatched development-tool affected-package entries remain REVIEW. [Actual local Jenkins execution](docs/evidence/jenkins-execution.md) published 123 passing cases and separately ran 32 framework tests; the isolated controller was stopped after evidence export.

## Repository map

| Path | Responsibility |
|---|---|
| `services/banking-api` | Application, domain unit tests, PostgreSQL/HTTP integration tests, OpenAPI |
| `automation/api-bdd` | Independent executable Gherkin and REST Assured clients |
| `automation/api-testng` | Parameterized negative API contracts |
| `automation/ui-e2e` | Selenium, Playwright, BFF and trace-redaction tests (`-Pui`) |
| `apps/web` | Banking simulator and engineering command center |
| `bruno` | Executed versioned API collection |
| `infrastructure` | Isolated local stack, verification scripts, release preparation |

Each scope saves sanitized logs, immutable report snapshots and a manifest under `.work/evidence/runs/<scope>/<run-id>`. Manifests retain command outcomes, UTC timestamps, executed HEAD, PR head where available, source fingerprint and report hashes. Prior targets/raw diagnostics are preserved under ignored `.work/evidence/private/` and are never uploaded. `verify-evidence.py --all` rejects failed, missing, stale, changed or incomplete evidence across all five scopes. Source changes require fresh runs. Module `target` reports can be replaced by later scopes; use frozen snapshots for combined counts. Generated evidence, session credentials and databases are excluded from Git.

Read the [domain and concurrency decisions](docs/architecture/core-design.md), [test architecture](docs/testing/strategy.md), [five-minute walkthrough](docs/interview-guide/five-minute-walkthrough.md), [coding practice](docs/interview-guide/technical-practice.md), [deployment readiness](docs/deployment-readiness.md) and [portfolio integration](docs/portfolio-integration.md).

This project was built with AI assistance. It is intended to be understood, reproduced and defended personally. It does not represent employment achievements, banking settlement, regulatory compliance or a production financial platform.
