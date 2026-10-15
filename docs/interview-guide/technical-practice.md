# Technical practice

Use this page as discussion prompts alongside the [five-minute demonstration](five-minute-walkthrough.md). The [three practical exercises](coding-exercises.md) have [separate reference solutions](reference-solutions.md); attempt them before reading the answers. Practice against the local stack and distinguish your own observed results from the repository's historical evidence.

## Java and Spring

- Reimplement Money.parse using BigDecimal and UNNECESSARY scale. Explain equals vs compareTo for 10.0 and 10.00.
- Add a payment rule test before changing AccountState. Explain records, immutability, exception mapping and dependency injection.
- Explain why @Transactional on a public service method called through the Spring proxy gives rollback; self-invocation can bypass interception.
- Show where parameterized SQL prevents SQL injection. Never concatenate user-provided identifiers into SQL. The integration trigger concatenates only a generated UUID in an isolated test database.

## Cucumber and REST Assured

Explain the account-contract exercise: GET the current account, assert 200 and JSON, validate the schema and literal expected balances, then reconcile limit minus outstanding using BigDecimal. Trace [ScenarioHooks](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioHooks.java), [ScenarioContext](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioContext.java), [ApiClient](../../automation/api-bdd/src/test/java/com/creditflow/qe/ApiClient.java) and [BankingSteps](../../automation/api-bdd/src/test/java/com/creditflow/qe/BankingSteps.java). No application imports are needed.

Discuss how changing API output field `availableCredit` to `available` would fail the existing [account schema](../../automation/api-bdd/src/test/resources/schemas/account.json). Explain how to repair the provider or consumer intentionally and consider compatibility for existing clients.

Explain hooks vs steps, scenario scope vs static state, data factories, response specs, negative tests and JSON Schema. Gherkin should describe behavior; avoid exposing arbitrary Java method names in business scenarios.

## SQL, concurrency and failures

- Draw two transactions racing on one account. Identify the lock acquisition, balance read and commit order.
- Explain why a prior SELECT without a row lock is insufficient.
- Explain why the original receipt must be replayed even after later mutations.
- Reconcile initial balance + purchases - payments against persisted outstanding. Explain sequence gaps and stable history ordering.
- Inspect [LedgerIT](../../services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java) and its `failureDuringInsertRollsBackBalanceAndReturnsSafeError` test. Explain what a real database trigger failure proves that a mocked repository exception does not.
- Explain the difference between an idempotency conflict and a unique-constraint failure, and the boundary of account-scoped keys.

## UI tools

Discuss Selenium WebDriver lifecycle and explicit waits, Playwright locator auto-waiting and tracing, selectors by stable test ID, per-test browser context, and screenshots on failure. Distinguish authored, compiled and actually executed suites. A retry does not resolve an intermittent race; capture evidence and find the cause.

Observed debugging example: the Docker browser's HTTP hostname did not expose `crypto.randomUUID`. A real Playwright trace identified the exception before the transaction request. The UI now creates cryptographic intent keys with `getRandomValues`, and transport-loss tests prove retries post once. Selenium also needed a hit-target wait after scrolling: visibility and enabled state alone did not mean the button was unobstructed during smooth scrolling.

Cypress offers a JavaScript/TypeScript browser test runner and command queue; FitNesse uses wiki tables backed by executable fixtures. Explain where either would fit, while stating that this repository executes Java Selenium/Playwright and Cucumber rather than claiming Cypress/FitNesse coverage.

## Maven, JUnit, TestNG and CI

Trace reactor module dependencies, Surefire vs Failsafe and Maven lifecycle. Explain why TestNG has its own module/provider. This implementation uses Boot's current Jupiter generation, not a fabricated JUnit 5 version claim. Jenkins requires a real agent/server run before its pipeline can be called verified. [This repository records one actual local controller run](../evidence/jenkins-execution.md): 123 published cases and 32 separate framework tests, with browser/web/Bruno covered separately in Actions. Explain the exact source and archived hashes, rather than claiming an always-on service.

## Debugging drill

Use exercise 3 to diagnose replay after later activity and compare the correction with [LedgerService.post](../../services/banking-api/src/main/java/com/creditflow/banking/ledger/LedgerService.java). Identity is account-scoped key plus operation/normalized amount; current balance is not part of request identity. The matching replay returns the stored receipt before domain validation against current state.

Draw the failure schedule for a missing account lock, then inspect the existing coordinated concurrency cases. A latch aligns request starts but cannot guarantee an unsafe interleaving, so a green run after removing the lock is inconclusive. `LedgerIT.waitingMutationRechecksExpiryAfterLock` demonstrates a controlled row lock and observed database wait for the expiry boundary. Explain its specific proof and limits; do not turn it into a claim that all balance races have been forced. Preserve exact posting-count/balance assertions and avoid arbitrary sleeps or retries that hide failures.

## Behavioral mapping

This repository demonstrates design reasoning, independent debugging, automation architecture, failure analysis and communication artifacts. It cannot establish five years of experience, team leadership, business impact or achievements at Capital One/Liquidnet. Prepare truthful examples with situation, personal action, trade-off and observed result. Do not turn generated test counts into claims of professional impact.
