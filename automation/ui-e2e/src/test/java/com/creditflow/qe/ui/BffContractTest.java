package com.creditflow.qe.ui;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class BffContractTest {
  final String base = System.getenv().getOrDefault("CREDITFLOW_WEB_URL", "http://localhost:3100");
  final HttpClient client =
      HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .connectTimeout(Duration.ofSeconds(10))
          .build();

  HttpResponse<String> request(
      String path, String method, String body, String cookie, boolean origin) throws Exception {
    // Allow the 20-second upstream deadline and 30-second hosted function deadline to return.
    HttpRequest.Builder builder =
        HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(35));
    if (origin) builder.header("Origin", base);
    if (cookie != null) builder.header("Cookie", cookie);
    if (body != null) builder.header("Content-Type", "application/json");
    return client.send(
        builder
            .method(
                method,
                body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(body))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  String fresh() throws Exception {
    HttpResponse<String> created = request("/api/sandbox", "POST", null, null, true);
    assertEquals(201, created.statusCode());
    assertFalse(created.body().contains("\"token\""));
    String cookie = created.headers().firstValue("set-cookie").orElseThrow();
    assertTrue(cookie.toLowerCase().contains("httponly"));
    assertTrue(cookie.toLowerCase().contains("samesite=strict"));
    return cookie.split(";", 2)[0];
  }

  @Test
  void noSessionAndTamperedSessionAreRejected() throws Exception {
    assertEquals(401, request("/api/banking", "GET", null, null, false).statusCode());
    String cookie = fresh();
    assertEquals(
        401, request("/api/banking", "GET", null, cookie + "tampered", false).statusCode());
  }

  @Test
  void writesRequireSameOrigin() throws Exception {
    assertEquals(403, request("/api/sandbox", "POST", null, null, false).statusCode());
    assertEquals(403, request("/api/banking", "POST", "{}", fresh(), false).statusCode());
  }

  @Test
  void malformedJsonIsAClientError() throws Exception {
    String cookie = fresh();
    for (String body : new String[] {"{", "null", "[]"})
      assertEquals(400, request("/api/banking", "POST", body, cookie, true).statusCode());
    assertEquals(413, request("/api/banking", "POST", " ".repeat(1025), cookie, true).statusCode());
  }

  @Test
  void proxyRetainsIdempotencyAndOwnedBalances() throws Exception {
    String cookie = fresh();
    String payment = "{\"operation\":\"payments\",\"amount\":\"50.00\",\"key\":\"bff-payment\"}";
    assertEquals(201, request("/api/banking", "POST", payment, cookie, true).statusCode());
    assertEquals(200, request("/api/banking", "POST", payment, cookie, true).statusCode());
    HttpResponse<String> account = request("/api/banking", "GET", null, cookie, false);
    assertEquals(200, account.statusCode());
    assertTrue(account.body().contains("\"outstandingBalance\":\"200.00\""));
    assertFalse(account.body().contains("\"token\""));
  }
}
