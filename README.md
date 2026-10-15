# CreditFlow QE

A simulated credit-card ledger and independent Java quality engineering framework for hands-on financial-services interviews. Synthetic data only; no card numbers, real customers, settlement, or money movement.

Try the [verified provider-URL demo](https://creditflow-qe-pilot.vercel.app). Its isolated API and database sleep when idle; the measured first account request took 14.8 seconds. See the [actual cloud release record](docs/evidence/provider-pilot.md) for component commits, checks and limitations.

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

The verified implementation is pinned to [commit b688e17](https://github.com/farhan-shafee/creditflow-qe/tree/b688e172c86c6e9cb711da79a39244636d62615c) and its successful [complete GitHub Actions run #2](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38665882283). These links identify that tested revision. See [execution status](docs/evidence/STATUS.md), [PR #1](https://github.com/farhan-shafee/creditflow-qe/pull/1) and [all Actions runs](https://github.com/farhan-shafee/creditflow-qe/actions) for later changes and limitations. The isolated provider-URL pilot is deployed and verified. The frontend timeout fix is pinned to [b3209d3](https://github.com/farhan-shafee/creditflow-qe/commit/b3209d36d979b9b2c3bfe1850882db3481839e65), with both jobs passing in [Actions 38680627735](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38680627735). See [PR #2](https://github.com/farhan-shafee/creditflow-qe/pull/2) and the cloud receipt for the separately pinned backend. DNS and existing portfolio edits remain pending separate approval. Jenkins Groovy syntax can be parsed locally; no Jenkins server execution is claimed.

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

Read the [domain and concurrency decisions](docs/architecture/core-design.md), [test architecture](docs/testing/strategy.md), [five-minute walkthrough](docs/interview-guide/five-minute-walkthrough.md), [coding practice](docs/interview-guide/technical-practice.md), [deployment readiness](docs/deployment-readiness.md) and [portfolio proposal](docs/portfolio-integration.md).

This project was built with AI assistance. It is intended to be understood, reproduced and defended personally. It does not represent employment achievements, banking settlement, regulatory compliance or a production financial platform.
