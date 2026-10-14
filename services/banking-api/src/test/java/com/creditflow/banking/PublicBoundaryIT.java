package com.creditflow.banking;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

class PublicBoundaryIT {
  static ConfigurableApplicationContext app;
  static String base;
  static final String KEY = "test-only-provision-key-at-least-32-characters";

  @BeforeAll
  static void start() {
    app =
        SpringApplication.run(
            BankingApplication.class,
            "--server.port=0",
            "--creditflow.public-mode=true",
            "--creditflow.provision-key=" + KEY);
    base = "http://localhost:" + ((WebServerApplicationContext) app).getWebServer().getPort();
  }

  @AfterAll
  static void stop() {
    if (app != null) app.close();
  }

  @Test
  void allApiPathsRequireServerKeyIncludingAliases() {
    given().baseUri(base).post("/api/v1/sandboxes").then().statusCode(403);
    given()
        .baseUri(base)
        .urlEncodingEnabled(false)
        .post("/api/v1/sandboxes;probe=1")
        .then()
        .statusCode(403);
    given()
        .baseUri(base)
        .header("X-Sandbox-Provision-Key", "wrong")
        .post("/api/v1/sandboxes")
        .then()
        .statusCode(403);
  }

  @Test
  void serverKeyAllowsSandboxButDoesNotReplaceAccountOwnership() {
    String id =
        given()
            .baseUri(base)
            .header("X-Sandbox-Provision-Key", KEY)
            .post("/api/v1/sandboxes")
            .then()
            .statusCode(201)
            .extract()
            .path("accountId");
    given()
        .baseUri(base)
        .header("X-Sandbox-Provision-Key", KEY)
        .get("/api/v1/accounts/" + id)
        .then()
        .statusCode(401);
  }

  @Test
  void healthRemainsAvailableWithoutCredentials() {
    given().baseUri(base).get("/actuator/health").then().statusCode(200);
  }
}
