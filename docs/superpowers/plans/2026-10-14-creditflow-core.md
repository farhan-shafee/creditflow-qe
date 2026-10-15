# CreditFlow Core Implementation Plan

> For agentic workers: execute with superpowers:executing-plans, task by task, preserving the owner's explicit authorization to continue without design approval prompts.

**Goal:** Run a real Java 21 credit-card API against PostgreSQL and verify its behavior independently through Cucumber and REST Assured.

**Architecture:** One transactional Spring Boot service, separate Maven automation modules, Flyway schema, isolated Compose stack. Owner's master prompt is the governing specification; `docs/architecture/core-design.md` records resolved decisions.

**Tech Stack:** Java 21, Maven 3.9.11 Wrapper, Spring Boot 4.1.1, PostgreSQL, Cucumber 8.0.4, REST Assured 6.1.0, Jupiter, TestNG.

## Global constraints

- USD exact BigDecimal arithmetic, 2 decimal output; positive amounts <= 1,000,000.00.
- Fresh account: limit 1000.00, outstanding 250.00, available 750.00.
- Account-scoped bearer credentials and idempotency; no committed real secrets.
- No billable provisioning, public release, DNS, host software install or existing project edits without approval.
- Separate build scopes for JUnit Platform and TestNG.

## Review focus

1. Identical replay after later mutations must return the original receipt.
2. Cross-account access must fail even with an otherwise valid token.
3. Decimal precision, exponent notation, null and unknown fields must not bypass validation.
4. Concurrent requests must preserve credit limits and produce only one receipt per key.
5. Persistence failure must roll back balance and ledger atomically.

## Task 1: Verified bootstrap

Files: root pom, wrapper, ignore rules, design, plan and evidence.

- [ ] Generate Maven Wrapper, pin Java 21, resolve the parent and validate the empty reactor using Docker.
- [ ] Inspect Git diff and secret patterns, commit and push the bootstrap.

## Task 2: Domain rules

Files: `services/banking-api/.../domain/AccountState.java`, `Money.java`, `DomainException.java`; JUnit domain tests.

Interface: AccountState(BigDecimal creditLimit, BigDecimal outstanding); available(); post(String kind, BigDecimal amount) returns new AccountState. Money.parse(String) returns exact BigDecimal or DomainException.

- [ ] Write tests asserting purchase 100 => outstanding350/available650; payment50 =>200/800; overlimit751 and overpayment251 fail; invalid amount zero/negative/exponent/3decimals fail.
- [ ] Run tests against missing behavior, implement and run green; include boundaries and state invariants.

## Task 3: Persistent HTTP API

Files: application entrypoint, Jdbc ledger service, controllers, auth, structured errors, Flyway V1 and OpenAPI contract, integration test.

Interfaces: POST /api/v1/sandboxes; GET /api/v1/accounts/{id}; GET transactions; POST purchases/payments using Authorization and Idempotency-Key. Responses use string amounts; status contract is in core-design.

- [ ] Write HTTP integration tests for retrieval, reconciliation, replay after later activity, conflicts, ownership and malformed requests; observe red on absent endpoints.
- [ ] Implement transaction lock, immutable history and token ownership checks.
- [ ] Exercise real PostgreSQL rollback with a targeted trigger, referential/check constraints, concurrent purchase and duplicate key races; verify through HTTP and direct DB reconciliation.

## Task 4: Independent Cucumber

Files: standalone `automation/api-bdd` pom, configuration/client/context/hooks/steps, features and schemas.

Consumes: only HTTP contracts; no application classes. Produces HTML, JSON and JUnit reports.

- [ ] Write scenarios for required success, invalid input, auth, boundaries, conflict, concurrency and financial reconciliation; execute against missing/incorrect behavior before final implementation where possible.
- [ ] Use fresh sandbox hooks, PicoContainer and REST Assured request/response specs. Verify all scenarios execute and pass.

## Task 5: Enterprise tooling and CI

Files: TestNG module, Bruno collection, Jenkinsfile, GitHub Actions, Compose, quality scripts and interview guide.

- [ ] Add TestNG DataProvider negative cases and parameterized base URL; run separately from Jupiter.
- [ ] Execute Bruno collection if CLI feasible. Build Jenkins stages but mark server execution unverified without a server.
- [ ] CI starts real PostgreSQL/API, runs reactor verification and formatting, uploads honest reports and coverage. Pin reviewed actions and read-only permissions.
- [ ] Review branch, fix defects, commit/push and inspect the actual GitHub run.

## Task 6: Dashboard and browser suites

- [ ] Build responsive Next.js dashboard and session-isolated simulator, accurate evidence links, API explorer, decisions and walkthrough.
- [ ] Add Java Selenium and Playwright modules with deterministic selectors and failure artifacts. Record browser execution boundaries explicitly.
- [ ] Build frontend and compile automation; execute authorized local suites. Prepare isolated deployment configurations and cost/readiness request.

## Execution record

Read current `docs/evidence/STATUS.md` and Git history before resuming. Commit evidence at each validated milestone. Do not repeat completed work after context compaction.
