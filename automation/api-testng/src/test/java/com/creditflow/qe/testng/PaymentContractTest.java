package com.creditflow.qe.testng;

import static io.restassured.RestAssured.given;
import static org.testng.Assert.*;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.config.LogConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.*;
import org.testng.annotations.*;

public class PaymentContractTest {
  private String base;
  private String token;
  private String account;
  private RequestSpecification requests;

  @BeforeClass
  @Parameters({"baseUrl"})
  public void configure(@org.testng.annotations.Optional("") String configured) {
    base =
        configured.isBlank()
            ? System.getenv().getOrDefault("CREDITFLOW_BASE_URL", "http://localhost:18081")
            : configured;
    RequestSpecBuilder builder =
        new RequestSpecBuilder()
            .setBaseUri(base)
            .setContentType(ContentType.JSON)
            .setConfig(
                RestAssuredConfig.config()
                    .logConfig(
                        LogConfig.logConfig()
                            .blacklistHeader("Authorization", "X-Sandbox-Provision-Key")));
    String provisionKey = System.getenv("CREDITFLOW_PROVISION_KEY");
    if (provisionKey != null && !provisionKey.isBlank())
      builder.addHeader("X-Sandbox-Provision-Key", provisionKey);
    requests = builder.build();
  }

  private RequestSpecification request() {
    return given().spec(requests);
  }

  @BeforeMethod
  public void freshAccount() {
    Response r = request().post("/api/v1/sandboxes").then().statusCode(201).extract().response();
    token = r.path("token");
    account = r.path("accountId");
  }

  @DataProvider(name = "invalidPayments")
  public Object[][] cases() {
    return new Object[][] {
      {"0", 400, "INVALID_AMOUNT"},
      {"-10", 400, "INVALID_AMOUNT"},
      {"0.001", 400, "INVALID_AMOUNT"},
      {"1e2", 400, "INVALID_AMOUNT"},
      {"250.01", 422, "OVERPAYMENT"},
      {"1000000.01", 400, "INVALID_AMOUNT"}
    };
  }

  @Test(dataProvider = "invalidPayments")
  public void rejectsInvalidPaymentWithoutMutation(String amount, int status, String code) {
    Response r =
        request()
            .auth()
            .oauth2(token)
            .contentType("application/json")
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .body(Map.of("amount", amount))
            .post("/api/v1/accounts/" + account + "/payments");
    assertEquals(r.statusCode(), status);
    assertEquals(r.path("code"), code);
    Response state =
        request()
            .auth()
            .oauth2(token)
            .get("/api/v1/accounts/" + account)
            .then()
            .statusCode(200)
            .extract()
            .response();
    assertEquals(state.path("outstandingBalance"), "250.00");
    assertEquals(state.path("availableCredit"), "750.00");
    assertEquals(state.path("id"), account);
    assertEquals(state.path("currency"), "USD");
    assertEquals(state.path("creditLimit"), "1000.00");
    Response history =
        request()
            .auth()
            .oauth2(token)
            .get("/api/v1/accounts/" + account + "/transactions")
            .then()
            .statusCode(200)
            .extract()
            .response();
    assertTrue(history.jsonPath().getList("entries").isEmpty());
    assertNull(history.path("nextCursor"));
  }

  @AfterMethod
  public void clearCredentials() {
    token = null;
    account = null;
  }
}
