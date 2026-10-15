# Five-minute demonstration

## Preflight before starting the timer

Use the local demo at `http://localhost:3100`. Complete the [README verification sequence](../../README.md#run-the-working-system) beforehand, one process at a time; it builds and starts the local stack and produces real reports. Open the source and selected reports before presenting. A full verification run belongs in preparation, not inside the five-minute talk.

Record `git rev-parse HEAD` and `git status --short`. Open the corresponding sanitized manifest and frozen reports from `.work/evidence/runs/`, checking command outcome, executed source and timestamps as described in the [test strategy](../testing/strategy.md). If local execution is unavailable, present the pinned [Actions evidence](../evidence/STATUS.md#historical-engineering-finish) and archived reports explicitly as historical execution. Hosted artifacts have retention limits; a checked-in receipt preserves provenance but does not replace an executable report. Do not label an old result as a test of the current checkout.

The [recorded hosted banking release](../evidence/completion.md) pins frontend `81fceff035c5ad23e761f6a1c49196e488f24d58` and API `20c91f5e10658ab4ce3ec7f2727c8a4934f5b314`. This maintenance work started from later main `51a2affe38a733f350390fafd59b885b74823b42`. Before claiming local source matches a deployed component, inspect the relevant path differences, for example:

```powershell
git diff 81fceff035c5ad23e761f6a1c49196e488f24d58 -- apps/web
git diff 20c91f5e10658ab4ce3ec7f2727c8a4934f5b314 -- services/banking-api
```

A later main revision and documentation updates do not establish a new deployment. This talk needs no hosted automation or load run.

## 0:00 — the problem and one local journey

CreditFlow QE is a synthetic credit-card ledger, built with AI assistance as a portfolio project. A visitor receives an isolated expiring account. It models credit usage and repayment; settlement, interest and real money movement are outside its scope.

Create one local sandbox. Show outstanding `250.00` and available `750.00`; purchase `100.00`, then pay `50.00`. Show outstanding `300.00`, available `700.00` and two receipts. If the local app is unavailable, explain the same journey using its source-bound test report and identify that fallback plainly.

## 0:50 — application coding

Open [Money](../../services/banking-api/src/main/java/com/creditflow/banking/domain/Money.java) and [AccountState](../../services/banking-api/src/main/java/com/creditflow/banking/domain/AccountState.java). Explain decimal-string input, `BigDecimal`, immutable state, exact scale without rounding, `available = limit - outstanding`, and purchase/overpayment rejection. Point to [MoneyTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/MoneyTest.java) and [AccountStateTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/AccountStateTest.java). Be ready to reproduce one rule without looking at the file.

## 1:30 — persistent correctness

Open [LedgerService.post](../../services/banking-api/src/main/java/com/creditflow/banking/ledger/LedgerService.java). Explain the transaction boundary, `SELECT FOR UPDATE`, operation plus normalized amount, the [unique account/key constraint](../../services/banking-api/src/main/resources/db/migration/V1__synthetic_ledger.sql), and replay of the original receipt before current-balance calculations. Two racing purchases serialize on the account row. An insert failure rolls back the balance update.

Use `LedgerIT.replayAfterOtherActivityReturnsOriginalReceipt` and `failureDuringInsertRollsBackBalanceAndReturnsSafeError` in [LedgerIT](../../services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java) as the concrete examples. Distinguish the receipt's historical balance from the account's current balance.

## 2:20 — independent Cucumber architecture

Trace one scenario from [credit-card.feature](../../automation/api-bdd/src/test/resources/features/credit-card.feature) through [ScenarioHooks](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioHooks.java), [ScenarioContext](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioContext.java), [BankingSteps](../../automation/api-bdd/src/test/java/com/creditflow/qe/BankingSteps.java) and [ApiClient](../../automation/api-bdd/src/test/java/com/creditflow/qe/ApiClient.java). Show a precise HTTP/balance assertion and the independent history reconciliation. Each scenario gets fresh data; PicoContainer shares context within that scenario. The [BDD module](../../automation/api-bdd/pom.xml) has no application source dependency.

## 3:15 — evidence and debugging

Show the already completed run's Cucumber HTML/JSON/JUnit reports and provenance. [RunCucumberTest](../../automation/api-bdd/src/test/java/com/creditflow/qe/RunCucumberTest.java) configures those outputs. Select the concurrent-purchase and duplicate-key cases, then the PostgreSQL trigger rollback case. Explain which assertions observe only HTTP and which also inspect the database.

Use one actual [debugging example](technical-practice.md#ui-tools), including the retained failure and correction. Explain the symptom, cause, test and observed result without claiming that a retry or one passing race proves correctness.

## 4:10 — trade-offs and honest ownership

Explain PostgreSQL over an in-memory substitute, one transactional service over microservices, TestNG in a separate module, the actual Jupiter generation, and selected UI journeys backed by deeper API cases. Show the recorded component revision and test date when discussing deployment status.

Say what AI helped produce, which decisions and debugging you can defend, and what you can reproduce personally. Supply truthful workplace examples separately; this repository does not establish employment tenure, leadership or business impact.

## Practice after the talk

Rehearse with a timer. Attempt the [three coding/debugging exercises](coding-exercises.md), then compare with the [separate reference solutions](reference-solutions.md). Keep your own failed and corrected runs so you can explain the reasoning, not just recite the finished code.
