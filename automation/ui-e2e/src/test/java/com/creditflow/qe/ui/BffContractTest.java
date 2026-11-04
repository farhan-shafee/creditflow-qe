package com.creditflow.qe.ui;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.json.Json;

class BffContractTest {
  record LabSession(String cookie, String accountId) {}

  final String base = System.getenv().getOrDefault("CREDITFLOW_WEB_URL", "http://localhost:3100");
  final HttpClient client =
      HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .connectTimeout(Duration.ofSeconds(10))
          .build();

  HttpResponse<String> request(
      String path, String method, String body, String cookie, boolean origin) throws Exception {
    return request(path, method, body, cookie, origin, null);
  }

  HttpResponse<String> request(
      String path, String method, String body, String cookie, boolean origin, String labAccount)
      throws Exception {
    return request(path, method, body, cookie, origin, labAccount, null);
  }

  HttpResponse<String> request(
      String path,
      String method,
      String body,
      String cookie,
      boolean origin,
      String labAccount,
      String expectedAccount)
      throws Exception {
    // Allow the 20-second upstream deadline and 30-second hosted function deadline to return.
    HttpRequest.Builder builder =
        HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(35));
    if (origin) builder.header("Origin", base);
    if (cookie != null) builder.header("Cookie", cookie);
    if (labAccount != null) builder.header("X-Lab-Account", labAccount);
    if (expectedAccount != null) builder.header("X-Expected-Account", expectedAccount);
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

