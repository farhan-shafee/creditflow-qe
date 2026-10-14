# CreditFlow QE

A simulated credit-card ledger and independent Java quality engineering framework for hands-on financial-services interviews. Synthetic data only; no card numbers, real customers, settlement, or money movement.

## Run the working system

On Chopin, from `D:\Dev\Repos\creditflow-qe`:

```powershell
.\infrastructure\verify.ps1
node infrastructure/ui-verify.cjs
```

The PowerShell entry point generates an ignored local database password, builds the Java21 application, starts isolated PostgreSQL and runs the core reactor. The UI command starts the command center at **http://localhost:3100**, real local Selenium/Playwright containers and their tests. API: http://127.0.0.1:18081 ; contract: http://127.0.0.1:18081/openapi.yaml ; health: http://127.0.0.1:18081/actuator/health . Docker and Node are prerequisites; no host Java upgrade is required. Java21/Maven3.9.11 are supplied by project containers. With a host JDK21, Maven Wrapper also supports direct development.

`node infrastructure/verify.cjs --format` applies Java formatting during development. CI uses check-only formatting. `node infrastructure/web-verify.cjs` verifies the Next.js build, TypeScript, request/session tests and npm advisory status. Stop only this stack with `docker compose --env-file .env -f infrastructure/compose.yml --profile ui down`; the database volume remains intact.

## What is implemented

- Spring Boot4.1.1 / Java21 / PostgreSQL17 / Flyway: exact USD arithmetic, account ownership, expiring synthetic sessions, purchases, payments, cursor history and structured errors.
- Atomic balance and ledger updates, per-account row locks, account-scoped idempotency, replay of original receipts and rollback on a genuine database failure.
- Independent Cucumber8 / REST Assured6 / JUnit Platform framework, scenario-scoped PicoContainer context, reusable clients, schemas, concurrency and negative cases. Separate TestNG data-provider module.
- Next.js16 / TypeScript command center with server-only API access, signed HttpOnly cookies, exact-origin writes, byte-limited JSON and safe retry/reconciliation flows.
- Java Selenium and Java Playwright journeys; screenshots and redacted traces; Bruno collection; Jenkinsfile; GitHub Actions; Spotless, SpotBugs, JaCoCo, CycloneDX, OSV and Gitleaks.

See [execution status](docs/evidence/STATUS.md) and [GitHub Actions](https://github.com/farhan-shafee/creditflow-qe/actions) for actual results and limitations. Public deployment is pending owner approval. Jenkins Groovy syntax can be parsed locally; no Jenkins server execution is claimed.

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

Reports are generated in each module's `target` directory; Cucumber HTML/JSON are in `automation/api-bdd/target/cucumber`. CI uploads reports tied to the exact commit. Generated reports, session credentials and databases are excluded from Git.

Read the [domain and concurrency decisions](docs/architecture/core-design.md), [test architecture](docs/testing/strategy.md), [five-minute walkthrough](docs/interview-guide/five-minute-walkthrough.md), [coding practice](docs/interview-guide/technical-practice.md), [deployment readiness](docs/deployment-readiness.md) and [portfolio proposal](docs/portfolio-integration.md).

This project was built with AI assistance. It is intended to be understood, reproduced and defended personally. It does not represent employment achievements, banking settlement, regulatory compliance or a production financial platform.
