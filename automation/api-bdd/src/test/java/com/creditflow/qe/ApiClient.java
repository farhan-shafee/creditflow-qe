package com.creditflow.qe;

import static io.restassured.RestAssured.given;

import io.restassured.builder.*;
import io.restassured.config.LogConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.*;
import java.util.Map;

public final class ApiClient {
  private final RequestSpecification requests;
  public static final ResponseSpecification JSON =
      new ResponseSpecBuilder().expectContentType(ContentType.JSON).build();

  public ApiClient() {
    String base =
        System.getProperty(
            "creditflow.baseUrl",
            System.getenv().getOrDefault("CREDITFLOW_BASE_URL", "http://localhost:18081"));
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

  public Response sandbox() {
    return given().spec(requests).post("/api/v1/sandboxes");
  }

  public Response get(String path, String token) {
    return request(token).get(path);
  }

  public Response post(String path, String token, String key, Object body) {
    RequestSpecification request = request(token);
    if (key != null) request.header("Idempotency-Key", key);
    return request.body(body).post(path);
  }

  private RequestSpecification request(String token) {
    RequestSpecification request = given().spec(requests);
    if (token != null) request.header("Authorization", "Bearer " + token);
    return request;
  }

  public static Map<String, String> amount(String amount) {
    return Map.of("amount", amount);
  }
}