  LabSession freshLab() throws Exception {
    HttpResponse<String> created = request("/api/lab/sandbox", "POST", null, null, true);
    assertEquals(201, created.statusCode());
    Map<?, ?> payload = new Json().toType(created.body(), Map.class);
    assertEquals(Set.of("accountId", "expiresAt"), payload.keySet());
    String accountId = assertInstanceOf(String.class, payload.get("accountId"));
    assertFalse(accountId.isBlank());
    String cookie = created.headers().firstValue("set-cookie").orElseThrow();
    assertTrue(cookie.startsWith("creditflow_lab_session="));
    assertTrue(cookie.toLowerCase().contains("path=/api/lab"));
    assertTrue(cookie.toLowerCase().contains("httponly"));
    assertTrue(cookie.toLowerCase().contains("samesite=strict"));
    return new LabSession(cookie.split(";", 2)[0], accountId);
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

  @Test
  void expectedAccountGuardCannotRedirectAnIntentAcrossReplacedSessions() throws Exception {
    Json json = new Json();
    String firstCookie = fresh();
    String secondCookie = fresh();
    Map<?, ?> first =
        json.toType(request("/api/banking", "GET", null, firstCookie, false).body(), Map.class);
    Map<?, ?> second =
        json.toType(request("/api/banking", "GET", null, secondCookie, false).body(), Map.class);
    String firstId = String.valueOf(assertInstanceOf(Map.class, first.get("account")).get("id"));
    String secondId = String.valueOf(assertInstanceOf(Map.class, second.get("account")).get("id"));
    assertNotEquals(firstId, secondId);
    String body = "{\"operation\":\"payments\",\"amount\":\"50.00\",\"key\":\"cross-tab-guard\"}";
    HttpResponse<String> rejected =
        request("/api/banking", "POST", body, secondCookie, true, null, firstId);
    assertEquals(409, rejected.statusCode());
    Map<?, ?> rejection = json.toType(rejected.body(), Map.class);
    assertEquals("SESSION_CHANGED", rejection.get("code"));
    for (String cookie : List.of(firstCookie, secondCookie)) {
      HttpResponse<String> refreshed = request("/api/banking", "GET", null, cookie, false);
      assertEquals(200, refreshed.statusCode());
      Map<?, ?> snapshot = json.toType(refreshed.body(), Map.class);
      Map<?, ?> account = assertInstanceOf(Map.class, snapshot.get("account"));
      assertEquals("250.00", account.get("outstandingBalance"));
      assertEquals("750.00", account.get("availableCredit"));
      Map<?, ?> history = assertInstanceOf(Map.class, snapshot.get("history"));
      assertTrue(assertInstanceOf(List.class, history.get("entries")).isEmpty());
    }
    HttpResponse<String> accepted =
        request("/api/banking", "POST", body, secondCookie, true, null, secondId);
    assertEquals(
        201, accepted.statusCode(), "A rejected guard must not reserve the request identity");
    Map<?, ?> receipt = json.toType(accepted.body(), Map.class);
    assertEquals(secondId, receipt.get("accountId"));
    assertEquals("200.00", receipt.get("balanceAfter"));
    assertEquals("800.00", receipt.get("availableAfter"));
  }

  @Test
  void labSessionsAreSeparateAndLabWritesRequireSameOrigin() throws Exception {
    assertEquals(401, request("/api/lab/banking", "GET", null, null, false).statusCode());
    assertEquals(401, request("/api/lab/banking", "GET", null, fresh(), false).statusCode());
    LabSession lab = freshLab();
    assertEquals(401, request("/api/banking", "GET", null, lab.cookie(), false).statusCode());
    assertEquals(
        401,
        request("/api/lab/banking", "GET", null, lab.cookie() + "tampered", false).statusCode());
    assertEquals(403, request("/api/lab/sandbox", "POST", null, null, false).statusCode());
    assertEquals(
        403,
        request("/api/lab/banking", "POST", "{}", lab.cookie(), false, lab.accountId())
            .statusCode());
  }

  @Test
  void staleLabAccountGuardRejectsBeforeChangingTheNewAccount() throws Exception {
    LabSession previous = freshLab();
    LabSession current = freshLab();
    String payment =
        "{\"operation\":\"payments\",\"amount\":\"10.00\",\"key\":\"stale-lab-write\"}";
    HttpResponse<String> rejected =
        request("/api/lab/banking", "POST", payment, current.cookie(), true, previous.accountId());
    assertEquals(409, rejected.statusCode());
    assertTrue(rejected.body().contains("LAB_SESSION_CHANGED"));
    assertEquals(
        409, request("/api/lab/banking", "POST", payment, current.cookie(), true).statusCode());
    HttpResponse<String> snapshot =
        request("/api/lab/banking", "GET", null, current.cookie(), false);
    assertEquals(200, snapshot.statusCode());
    Map<?, ?> payload = new Json().toType(snapshot.body(), Map.class);
    Map<?, ?> account = assertInstanceOf(Map.class, payload.get("account"));
    assertEquals(current.accountId(), account.get("id"));
    assertEquals("250.00", account.get("outstandingBalance"));
    assertEquals("750.00", account.get("availableCredit"));
    Map<?, ?> history = assertInstanceOf(Map.class, payload.get("history"));
    assertTrue(assertInstanceOf(List.class, history.get("entries")).isEmpty());
  }

  @Test
  void labProxyPreservesReplayConflictAndTheSingleCommittedReceipt() throws Exception {
    LabSession lab = freshLab();
    String firstBody = "{\"operation\":\"payments\",\"amount\":\"10\",\"key\":\"bff-lab-replay\"}";
    String replayBody = firstBody.replace("\"10\"", "\"10.00\"");
    String conflictBody = firstBody.replace("\"10\"", "\"11\"");
    HttpResponse<String> first =
        request("/api/lab/banking", "POST", firstBody, lab.cookie(), true, lab.accountId());
    HttpResponse<String> replay =
        request("/api/lab/banking", "POST", replayBody, lab.cookie(), true, lab.accountId());
    HttpResponse<String> conflict =
        request("/api/lab/banking", "POST", conflictBody, lab.cookie(), true, lab.accountId());
    assertEquals(201, first.statusCode());
    assertEquals("false", first.headers().firstValue("idempotency-replayed").orElseThrow());
    assertEquals(200, replay.statusCode());
    assertEquals("true", replay.headers().firstValue("idempotency-replayed").orElseThrow());
    Json json = new Json();
    Map<?, ?> receipt = json.toType(first.body(), Map.class);
    assertEquals(receipt, json.toType(replay.body(), Map.class));
    assertEquals(409, conflict.statusCode());
    assertTrue(conflict.body().contains("IDEMPOTENCY_CONFLICT"));
    HttpResponse<String> refreshed = request("/api/lab/banking", "GET", null, lab.cookie(), false);
    assertEquals(200, refreshed.statusCode());
    Map<?, ?> snapshot = json.toType(refreshed.body(), Map.class);
    Map<?, ?> account = assertInstanceOf(Map.class, snapshot.get("account"));
    assertEquals("240.00", account.get("outstandingBalance"));
    assertEquals("760.00", account.get("availableCredit"));
    Map<?, ?> history = assertInstanceOf(Map.class, snapshot.get("history"));
    List<?> entries = assertInstanceOf(List.class, history.get("entries"));
    assertEquals(1, entries.size());
    Map<?, ?> entry = assertInstanceOf(Map.class, entries.getFirst());
    assertEquals(receipt.get("id"), entry.get("id"));
    assertFalse(refreshed.body().contains("\"token\""));
    assertFalse(refreshed.body().contains(lab.cookie().split("=", 2)[1]));
  }
}
