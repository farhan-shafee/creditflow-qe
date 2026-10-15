# Three interview exercises

Work on a practice branch against the local Compose stack. Write and explain your answer before opening the [separate reference solutions](reference-solutions.md). The snippets in that document are practice material; they are not additional implemented application features or evidence that you wrote this project independently.

Run one verification process at a time. Complete the [local setup](../../README.md#run-the-working-system) first; keep automation pointed at the isolated local API. Record the command, source revision, result and what you personally learned. Existing reports describe their recorded source, not an untested practice change.

## 1. Java: exact USD parsing

Reimplement the public contract of [Money](../../services/banking-api/src/main/java/com/creditflow/banking/domain/Money.java): `parse(String)` returns a `BigDecimal`, and `format(BigDecimal)` returns a two-decimal plain string. Preserve `DomainException` with code `INVALID_AMOUNT` and status 400 for invalid input.

Accept one to nine integer digits with an optional one or two fractional digits, strictly positive values up to `1000000.00`, and normalize accepted values to scale 2. Reject whitespace, signs, exponent notation, more than two fractional digits, missing integer digits and out-of-range values. Do not use `double` or silently round.

Before implementing, write a small test matrix containing a one-cent purchase, exact maximum, equivalent scales (`10`, `10.0`, `10.00`), zero, null, a third fractional digit and one cent above the maximum. Explain why numeric comparison and wire-format comparison need different assertions. Use [MoneyTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/MoneyTest.java) to check the real contract, then confirm [AccountStateTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/AccountStateTest.java) still enforces purchase/payment boundaries.

Completion: accepted inputs retain exact value and scale 2; invalid inputs preserve the error contract; you can explain `compareTo`, `equals` and `RoundingMode.UNNECESSARY` without copying an answer.

## 2. Cucumber: independent account contract and reconciliation

Add a practice step class in package `com.creditflow.qe` under `automation/api-bdd/src/test/java`, using constructor-injected [ScenarioContext](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioContext.java). Give the step a distinct phrase so it does not conflict with [BankingSteps](../../automation/api-bdd/src/test/java/com/creditflow/qe/BankingSteps.java). Use [ApiClient](../../automation/api-bdd/src/test/java/com/creditflow/qe/ApiClient.java) to retrieve the current scenario's account.

Check HTTP 200, JSON content type, the existing [account schema](../../automation/api-bdd/src/test/resources/schemas/account.json), account identity, USD currency and literal expected balances. Check the two-decimal string representation before converting to `BigDecimal`; independently verify `creditLimit - outstandingBalance = availableCredit`. Import no application classes and create no static account/token state.

Write one practice scenario using the existing purchase/payment steps: start with the hook's fresh account, purchase `100.00`, pay `50.00`, verify your account step, then invoke the existing complete-history reconciliation step. Derive the expected values yourself. First run with a deliberately wrong expected available credit, observe the assertion failure, then restore the correct expectation and rerun. Keep this controlled failure on the practice branch.

Completion: your scenario and the existing [feature suite](../../automation/api-bdd/src/test/resources/features/credit-card.feature) pass against the real local API. Explain why the balance equation alone cannot detect a consistently wrong balance, and how literal expectations plus [receipt/history reconciliation](../../automation/api-bdd/src/test/java/com/creditflow/qe/BankingSteps.java) strengthen the check.

## 3. Debugging: replay, transaction boundaries and concurrent posting

A payment of `10` is posted with key `original`, a later purchase of `20` succeeds, and the client retries the first payment as `10.00` with the same key. Diagnose a regression that returns a newly calculated receipt or applies the payment again. Trace the controller, [LedgerService.post](../../services/banking-api/src/main/java/com/creditflow/banking/ledger/LedgerService.java), immutable receipt and [database constraints](../../services/banking-api/src/main/resources/db/migration/V1__synthetic_ledger.sql).

Write a small regression assertion sequence covering the original receipt, replay status/header, current account balance, posting count, and conflicting reuse with another amount or operation. Make a minimal correction on the practice branch. Explain where authentication, the account row lock, idempotency lookup, domain validation, balance update and receipt insert belong, and what rolls back if insertion fails.

Use the existing [LedgerIT](../../services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java) replay, concurrent-purchase, same-key and genuine insert-failure cases. Draw a two-request schedule for different purchase keys and another for duplicate keys. Explain the expected statuses and final balances before running them. A coordinated start increases contention but does not guarantee a particular interleaving; repeated green races do not prove that removing a lock is safe. Inspect `waitingMutationRechecksExpiryAfterLock` for a controlled held-lock fixture rather than adding arbitrary sleeps or weakening assertions.

Completion: the replay regression and existing transaction/concurrency tests pass with PostgreSQL, and you can explain why a unique key alone does not make the balance update atomic. The separate solutions contain the expected observations and a reference test shape.
