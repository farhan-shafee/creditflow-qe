package com.creditflow.qe;

import io.cucumber.java.*;
import io.restassured.response.Response;

public class ScenarioHooks {
  private final ScenarioContext context;

  public ScenarioHooks(ScenarioContext context) {
    this.context = context;
  }

  @Before
  public void provision() {
    Response created =
        context.client.sandbox().then().spec(ApiClient.JSON).statusCode(201).extract().response();
    context.accountId = created.path("accountId");
    context.token = created.path("token");
  }

  @After
  public void evidence(Scenario scenario) {
    // Deliberately exclude session tokens, headers and sandbox creation bodies.
    scenario.attach(
        "account="
            + context.accountId
            + "; lastStatus="
            + (context.response == null ? "none" : context.response.statusCode()),
        "text/plain",
        "Redacted execution summary");
    context.token = null;
    context.otherToken = null;
  }
}
