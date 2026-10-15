package com.creditflow.qe;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.junit.jupiter.api.Assertions.*;

import io.cucumber.java.en.*;
import io.restassured.response.Response;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

public class BankingSteps {
  private final ScenarioContext c;

  public BankingSteps(ScenarioContext context) {
    c = context;
  }

  @When("I retrieve my account")
  public void account() {
    c.response = c.client.get(c.accountPath(), c.token);
  }

  @When("I submit a {word} of {string} with key {string}")
  public void post(String operation, String amount, String key) {
    c.response =
        c.client.post(c.accountPath() + "/" + operation, c.token, key, ApiClient.amount(amount));
    rememberNewPosting(c.response);
  }

  @When("I remember the receipt")
  public void remember() {
    c.originalReceipt = c.response.path("id");
    assertNotNull(c.originalReceipt);
  }

  @When("I retrieve an unknown account")
  public void unknown() {
    c.response = c.client.get("/api/v1/accounts/" + UUID.randomUUID(), c.token);
  }

  @When("I retrieve another sandbox account")
  public void other() {
    String otherId = c.client.sandbox().then().statusCode(201).extract().path("accountId");
    c.response = c.client.get("/api/v1/accounts/" + otherId, c.token);
  }

  @When("I retrieve without authentication")
  public void noAuth() {
    c.response = c.client.get(c.accountPath(), null);
  }

  @When("I retrieve with an invalid token")
  public void invalidAuth() {
    c.response = c.client.get(c.accountPath(), "invalid");
  }

  @When("I submit raw payment body {string}")
  public void raw(String body) {
    c.response = c.client.post(c.accountPath() + "/payments", c.token, "raw", body);
  }

  @When("I submit a payment without an idempotency key")
  public void noKey() {
    c.response = c.client.post(c.accountPath() + "/payments", c.token, null, ApiClient.amount("1"));
  }

  @When("I retrieve transactions")
  public void history() {
    c.response = c.client.get(c.accountPath() + "/transactions", c.token);
  }

  @Then("the response status is {int}")
  public void status(int status) {
    c.response.then().spec(ApiClient.JSON).statusCode(status);
  }

  @Then("the error code is {string}")
  public void error(String code) {
    assertEquals(code, c.response.path("code"));
    assertNotNull(c.response.path("requestId"));
    assertNotNull(c.response.path("timestamp"));
    assertNotNull(c.response.path("message"));
  }

  @Then("the account has outstanding {string} and available {string}")
  public void balances(String outstanding, String available) {
    Response r = c.client.get(c.accountPath(), c.token).then().statusCode(200).extract().response();
    assertEquals(c.accountId, r.path("id"));
    assertEquals("USD", r.path("currency"));
    assertEquals("1000.00", r.path("creditLimit"));
    assertEquals(outstanding, r.path("outstandingBalance"));
    assertEquals(available, r.path("availableCredit"));
    assertEquals(
        new BigDecimal(r.path("creditLimit").toString()),
        new BigDecimal(outstanding).add(new BigDecimal(available)));
  }

  @Then("the account response matches its schema")
  public void schema() {
    c.response.then().body(matchesJsonSchemaInClasspath("schemas/account.json"));
  }

  @Then("the receipt is the remembered receipt with balance {string}")
  public void original(String balance) {
    assertEquals(c.originalReceipt, c.response.path("id"));
    assertEquals(balance, c.response.path("balanceAfter"));
    assertEquals("true", c.response.header("Idempotency-Replayed"));
  }

  @Then("the receipt is a {string} of {string} with outstanding {string} and available {string}")
  public void receipt(String kind, String amount, String outstanding, String available) {
    Map<String, Object> entry = c.response.jsonPath().getMap("$");
    validateEntry(entry, c.accountId);
    assertEquals(kind, entry.get("kind"));
    assertEquals(amount, entry.get("amount"));
    assertEquals(outstanding, entry.get("balanceAfter"));
    assertEquals(available, entry.get("availableAfter"));
  }

