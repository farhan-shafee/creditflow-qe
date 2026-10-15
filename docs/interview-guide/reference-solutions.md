# Reference solutions

Read these after attempting the [three exercises](coding-exercises.md). These are worked practice answers based on the repository's actual implementation. They do not represent additional executed tests or independent authorship. Run practice changes locally and retain the failed and corrected results with their source revision.

## 1. Java: exact USD parsing

This complete class preserves the current `Money` API: `parse` returns `BigDecimal`, not a wrapper object. It belongs in package `com.creditflow.banking.domain` and uses the existing [DomainException](../../services/banking-api/src/main/java/com/creditflow/banking/domain/DomainException.java).

```java
package com.creditflow.banking.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
  private static final BigDecimal MAX = new BigDecimal("1000000.00");

  private Money() {}

  public static BigDecimal parse(String raw) {
    if (raw == null || !raw.matches("[0-9]{1,9}(\\.[0-9]{1,2})?")) throw invalid();
    BigDecimal value = new BigDecimal(raw).setScale(2, RoundingMode.UNNECESSARY);
    if (value.signum() <= 0 || value.compareTo(MAX) > 0) throw invalid();
    return value;
  }

  public static String format(BigDecimal value) {
    return value.setScale(2, RoundingMode.UNNECESSARY).toPlainString();
  }

  private static DomainException invalid() {
    return new DomainException(
        "INVALID_AMOUNT",
        400,
        "Amount must be a positive USD decimal string with at most 2 fractional digits, no greater than 1000000.00");
  }
}
```

The lexical check rejects exponent notation and whitespace before parsing. `UNNECESSARY` forbids rounding. `compareTo` compares numeric value, so `10.0` and `10.00` compare equally; `BigDecimal.equals` also checks scale. Assert both the numeric value and scale 2 for parsing, and use string equality for output such as `10.00`. `format` is an exact formatter for domain amounts; `parse` owns positive-input validation.

| Inputs | Expected result |
|---|---|
| `0.01`, `1000000.00` | Exact accepted boundaries, scale 2 |
| `10`, `10.0`, `10.00` | Equal numeric value; each formats as `10.00` |
| null, `0`, `1.001`, `1000000.01` | `INVALID_AMOUNT`, status 400 |
| `1e2`, ` 1`, `+1`, `.50` | `INVALID_AMOUNT`, status 400 |

Compare with [Money.java](../../services/banking-api/src/main/java/com/creditflow/banking/domain/Money.java), [MoneyTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/MoneyTest.java) and [AccountStateTest](../../services/banking-api/src/test/java/com/creditflow/banking/domain/AccountStateTest.java). After local setup, a focused run is:

```powershell
node infrastructure/maven.cjs -pl services/banking-api "-Dtest=MoneyTest,AccountStateTest" test
```

## 2. Cucumber: independent account contract and reconciliation

This complete practice class can be saved as `automation/api-bdd/src/test/java/com/creditflow/qe/ContractPracticeSteps.java` on a practice branch. It uses the existing package-scoped context and a distinct step phrase. No application imports are required.

```java
package com.creditflow.qe;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.junit.jupiter.api.Assertions.*;

import io.cucumber.java.en.Then;
import io.restassured.response.Response;
import java.math.BigDecimal;

public final class ContractPracticeSteps {
  private final ScenarioContext c;

  public ContractPracticeSteps(ScenarioContext context) {
    c = context;
  }

  @Then("the practice account has outstanding {string} and available {string}")
  public void accountContract(String expectedOutstanding, String expectedAvailable) {
    Response account =
        c.client
            .get(c.accountPath(), c.token)
            .then()
            .spec(ApiClient.JSON)
            .statusCode(200)
            .body(matchesJsonSchemaInClasspath("schemas/account.json"))
            .extract()
            .response();
    assertEquals(c.accountId, account.path("id"));
    assertEquals("USD", account.path("currency"));
    assertEquals("1000.00", account.path("creditLimit"));
    assertEquals(expectedOutstanding, account.path("outstandingBalance"));
    assertEquals(expectedAvailable, account.path("availableCredit"));

    BigDecimal limit = decimal(account.path("creditLimit"));
    BigDecimal outstanding = decimal(account.path("outstandingBalance"));
    BigDecimal available = decimal(account.path("availableCredit"));
    assertEquals(0, limit.subtract(outstanding).compareTo(available));
  }

  private static BigDecimal decimal(Object value) {
    assertInstanceOf(String.class, value);
    String text = (String) value;
    assertTrue(text.matches("[0-9]+\\.[0-9]{2}"));
    return new BigDecimal(text);
  }
}
```

Add this scenario to a practice feature under `automation/api-bdd/src/test/resources/features`. The existing hook creates a fresh account; the existing posting steps remember newly created receipt IDs, and the existing reconciliation step independently walks all cursor pages and checks their receipt snapshots.

```gherkin
Feature: Practice the independent account contract
  Scenario: Practice account contract and reconciliation
    When I submit a purchases of "100.00" with key "practice-purchase"
    Then the response status is 201
    When I submit a payments of "50.00" with key "practice-payment"
    Then the response status is 201
    And the practice account has outstanding "300.00" and available "700.00"
    And the complete transaction history reconciles with my account
```

The arithmetic is `250.00 + 100.00 - 50.00 = 300.00`, leaving `700.00` from the literal `1000.00` limit. Changing the expected available credit to `699.99` must fail. Merely checking `limit = outstanding + available` would accept two consistently wrong balances; literal expectations and the independent history calculation test more than that invariant.

