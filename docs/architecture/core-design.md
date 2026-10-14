# CreditFlow QE design

## Intent and scope

Implement the owner's supplied master specification autonomously, in phases. The first usable milestone is a Java 21 banking API with independent Cucumber/REST Assured automation, PostgreSQL integration evidence, and GitHub Actions. The dashboard and additional tools follow that milestone. This project demonstrates implementation and debugging skill; it does not create professional experience or imply independent authorship of assisted code.

## Core architecture

A Maven reactor separates `services/banking-api` from `automation/api-bdd` and `automation/api-testng`. The automation modules have no compile dependency on application code and test real HTTP endpoints. PostgreSQL is the sole persistent store; Flyway owns migrations. A project-specific Docker Compose stack supplies Java 21 and PostgreSQL without touching installed software or CreditOps containers. JUnit Jupiter tests isolate domain rules; integration tests use the same PostgreSQL engine as the application. No H2 substitution.

Spring Boot 4.1.1 is selected from the current supported major rather than starting a new application on the retired 3.5 line. Cucumber 8 and the Boot-managed JUnit Platform are used; this is the current Jupiter generation rather than claiming a JUnit 5-specific implementation.

## Monetary contract

USD only. Inputs are positive decimal strings with one to nine integer digits and at most two fractional digits, capped at 1,000,000.00. Parsing uses BigDecimal with exact scale; no rounding. API output amounts are two-decimal strings. Each synthetic account starts with limit 1,000.00, outstanding balance 250.00, and available credit 750.00. A posted purchase increases outstanding; a posted payment decreases it. Purchases above available credit and payments above outstanding fail with 422. There are no pending authorizations, interest, fees, refunds, chargebacks, settlement or real payment integrations.

## Atomicity and idempotency

Mutations lock the account row with SELECT FOR UPDATE. In one database transaction, validate ownership/expiry, inspect the account-scoped idempotency key, apply the domain calculation, update account state, and insert an immutable ledger entry. A unique (account_id, idempotency_key) constraint provides a second defense. The request identity is operation plus exact normalized amount. Identical replay returns the original entry with 200 and Idempotency-Replayed:true; initial creation returns 201. A conflicting reuse returns 409. Replays do not reapply funds, including when a later transaction has changed the current balance.

Invalid requests leave no entry or balance change. Database insertion failures roll back the balance update. Tests use an account-targeted PostgreSQL trigger only in the isolated integration database to exercise a real failure; the production API has no fault-injection endpoint or flag. All mutations on one account serialize; unrelated accounts can progress independently. Transaction history orders by immutable database sequence descending with a cursor; sequence gaps are allowed.

## Security and test isolation

POST /api/v1/sandboxes provisions one synthetic account and a cryptographically random bearer token, stores only its SHA-256 hash, and sets a 30-minute expiry. Subsequent requests must own the exact account. Invalid tokens return 401; a valid session requesting another/nonexistent account gets 404. Public session creation needs bounded quotas, bounded retention, request limits and deployment topology review. API binds locally by default. No production credentials are reused. Infrastructure, public release, DNS, system installs and portfolio changes remain explicit approval boundaries.

Fresh sandbox per scenario; no reset of shared state. Cucumber hooks use scenario-scoped state via PicoContainer, reusable HTTP clients and redacted reporting. CI must fail if no scenarios execute. Boundary, malformed input, auth, reconciliation, replay, conflict, concurrency and rollback are required behaviors, not optional documentation examples.

## Deployment and UI boundary

Next.js dashboard may proxy to the backend with per-visitor sandbox credentials in secure, HttpOnly session cookies; never ship a service credential to the client. Local browser automation requires the owner's Browser Use approval before an interactive/cloud browser session. Java browser suites may be authored and compiled first, with execution approval status recorded explicitly. No cloud resources or public deployments before a concrete cost and readiness review.

## Alternatives considered

An in-memory application would be quick but fail the persistent transaction requirement. Microservices would increase operational work without improving interview evidence. A single transactional service with independent test modules gives the strongest early demonstration.