  @Then("the complete transaction history reconciles with my account")
  public void reconcileHistory() {
    List<Map<String, Object>> entries = completeHistory(c.accountId, c.token);
    Set<String> historyIds = new HashSet<>();
    for (Map<String, Object> entry : entries) historyIds.add((String) entry.get("id"));
    assertEquals(
        c.postedReceiptIds, historyIds, "History must contain every created receipt exactly once");
    entries.sort(Comparator.comparingLong(e -> ((Number) e.get("sequence")).longValue()));
    BigDecimal purchases = new BigDecimal("0.00");
    BigDecimal payments = new BigDecimal("0.00");
    BigDecimal running = new BigDecimal("250.00");
    BigDecimal limit = new BigDecimal("1000.00");
    for (Map<String, Object> entry : entries) {
      validateEntry(entry, c.accountId);
      BigDecimal amount = decimal(entry.get("amount"));
      assertTrue(amount.signum() > 0);
      if (entry.get("kind").equals("PURCHASE")) {
        purchases = purchases.add(amount);
        running = running.add(amount);
      } else {
        payments = payments.add(amount);
        running = running.subtract(amount);
      }
      assertTrue(running.signum() >= 0 && running.compareTo(limit) <= 0);
      assertEquals(
          running,
          decimal(entry.get("balanceAfter")),
          "Each receipt must reflect its posting order");
      assertEquals(limit.subtract(running), decimal(entry.get("availableAfter")));
    }
    Response account =
        c.client
            .get(c.accountPath(), c.token)
            .then()
            .spec(ApiClient.JSON)
            .statusCode(200)
            .extract()
            .response();
    assertEquals(c.accountId, account.path("id"));
    assertEquals("USD", account.path("currency"));
    assertEquals("1000.00", account.path("creditLimit"));
    BigDecimal expected = new BigDecimal("250.00").add(purchases).subtract(payments);
    assertEquals(expected, decimal(account.path("outstandingBalance")));
    assertEquals(limit.subtract(expected), decimal(account.path("availableCredit")));
  }

  @Given("I have another sandbox account")
  public void secondSandbox() {
    Response other =
        c.client.sandbox().then().spec(ApiClient.JSON).statusCode(201).extract().response();
    c.otherAccountId = other.path("accountId");
    c.otherToken = other.path("token");
    assertNotEquals(c.accountId, c.otherAccountId);
  }

  @When("I attempt a forbidden {string} with the other sandbox token")
  public void foreignAccess(String operation) {
    c.response =
        switch (operation) {
          case "transactions" -> c.client.get(c.accountPath() + "/transactions", c.otherToken);
          case "payments", "purchases" ->
              c.client.post(
                  c.accountPath() + "/" + operation,
                  c.otherToken,
                  "foreign-" + operation,
                  ApiClient.amount("1.00"));
          default -> throw new IllegalArgumentException("Unknown ownership test operation");
        };
  }

  @Then("both sandbox accounts retain their original balances and empty histories")
  public void bothAccountsUnchanged() {
    assertOriginalState(c.accountId, c.token);
    assertOriginalState(c.otherAccountId, c.otherToken);
  }

  private void assertOriginalState(String accountId, String token) {
    Response state =
        c.client
            .get("/api/v1/accounts/" + accountId, token)
            .then()
            .spec(ApiClient.JSON)
            .statusCode(200)
            .extract()
            .response();
    assertEquals(accountId, state.path("id"));
    assertEquals("USD", state.path("currency"));
    assertEquals("1000.00", state.path("creditLimit"));
    assertEquals("250.00", state.path("outstandingBalance"));
    assertEquals("750.00", state.path("availableCredit"));
    assertTrue(completeHistory(accountId, token).isEmpty());
  }

  private List<Map<String, Object>> completeHistory(String accountId, String token) {
    List<Map<String, Object>> complete = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    long before = Long.MAX_VALUE;
    while (true) {
      Response page =
          c.client
              .get(
                  "/api/v1/accounts/" + accountId + "/transactions?limit=2&before=" + before, token)
              .then()
              .spec(ApiClient.JSON)
              .statusCode(200)
              .extract()
              .response();
      List<Map<String, Object>> entries = page.jsonPath().getList("entries");
      assertNotNull(entries);
      assertTrue(entries.size() <= 2);
      long previous = before;
      for (Map<String, Object> entry : entries) {
        validateEntry(entry, accountId);
        long sequence = ((Number) entry.get("sequence")).longValue();
        assertTrue(sequence < previous, "Pages must be newest first without overlaps");
        assertTrue(seen.add((String) entry.get("id")), "A receipt cannot appear on two pages");
        previous = sequence;
      }
      complete.addAll(entries);
      Number next = page.path("nextCursor");
      if (next == null) return complete;
      assertFalse(entries.isEmpty(), "A continuation page must contain an entry");
      assertEquals(
          previous, next.longValue(), "The cursor must identify the last returned sequence");
      assertTrue(next.longValue() < before);
      before = next.longValue();
    }
  }