[ScenarioHooks](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioHooks.java) provisions data per scenario; PicoContainer shares [ScenarioContext](../../automation/api-bdd/src/test/java/com/creditflow/qe/ScenarioContext.java) between hooks and steps for that scenario. [ApiClient](../../automation/api-bdd/src/test/java/com/creditflow/qe/ApiClient.java) owns transport and redacted headers. [BankingSteps.reconcileHistory](../../automation/api-bdd/src/test/java/com/creditflow/qe/BankingSteps.java) uses literal initial balance plus signed postings and compares each persisted receipt snapshot. The [BDD POM](../../automation/api-bdd/pom.xml) has no application dependency.

With the private local API already running, run the independent suite:

```powershell
node infrastructure/maven.cjs -pl automation/api-bdd verify
```

[RunCucumberTest](../../automation/api-bdd/src/test/java/com/creditflow/qe/RunCucumberTest.java) emits HTML, JSON and JUnit reports in `automation/api-bdd/target/cucumber`. The evidence runner freezes reports separately; see the [test strategy](../testing/strategy.md). A practice run does not refresh every verification scope.

## 3. Debugging: replay, transaction boundaries and concurrent posting

The working production reference is [LedgerService.post](../../services/banking-api/src/main/java/com/creditflow/banking/ledger/LedgerService.java), called through the injected Spring service by [BankingController](../../services/banking-api/src/main/java/com/creditflow/banking/web/BankingController.java). Preserve this order:

1. Validate the key; authenticate ownership; acquire the account row with `SELECT ... FOR UPDATE`; recheck expiry after a possible lock wait.
2. Look up the key within that account while holding the lock. Compare operation and numeric amount, so `10` and `10.00` identify the same intent.
3. Return the stored original receipt for a matching replay. Reject a different operation or amount with 409. Both decisions precede current-balance domain calculations.
4. For a new intent, apply the domain rule, update the balance and insert the immutable receipt in the same `@Transactional` method. An unexpected insert exception rolls back the preceding update.

For the exercise, the first payment returns 201 with balance `240.00`. The later purchase leaves the current balance at `260.00`. Replaying the payment returns 200, `Idempotency-Replayed: true` and the original receipt whose balance remains `240.00`; the current account stays at `260.00` with two postings. Receipt state describes the original posting, not a fresh view of the account.

This complete test method fits inside the existing [LedgerIT](../../services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java), reusing its fresh fixture, `post`, `outstanding`, `db`, imports and lifecycle. It is a practice addition, not a claim that this named method already exists:

```java
@Test
void practiceReplayKeepsOriginalReceiptAfterLaterActivity() {
  Response first =
      post("payments", "10", "original").then().statusCode(201).extract().response();
  assertEquals("240.00", first.path("balanceAfter"));
  post("purchases", "20", "later").then().statusCode(201);

  Response replay =
      post("payments", "10.00", "original").then().statusCode(200).extract().response();
  assertEquals(first.jsonPath().getMap("$"), replay.jsonPath().getMap("$"));
  assertEquals("true", replay.header("Idempotency-Replayed"));
  assertEquals("260.00", outstanding());
  post("payments", "11", "original").then().statusCode(409);
  post("purchases", "10", "original").then().statusCode(409);
  assertEquals("260.00", outstanding());
  assertEquals(
      2,
      db.queryForObject(
          "select count(*) from ledger_entries where account_id=?",
          Integer.class,
          UUID.fromString(account)));
}
```

`LedgerIT.replayAfterOtherActivityReturnsOriginalReceipt` already tests replay after later activity and conflicting reuse. The [Gherkin replay scenario](../../automation/api-bdd/src/test/resources/features/credit-card.feature) additionally reconciles the complete history through independent HTTP calls.

For different keys on one account, the lock serializes balance reads and updates: twelve purchases of `100` against `750.00` available produce seven 201s, five 422s, outstanding `950.00` and seven entries. For eight identical payment intents, one request creates a receipt (201), seven replay it (200), outstanding becomes `249.00`, and one entry persists. The unique `(account_id, idempotency_key)` constraint is a second defense against duplicate receipts; it cannot prevent different keys from reading the same old balance without the account lock. A unique-constraint error by itself is also not the successful replay contract.

Existing `LedgerIT.concurrentPurchasesCannotOverspend` and `concurrentSameKeyPostsOnce` cover those outcomes. The Cucumber concurrent-duplicate scenario also compares full receipt identity and exact history count. Start latches coordinate contention; thread scheduling still varies. `LedgerIT.waitingMutationRechecksExpiryAfterLock` holds a real row lock and observes a PostgreSQL lock wait, showing how to build a controlled fixture. It checks expiry after waiting; it does not by itself prove every overspend interleaving.

`LedgerIT.failureDuringInsertRollsBackBalanceAndReturnsSafeError` creates an account-targeted trigger only in the isolated test database. It checks a safe 500, unchanged balance and zero entries, removes its trigger in `finally`, then retries successfully. This proves real transaction rollback rather than a mocked exception; no public fault endpoint is needed.

After local setup, run the actual integration class with the application unit tests, then the complete core scope for a final practice change:

```powershell
node infrastructure/maven.cjs -pl services/banking-api "-Dit.test=LedgerIT" verify
.\infrastructure\verify.ps1
```

The first command uses the Compose Maven service and real local PostgreSQL. Run the commands sequentially. Inspect actual failures and reports; neither this answer nor an old passing report establishes that a modified practice branch passes.
