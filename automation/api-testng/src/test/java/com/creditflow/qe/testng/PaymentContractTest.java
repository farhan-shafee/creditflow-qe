package com.creditflow.qe.testng;

import static io.restassured.RestAssured.given;
import static org.testng.Assert.*;

import io.restassured.response.Response;
import java.util.*;
import org.testng.annotations.*;

public class PaymentContractTest {
  private String base;
  private String token;
  private String account;

  @BeforeClass
  @Parameters({"baseUrl"})
  public void configure(@org.testng.annotations.Optional("") String configured) {
    base =
        configured.isBlank()
            ? System.getenv().getOrDefault("CREDITFLOW_BASE_URL", "http://localhost:18081")
            : configured;
  }

  @BeforeMethod
  public void freshAccount() {
    Response r =
        given().baseUri(base).post("/api/v1/sandboxes").then().statusCode(201).extract().response();
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
        given()
            .baseUri(base)
            .auth()
            .oauth2(token)
            .contentType("application/json")
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .body(Map.of("amount", amount))
            .post("/api/v1/accounts/" + account + "/payments");
    assertEquals(r.statusCode(), status);
    assertEquals(r.path("code"), code);
    Response state =
        given()
            .baseUri(base)
            .auth()
            .oauth2(token)
            .get("/api/v1/accounts/" + account)
            .then()
            .statusCode(200)
            .extract()
            .response();
    assertEquals(state.path("outstandingBalance"), "250.00");
    assertEquals(state.path("availableCredit"), "750.00");
  }

  @AfterMethod
  public void clearCredentials() {
    token = null;
    account = null;
  }
}
