package com.creditflow.qe;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.junit.jupiter.api.Assertions.*;

import io.cucumber.java.en.*;
import io.restassured.response.Response;
import java.math.BigDecimal;
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
      List<Future<Integer>> futures = new ArrayList<>();
      for (int i = 0; i < count; i++) {
        String key = same ? "same-key" : "race-" + i;
        futures.add(
            executor.submit(
                () -> {
                  start.await();
                  return c.client
                      .post(c.accountPath() + "/" + route, c.token, key, ApiClient.amount(amount))
                      .statusCode();
                }));
      }
      start.countDown();
      c.concurrentStatuses = new ArrayList<>();
      for (Future<Integer> f : futures) c.concurrentStatuses.add(f.get(30, TimeUnit.SECONDS));
    }
  }

  @Then("exactly {int} responses have status {int}")
  public void concurrentCount(int count, int status) {
    assertEquals(count, c.concurrentStatuses.stream().filter(s -> s == status).count());
  }
}
