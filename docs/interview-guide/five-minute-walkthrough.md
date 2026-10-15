# Five-minute demonstration

## 0:00 — the problem

CreditFlow QE is a synthetic credit-card ledger, built with AI assistance as a portfolio project. A visitor receives an isolated expiring account. A purchase consumes credit; a payment releases it. It is not a bank, processor, or settlement engine.

## 0:40 — application coding

Open Money and AccountState. Explain decimal-string input, BigDecimal, immutable state, the no-rounding policy, available=limit-outstanding, purchase and overpayment rejection. Reimplement one rule without looking at the file.

## 1:20 — persistent correctness

Open LedgerService.post. Explain the transaction boundary, SELECT FOR UPDATE, normalized operation+amount identity, unique account/key constraint and receipt replay. Two racing purchases cannot each spend the same available credit. A failed ledger insert rolls back the balance update.

## 2:10 — Cucumber architecture

Open credit-card.feature, ScenarioHooks, ScenarioContext and ApiClient. Trace one English step into real HTTP behavior and a precise balance assertion. Each scenario gets fresh data; PicoContainer shares context only within that scenario. The framework has no application source dependency.

## 3:00 — real execution

Run infrastructure/verify.ps1, or open the exact GitHub Actions run recorded in docs/evidence/STATUS.md. Show Cucumber HTML/JSON/JUnit artifacts, the concurrency cases and the PostgreSQL failure/rollback integration test. Identify which tests use API observations and which also inspect the database.

## 4:00 — trade-offs and honesty

Explain PostgreSQL over an in-memory substitute, one service over microservices, TestNG in a separate module, the current JUnit generation, and why UI tests should cover selected journeys rather than duplicate every API case. Show actual deployment/test status. Say what you built with assistance and what you can reproduce personally. Supply your own truthful workplace examples separately.

## Before an interview

Practice five repetitions with a timer. Rebuild Money parsing, a step definition, a REST Assured contract assertion, and the idempotency decision tree from scratch. Generated code that you cannot debug will not survive a senior engineering interview.