  private static void validateEntry(Map<String, Object> entry, String accountId) {
    assertEquals(
        Set.of(
            "id",
            "sequence",
            "accountId",
            "kind",
            "amount",
            "balanceAfter",
            "availableAfter",
            "postedAt"),
        entry.keySet());
    assertNotNull(UUID.fromString((String) entry.get("id")));
    assertEquals(accountId, entry.get("accountId"));
    assertTrue(((Number) entry.get("sequence")).longValue() > 0);
    assertTrue(Set.of("PURCHASE", "PAYMENT").contains(entry.get("kind")));
    assertNotNull(Instant.parse((String) entry.get("postedAt")));
    decimal(entry.get("amount"));
    decimal(entry.get("balanceAfter"));
    decimal(entry.get("availableAfter"));
  }

  private static BigDecimal decimal(Object value) {
    assertInstanceOf(String.class, value);
    assertTrue(((String) value).matches("[0-9]+\\.[0-9]{2}"));
    return new BigDecimal((String) value);
  }

  private void rememberNewPosting(Response response) {
    if (response.statusCode() == 201) {
      String id = response.path("id");
      assertNotNull(id);
      assertTrue(c.postedReceiptIds.add(id), "Each new posting must receive a distinct receipt");
    }
  }

  @Then("there are {int} ledger entries")
  public void entries(int count) {
    Response r =
        c.client
            .get(c.accountPath() + "/transactions", c.token)
            .then()
            .statusCode(200)
            .extract()
            .response();
    assertEquals(count, r.jsonPath().getList("entries").size());
  }

  @Then("history is newest first")
  public void order() {
    List<Long> seq = c.response.jsonPath().getList("entries.sequence", Long.class);
    assertTrue(seq.size() > 1);
    for (int i = 1; i < seq.size(); i++) assertTrue(seq.get(i - 1) > seq.get(i));
  }

  @When("I submit {int} simultaneous purchases of {string}")
  public void concurrent(int count, String amount) throws Exception {
    race(count, "purchases", amount, false);
  }

  @When("I submit {int} simultaneous identical payments of {string}")
  public void concurrentSame(int count, String amount) throws Exception {
    race(count, "payments", amount, true);
  }

  private void race(int count, String route, String amount, boolean same) throws Exception {
    try (ExecutorService executor = Executors.newFixedThreadPool(count)) {
      CountDownLatch start = new CountDownLatch(1);
      List<Future<Response>> futures = new ArrayList<>();
      for (int i = 0; i < count; i++) {
        String key = same ? "same-key" : "race-" + i;
        futures.add(
            executor.submit(
                () -> {
                  start.await();
                  return c.client.post(
                      c.accountPath() + "/" + route, c.token, key, ApiClient.amount(amount));
                }));
      }
      start.countDown();
      c.concurrentStatuses = new ArrayList<>();
      c.concurrentResponses = new ArrayList<>();
      for (Future<Response> f : futures) {
        Response response = f.get(30, TimeUnit.SECONDS);
        c.concurrentResponses.add(response);
        c.concurrentStatuses.add(response.statusCode());
        rememberNewPosting(response);
      }
    }
  }

  @Then("exactly {int} responses have status {int}")
  public void concurrentCount(int count, int status) {
    assertEquals(count, c.concurrentStatuses.stream().filter(s -> s == status).count());
  }

  @Then("all concurrent duplicate responses identify the same persisted receipt")
  public void concurrentReceiptIdentity() {
    assertTrue(c.concurrentResponses.size() > 1);
    Map<String, Object> original = c.concurrentResponses.getFirst().jsonPath().getMap("$");
    for (Response response : c.concurrentResponses) {
      assertTrue(response.statusCode() == 200 || response.statusCode() == 201);
      Map<String, Object> entry = response.jsonPath().getMap("$");
      validateEntry(entry, c.accountId);
      assertEquals(original, entry, "Concurrent retries must return the complete original receipt");
      assertEquals(
          Boolean.toString(response.statusCode() == 200), response.header("Idempotency-Replayed"));
    }
    List<Map<String, Object>> persisted = completeHistory(c.accountId, c.token);
    assertEquals(1, persisted.size());
    assertEquals(original, persisted.getFirst());
  }
}
