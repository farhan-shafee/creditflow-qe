# Technical practice

## Java and Spring

- Reimplement Money.parse using BigDecimal and UNNECESSARY scale. Explain equals vs compareTo for 10.0 and 10.00.
- Add a payment rule test before changing AccountState. Explain records, immutability, exception mapping and dependency injection.
- Explain why @Transactional on a public service method called through the Spring proxy gives rollback; self-invocation can bypass interception.
- Show where parameterized SQL prevents SQL injection. Never concatenate user-provided identifiers into SQL. The integration trigger concatenates only a generated UUID in an isolated test database.

## Cucumber and REST Assured

Exercise: write `Then the available credit is {string}` without application imports. GET the current account, assert 200 and JSON, compare a two-decimal string, then reconcile limit minus outstanding using BigDecimal.

Exercise: deliberately change API output field availableCredit to available. Run the schema scenario, inspect its failure, repair the contract or consumer intentionally. Do not weaken assertions to make it green.

Explain hooks vs steps, scenario scope vs static state, data factories, response specs, negative tests and JSON Schema. Gherkin should describe behavior; avoid exposing arbitrary Java method names in business scenarios.

## SQL, concurrency and failures

- Draw two transactions racing on one account. Identify the lock acquisition, balance read and commit order.
- Explain why a prior SELECT without a row lock is insufficient.
- Explain why the original receipt must be replayed even after later mutations.
- Reconcile initial balance + purchases - payments against persisted outstanding. Explain sequence gaps and stable history ordering.
- Inspect LedgerIT rollback test. Explain what a real database trigger failure proves that a mocked repository exception does not.
- Explain the difference between an idempotency conflict and a unique-constraint failure, and the boundary of account-scoped keys.

## UI tools

Discuss Selenium WebDriver lifecycle and explicit waits, Playwright locator auto-waiting and tracing, selectors by stable test ID, per-test browser context, and screenshots on failure. Distinguish authored, compiled and actually executed suites. A retry does not resolve an intermittent race; capture evidence and find the cause.

Observed debugging example: the Docker browser's HTTP hostname did not expose `crypto.randomUUID`. A real Playwright trace identified the exception before the transaction request. The UI now creates cryptographic intent keys with `getRandomValues`, and transport-loss tests prove retries post once. Selenium also needed a hit-target wait after scrolling: visibility and enabled state alone did not mean the button was unobstructed during smooth scrolling.

Cypress offers a JavaScript/TypeScript browser test runner and command queue; FitNesse uses wiki tables backed by executable fixtures. Explain where either would fit, while stating that this repository executes Java Selenium/Playwright and Cucumber rather than claiming Cypress/FitNesse coverage.

## Maven, JUnit, TestNG and CI

Trace reactor module dependencies, Surefire vs Failsafe and Maven lifecycle. Explain why TestNG has its own module/provider. This implementation uses Boot's current Jupiter generation, not a fabricated JUnit 5 version claim. Jenkins requires a real agent/server run before its pipeline can be called verified. [This repository records one actual local controller run](../evidence/jenkins-execution.md): 123 published cases and 32 separate framework tests, with browser/web/Bruno covered separately in Actions. Explain the exact source and archived hashes, rather than claiming an always-on service.

## Debugging drill

Break idempotency lookup by including current balance in its identity. Run the replay-after-later-activity case, explain the failure, fix the source and rerun the complete suite. Then introduce a missing lock and reproduce concurrency failure without sleeps or assertion weakening.

## Behavioral mapping

This repository demonstrates design reasoning, independent debugging, automation architecture, failure analysis and communication artifacts. It cannot establish five years of experience, team leadership, business impact or achievements at Capital One/Liquidnet. Prepare truthful examples with situation, personal action, trade-off and observed result. Do not turn generated test counts into claims of professional impact.
