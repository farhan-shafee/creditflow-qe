package com.creditflow.qe.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.ReducedMotion;
import com.microsoft.playwright.options.RequestOptions;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.openqa.selenium.json.Json;

class WorkspaceJourneyTest {
  Playwright playwright;
  Browser browser;
  BrowserContext context;
  Page page;
  final Json json = new Json();
  final String base = System.getenv().getOrDefault("CREDITFLOW_WEB_URL", "http://localhost:3100");

  record LabCase(
      String scenario,
      List<Integer> statuses,
      String outstanding,
      String available,
      int entries,
      String errorCode) {}

  record LabPost(int status, String replayed, Map<?, ?> body) {}

  record LabWrite(Map<?, ?> intent, int status, String replayed, Map<?, ?> receipt) {}

  static Stream<LabCase> labCases() {
    return Stream.of(
        new LabCase("purchase", List.of(201), "350.00", "650.00", 1, null),
        new LabCase(
            "insufficient-credit", List.of(422), "250.00", "750.00", 0, "INSUFFICIENT_CREDIT"),
        new LabCase("identical-replay", List.of(201, 200), "240.00", "760.00", 1, null),
        new LabCase(
            "conflicting-key", List.of(201, 409), "240.00", "760.00", 1, "IDEMPOTENCY_CONFLICT"));
  }

  @BeforeEach
  void openWorkspace() {
    playwright = Playwright.create();
    browser =
        playwright
            .chromium()
            .connect(
                System.getenv().getOrDefault("CREDITFLOW_PLAYWRIGHT_URL", "ws://localhost:3001"));
    context = browser.newContext(new Browser.NewContextOptions().setViewportSize(1440, 1000));
    context
        .tracing()
        .start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true).setSources(true));
    page = context.newPage();
    page.setDefaultTimeout(20000);
    page.navigate(base);
    assertThat(page.getByTestId("start-sandbox")).isVisible();
  }

  void startAccount() {
    page.getByTestId("start-sandbox").click();
    assertThat(page.getByTestId("outstanding")).hasText("$250.00");
  }

  Map<?, ?> object(String text) {
    return json.toType(text, Map.class);
  }

  void assertSnapshot(Map<?, ?> snapshot, String outstanding, String available, int entries) {
    Map<?, ?> account = assertInstanceOf(Map.class, snapshot.get("account"));
    assertEquals(outstanding, account.get("outstandingBalance"));
    assertEquals(available, account.get("availableCredit"));
    Map<?, ?> history = assertInstanceOf(Map.class, snapshot.get("history"));
    List<?> rows = assertInstanceOf(List.class, history.get("entries"));
    assertEquals(entries, rows.size());
    assertNull(history.get("nextCursor"), "A bounded demo must verify its complete ledger");
  }

  String bankingCookie() {
    return "creditflow_session="
        + context.cookies().stream()
            .filter(cookie -> cookie.name.equals("creditflow_session"))
            .findFirst()
            .orElseThrow()
            .value;
  }

  Map<?, ?> snapshotForCookie(String cookie) {
    APIRequestContext client = playwright.request().newContext();
    try {
      APIResponse response =
          client.get(base + "/api/banking", RequestOptions.create().setHeader("Cookie", cookie));
      try {
        assertEquals(200, response.status());
        return object(response.text());
      } finally {
        response.dispose();
      }
    } finally {
      client.dispose();
    }
  }

  String accountId(Map<?, ?> snapshot) {
    return String.valueOf(assertInstanceOf(Map.class, snapshot.get("account")).get("id"));
  }

  @Test
  void missingSessionTerminatesTheUnconfirmedIntentAndAllowsExplicitFreshCreation() {
    startAccount();
    String originalCookie = bankingCookie();
    context.clearCookies();
    int[] writes = {0};
    page.onRequest(
        request -> {
          if (request.url().endsWith("/api/banking") && request.method().equals("POST"))
            writes[0]++;
        });
    page.getByTestId("amount").fill("50.00");
    Response rejected =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("POST"),
            () -> page.getByTestId("submit-transaction").click());
    assertEquals(401, rejected.status());
    assertThat(page.getByTestId("start-sandbox")).isEnabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertThat(page.getByTestId("retry-transaction")).not().isVisible();
    assertThat(page.getByTestId("outstanding")).hasText("—");
    assertSnapshot(snapshotForCookie(originalCookie), "250.00", "750.00", 0);
    page.getByTestId("start-sandbox").click();
    assertThat(page.getByTestId("outstanding")).hasText("$250.00");
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
    assertEquals(1, writes[0], "Starting fresh must not submit the terminated intent");
    assertSnapshot(snapshotForCookie(bankingCookie()), "250.00", "750.00", 0);
  }

  @Test
  void anotherTabReplacingTheSessionCannotRedirectAnOldIntentToItsNewAccount() {
    startAccount();
    String originalCookie = bankingCookie();
    Map<?, ?> original = snapshotForCookie(originalCookie);
    Page other = context.newPage();
    try {
      other.navigate(base);
      assertThat(other.getByTestId("start-sandbox")).isEnabled();
      Response replacement =
          other.waitForResponse(
              response ->
                  response.url().endsWith("/api/banking")
                      && response.request().method().equals("GET")
                      && response.status() == 200,
              () -> other.getByTestId("start-sandbox").click());
      Map<?, ?> second = object(replacement.text());
      String secondCookie = bankingCookie();
      assertNotEquals(accountId(original), accountId(second));
      page.getByTestId("amount").fill("50.00");
      Response rejected =
          page.waitForResponse(
              response ->
                  response.url().endsWith("/api/banking")
                      && response.request().method().equals("POST"),
              () -> page.getByTestId("submit-transaction").click());
      assertEquals(409, rejected.status());
      assertEquals("SESSION_CHANGED", object(rejected.text()).get("code"));
      assertEquals(accountId(original), rejected.request().headers().get("x-expected-account"));
      assertThat(page.getByTestId("start-sandbox")).isEnabled();
      assertThat(page.getByTestId("submit-transaction")).isDisabled();
      assertThat(page.getByTestId("retry-transaction")).not().isVisible();
      assertSnapshot(snapshotForCookie(originalCookie), "250.00", "750.00", 0);
      assertSnapshot(snapshotForCookie(secondCookie), "250.00", "750.00", 0);
    } finally {
      other.close();
    }
  }

  @Test
  void committedCreationWithUnreadableResponseLocksPostingUntilItsNewCookieIsReconciled() {
    startAccount();
    String originalCookie = bankingCookie();
    String originalAccount = accountId(snapshotForCookie(originalCookie));
    String[] createdAccount = {null};
    int[] creates = {0};
    int[] reads = {0};
    int[] writes = {0};
    page.onRequest(
        request -> {
          if (creates[0] > 0
              && request.url().endsWith("/api/banking")
              && request.method().equals("GET")) reads[0]++;
          if (request.url().endsWith("/api/banking") && request.method().equals("POST"))
            writes[0]++;
        });
    page.route(
        "**/api/sandbox",
        route -> {
          APIResponse response = route.fetch();
          try {
            assertEquals(201, response.status());
            createdAccount[0] = String.valueOf(object(response.text()).get("accountId"));
            creates[0]++;
            Map<String, String> headers = new HashMap<>(response.headers());
            headers.remove("content-length");
            headers.remove("content-encoding");
            headers.remove("transfer-encoding");
            // Preserve the real Set-Cookie, but make delivery of the confirmation JSON unreadable.
            route.fulfill(
                new Route.FulfillOptions().setStatus(201).setHeaders(headers).setBody("{"));
          } finally {
            response.dispose();
          }
        });
    page.getByTestId("start-sandbox").click();
    assertThat(page.getByTestId("refresh-account")).isVisible();
    assertThat(page.getByTestId("start-sandbox")).isEnabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertThat(page.getByTestId("amount")).isDisabled();
    assertThat(page.getByTestId("operation")).isDisabled();
    assertEquals(1, creates[0]);
    assertEquals(0, writes[0], "An unconfirmed account cannot accept a financial posting");
    assertEquals(0, reads[0], "An ambiguous create must await the explicit reconciliation action");
    Map<?, ?> barrier =
        (Map<?, ?>)
            page.evaluate("() => JSON.parse(sessionStorage.getItem('creditflow.pending.v1'))");
    assertEquals(1, assertInstanceOf(Number.class, barrier.get("version")).intValue());
    assertEquals("fresh-account", barrier.get("purpose"));
    assertEquals(originalAccount, barrier.get("previousAccountId"));
    assertNull(
        barrier.get("createdAccountId"),
        "Unreadable confirmation cannot certify a created identity");
    String replacementCookie = bankingCookie();
    Map<?, ?> replacement = snapshotForCookie(replacementCookie);
    assertEquals(createdAccount[0], accountId(replacement));
    assertSnapshot(replacement, "250.00", "750.00", 0);
    assertSnapshot(snapshotForCookie(originalCookie), "250.00", "750.00", 0);
    Route[] heldRead = {null};
    page.route(
        "**/api/banking",
        route -> {
          if (route.request().method().equals("GET")) heldRead[0] = route;
          else route.resume();
        });
    page.getByTestId("refresh-account").click();
    page.waitForCondition(() -> heldRead[0] != null);
    assertThat(page.getByTestId("start-sandbox")).isDisabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertThat(page.getByTestId("amount")).isDisabled();
    assertThat(page.getByTestId("operation")).isDisabled();
    assertEquals(
        barrier,
        page.evaluate("() => JSON.parse(sessionStorage.getItem('creditflow.pending.v1'))"),
        "The replacement barrier must remain until the authoritative GET completes");
    assertEquals(1, creates[0], "Reconciliation must not create another account");
    assertEquals(0, writes[0], "Waiting for authoritative state must never submit a posting");
    Response reconciled =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("GET")
                    && response.status() == 200,
            () -> heldRead[0].resume());
    assertEquals(createdAccount[0], accountId(object(reconciled.text())));
    assertSnapshot(object(reconciled.text()), "250.00", "750.00", 0);
    page.unroute("**/api/banking");
    assertThat(page.getByTestId("refresh-account")).not().isVisible();
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
    assertTrue(
        (Boolean) page.evaluate("() => sessionStorage.getItem('creditflow.pending.v1') === null"));
    assertEquals(1, reads[0], "Only the explicit reconciliation GET may release this barrier");
    page.getByTestId("amount").fill("10.00");
    Response posted =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("POST"),
            () -> page.getByTestId("submit-transaction").click());
    assertEquals(201, posted.status());
    assertEquals(createdAccount[0], object(posted.text()).get("accountId"));
    assertEquals(createdAccount[0], posted.request().headers().get("x-expected-account"));
    assertThat(page.getByTestId("outstanding")).hasText("$240.00");
    assertEquals(1, writes[0], "Only the explicit posting after reconciliation is permitted");
    assertEquals(1, creates[0]);
    assertSnapshot(snapshotForCookie(replacementCookie), "240.00", "760.00", 1);
    assertSnapshot(snapshotForCookie(originalCookie), "250.00", "750.00", 0);
  }

  @Test
  void foreignReceiptKeepsTheRealStatusButCannotConfirmOrRedirectTheOwnedIntent() {
    startAccount();
    String originalCookie = bankingCookie();
    String ownedAccount = accountId(snapshotForCookie(originalCookie));
    // This independent API context is outside the browser trace and never shares its credentials.
    APIRequestContext auxiliary = playwright.request().newContext();
    try {
      APIResponse created =
          auxiliary.post(base + "/api/sandbox", RequestOptions.create().setHeader("Origin", base));
      String foreignAccount;
      try {
        assertEquals(201, created.status());
        foreignAccount = String.valueOf(object(created.text()).get("accountId"));
      } finally {
        created.dispose();
      }
      APIResponse foreignPosting =
          auxiliary.post(
              base + "/api/banking",
              RequestOptions.create()
                  .setHeader("Origin", base)
                  .setHeader("Content-Type", "application/json")
                  .setHeader("X-Expected-Account", foreignAccount)
                  .setData(
                      "{\"operation\":\"payments\",\"amount\":\"7.00\",\"key\":\"foreign-receipt-proof\"}"));
      Map<?, ?> foreignReceipt;
      try {
        assertEquals(201, foreignPosting.status());
        foreignReceipt = object(foreignPosting.text());
        assertEquals(foreignAccount, foreignReceipt.get("accountId"));
      } finally {
        foreignPosting.dispose();
      }
      List<LabWrite> writes = new ArrayList<>();
      page.route(
          "**/api/banking",
          route -> {
            if (!route.request().method().equals("POST")) {
              route.resume();
              return;
            }
            APIResponse response = route.fetch();
            try {
              writes.add(
                  new LabWrite(
                      object(route.request().postData()),
                      response.status(),
                      response.headers().get("idempotency-replayed"),
                      object(response.text())));
              if (writes.size() == 1) {
                Map<String, String> headers = new HashMap<>(response.headers());
                headers.remove("content-length");
                headers.remove("content-encoding");
                headers.remove("transfer-encoding");
                route.fulfill(
                    new Route.FulfillOptions()
                        .setStatus(response.status())
                        .setHeaders(headers)
                        .setBody(json.toJson(foreignReceipt)));
              } else {
                route.fulfill(
                    new Route.FulfillOptions().setResponse(response).setBodyBytes(response.body()));
              }
            } finally {
              response.dispose();
            }
          });
      page.getByTestId("amount").fill("50.00");
      page.getByTestId("submit-transaction").click();
      assertThat(page.getByTestId("retry-transaction")).isVisible();
      assertThat(page.getByTestId("inspector-status")).hasText("201");
      assertThat(page.locator(".inspector .tag")).hasText("uncertain");
      assertThat(page.getByTestId("submit-transaction")).isDisabled();
      assertThat(page.getByTestId("amount")).isDisabled();
      assertEquals(1, writes.size());
      assertEquals(201, writes.getFirst().status());
      assertEquals(ownedAccount, writes.getFirst().receipt().get("accountId"));
      assertNotEquals(foreignAccount, ownedAccount);
      assertSnapshot(snapshotForCookie(originalCookie), "200.00", "800.00", 1);
      page.getByTestId("retry-transaction").click();
      assertThat(page.getByTestId("outstanding")).hasText("$200.00");
      assertThat(page.getByTestId("available")).hasText("$800.00");
      assertThat(page.getByTestId("ledger-row")).hasCount(1);
      assertThat(page.getByTestId("receipt"))
          .containsText(String.valueOf(writes.getFirst().receipt().get("id")));
      assertEquals(2, writes.size());
      assertEquals(writes.getFirst().intent(), writes.getLast().intent());
      assertEquals(200, writes.getLast().status());
      assertEquals("true", writes.getLast().replayed());
      assertEquals(writes.getFirst().receipt(), writes.getLast().receipt());
      APIResponse foreignSnapshot = auxiliary.get(base + "/api/banking");
      try {
        assertEquals(200, foreignSnapshot.status());
        assertSnapshot(object(foreignSnapshot.text()), "243.00", "757.00", 1);
      } finally {
        foreignSnapshot.dispose();
      }
      assertSnapshot(snapshotForCookie(originalCookie), "200.00", "800.00", 1);
      assertSessionValuesAreAbsentFromPage();
    } finally {
      auxiliary.dispose();
    }
  }

  @Test
  void reloadRestoresTheUnconfirmedOwnedIntentUntilItsExplicitSafeReplay() {
    startAccount();
    String originalCookie = bankingCookie();
    String ownedAccount = accountId(snapshotForCookie(originalCookie));
    List<LabWrite> writes = new ArrayList<>();
    List<String> expectedAccounts = new ArrayList<>();
    int[] replacements = {0};
    page.onRequest(
        request -> {
          if (request.url().endsWith("/api/sandbox") && request.method().equals("POST"))
            replacements[0]++;
        });
    page.route(
        "**/api/banking",
        route -> {
          if (!route.request().method().equals("POST")) {
            route.resume();
            return;
          }
          APIResponse response = route.fetch();
          try {
            expectedAccounts.add(route.request().headers().get("x-expected-account"));
            writes.add(
                new LabWrite(
                    object(route.request().postData()),
                    response.status(),
                    response.headers().get("idempotency-replayed"),
                    object(response.text())));
            if (writes.size() == 1) route.abort();
            else
              route.fulfill(
                  new Route.FulfillOptions().setResponse(response).setBodyBytes(response.body()));
          } finally {
            response.dispose();
          }
        });
    page.getByTestId("operation").selectOption("purchases");
    page.getByTestId("amount").fill("37.25");
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("retry-transaction")).isVisible();
    assertEquals(1, writes.size());
    assertEquals(201, writes.getFirst().status());
    assertEquals("false", writes.getFirst().replayed());
    assertEquals(ownedAccount, writes.getFirst().receipt().get("accountId"));
    Response restored =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("GET")
                    && response.status() == 200,
            () -> page.reload());
    assertSnapshot(object(restored.text()), "287.25", "712.75", 1);
    assertThat(page.getByTestId("retry-transaction")).isVisible();
    assertThat(page.getByTestId("amount")).hasValue("37.25");
    assertThat(page.getByTestId("operation")).hasValue("purchases");
    assertThat(page.getByTestId("amount")).isDisabled();
    assertThat(page.getByTestId("operation")).isDisabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertThat(page.getByTestId("start-sandbox")).isDisabled();
    assertEquals(
        1, writes.size(), "Reload must only read state, never resubmit an ambiguous write");
    page.getByTestId("retry-transaction").click();
    assertThat(page.getByTestId("outstanding")).hasText("$287.25");
    assertThat(page.getByTestId("available")).hasText("$712.75");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
    assertThat(page.getByTestId("retry-transaction")).not().isVisible();
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
    assertEquals(2, writes.size());
    assertEquals(writes.getFirst().intent(), writes.getLast().intent());
    assertEquals(List.of(ownedAccount, ownedAccount), expectedAccounts);
    assertEquals(200, writes.getLast().status());
    assertEquals("true", writes.getLast().replayed());
    assertEquals(writes.getFirst().receipt(), writes.getLast().receipt());
    assertEquals(0, replacements[0], "Reload and replay must preserve the original account");
    assertSnapshot(snapshotForCookie(originalCookie), "287.25", "712.75", 1);
    page.reload();
    assertThat(page.getByTestId("outstanding")).hasText("$287.25");
    assertThat(page.getByTestId("retry-transaction")).not().isVisible();
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
    assertEquals(
        2, writes.size(), "A reconciled recovery record must be cleared before later reloads");
  }

  @Test
  void rejectedFreshCreationCannotClearACorruptRecoveryBarrierForTheOldAccount() {
    startAccount();
    String originalCookie = bankingCookie();
    String originalAccount = accountId(snapshotForCookie(originalCookie));
    int[] writes = {0};
    int[] rejectedCreates = {0};
    page.onRequest(
        request -> {
          if (request.url().endsWith("/api/banking") && request.method().equals("POST"))
            writes[0]++;
        });
    page.evaluate("() => sessionStorage.setItem('creditflow.pending.v1', '{broken')");
    page.reload();
    assertThat(page.getByTestId("start-sandbox")).isEnabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    page.route(
        "**/api/sandbox",
        route -> {
          rejectedCreates[0]++;
          route.fulfill(
              new Route.FulfillOptions()
                  .setStatus(429)
                  .setContentType("application/json")
                  .setBody(
                      "{\"code\":\"RATE_LIMITED\",\"message\":\"Local test rejection before account creation.\"}"));
        });
    Response rejected =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/sandbox")
                    && response.request().method().equals("POST"),
            () -> page.getByTestId("start-sandbox").click());
    assertEquals(429, rejected.status());
    assertThat(page.getByTestId("start-sandbox")).isEnabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertEquals(1, rejectedCreates[0], "Creation rejection must not trigger an automatic retry");
    page.reload();
    assertThat(page.getByTestId("start-sandbox")).isEnabled();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    assertEquals(
        0, writes[0], "The old account must remain blocked across reload after failed creation");
    Map<?, ?> untouched = snapshotForCookie(originalCookie);
    assertEquals(originalAccount, accountId(untouched));
    assertSnapshot(untouched, "250.00", "750.00", 0);
    assertEquals(originalAccount, accountId(snapshotForCookie(bankingCookie())));

    page.unroute("**/api/sandbox");
    Response replacement =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("GET")
                    && response.status() == 200,
            () -> page.getByTestId("start-sandbox").click());
    Map<?, ?> fresh = object(replacement.text());
    String freshAccount = accountId(fresh);
    assertNotEquals(originalAccount, freshAccount);
    assertSnapshot(fresh, "250.00", "750.00", 0);
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
    page.getByTestId("amount").fill("10.00");
    Response posted =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("POST"),
            () -> page.getByTestId("submit-transaction").click());
    assertEquals(201, posted.status());
    assertEquals(freshAccount, object(posted.text()).get("accountId"));
    assertThat(page.getByTestId("outstanding")).hasText("$240.00");
    assertEquals(
        1, writes[0], "Only the explicitly created fresh account may accept a new posting");
    assertSnapshot(snapshotForCookie(bankingCookie()), "240.00", "760.00", 1);
    assertSnapshot(snapshotForCookie(originalCookie), "250.00", "750.00", 0);
  }

  @ParameterizedTest(name = "lab {0}")
  @MethodSource("labCases")
  void labProvesRealStatusesAndPersistedStateWithoutChangingSimulator(LabCase example) {
    startAccount();
    List<Response> postResponses = new ArrayList<>();
    List<Response> snapshotResponses = new ArrayList<>();
    page.onResponse(
        response -> {
          if (!response.url().endsWith("/api/lab/banking")) return;
          if (response.request().method().equals("POST")) {
            // Record first: synchronous Playwright calls can dispatch nested response callbacks.
            postResponses.add(response);
            if (example.scenario().equals("conflicting-key") && response.status() == 201) {
              // Exercise a slow observer while the browser continues its real request sequence.
              page.waitForCondition(
                  () -> postResponses.stream().anyMatch(post -> post.status() == 409));
            }
          } else if (response.request().method().equals("GET") && response.status() == 200) {
            snapshotResponses.add(response);
          }
        });
    page.getByTestId("lab-select").selectOption(example.scenario());
    page.getByTestId("lab-run").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "passed");
    assertThat(page.getByTestId("lab-status")).containsText("Passed");
    List<LabPost> posts =
        postResponses.stream()
            .map(
                response ->
                    new LabPost(
                        response.status(),
                        response.headers().get("idempotency-replayed"),
                        object(response.text())))
            .toList();
    List<Map<?, ?>> snapshots = new ArrayList<>();
    for (Response response : snapshotResponses) snapshots.add(object(response.text()));
    assertEquals(
        example.statuses(),
        posts.stream().map(LabPost::status).toList(),
        "The visible verdict must agree with the actual HTTP write responses");
    assertFalse(snapshots.isEmpty(), "Passed requires a real account and ledger refresh");
    Map<?, ?> labSnapshot = snapshots.getLast();
    assertSnapshot(labSnapshot, example.outstanding(), example.available(), example.entries());
    if (example.errorCode() != null) {
      assertEquals(example.errorCode(), posts.getLast().body().get("code"));
    }
    if (example.scenario().equals("identical-replay")) {
      assertEquals("false", posts.getFirst().replayed());
      assertEquals("true", posts.getLast().replayed());
      assertEquals(
          posts.getFirst().body(),
          posts.getLast().body(),
          "Replay must return the identical committed receipt");
    }
    if (example.entries() == 1) {
      Map<?, ?> history = assertInstanceOf(Map.class, labSnapshot.get("history"));
      Map<?, ?> entry =
          assertInstanceOf(
              Map.class, assertInstanceOf(List.class, history.get("entries")).getFirst());
      assertEquals(
          posts.getFirst().body().get("id"),
          entry.get("id"),
          "The persisted row must identify the committed receipt");
    }
    APIResponse simulator = context.request().get(base + "/api/banking");
    try {
      assertEquals(200, simulator.status());
      assertSnapshot(object(simulator.text()), "250.00", "750.00", 0);
    } finally {
      simulator.dispose();
    }
    assertThat(page.getByTestId("outstanding")).hasText("$250.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(0);
    assertSessionValuesAreAbsentFromPage();
  }

  @Test
  void lostLabWriteResponseRequiresExplicitRetryOfTheSameCommittedIntent() {
    List<LabWrite> writes = new ArrayList<>();
    List<Response> snapshots = new ArrayList<>();
    int[] sandboxes = {0};
    page.onRequest(
        request -> {
          if (request.url().endsWith("/api/lab/sandbox") && request.method().equals("POST"))
            sandboxes[0]++;
        });
    page.onResponse(
        response -> {
          if (response.url().endsWith("/api/lab/banking")
              && response.request().method().equals("GET")
              && response.status() == 200) {
            snapshots.add(response);
          }
        });
    page.route(
        "**/api/lab/banking",
        route -> {
          if (!route.request().method().equals("POST")) {
            route.resume();
            return;
          }
          APIResponse response = route.fetch();
          try {
            writes.add(
                new LabWrite(
                    object(route.request().postData()),
                    response.status(),
                    response.headers().get("idempotency-replayed"),
                    object(response.text())));
            if (writes.size() == 1) route.abort();
            else
              route.fulfill(
                  new Route.FulfillOptions().setResponse(response).setBodyBytes(response.body()));
          } finally {
            response.dispose();
          }
        });
    page.getByTestId("lab-select").selectOption("purchase");
    page.getByTestId("lab-run").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "inconclusive");
    assertThat(page.getByTestId("lab-retry")).isVisible();
    assertThat(page.getByTestId("lab-run")).isDisabled();
    assertThat(page.getByTestId("lab-select")).isDisabled();
    assertEquals(
        1, writes.size(), "An ambiguous response must not trigger an automatic write retry");
    assertEquals(201, writes.getFirst().status(), "The lost response must follow a real commit");
    assertEquals("false", writes.getFirst().replayed());
    page.getByTestId("lab-retry").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "passed");
    assertEquals(1, sandboxes[0], "Retry must preserve the lab account instead of replacing it");
    assertEquals(2, writes.size());
    assertEquals(writes.getFirst().intent(), writes.getLast().intent());
    assertEquals(200, writes.getLast().status());
    assertEquals("true", writes.getLast().replayed());
    assertEquals(writes.getFirst().receipt(), writes.getLast().receipt());
    assertFalse(snapshots.isEmpty());
    assertSnapshot(object(snapshots.getLast().text()), "350.00", "650.00", 1);
  }

  @Test
  void selectingAnotherLabScenarioClearsThePreviousVerdictWithoutRunningIt() {
    int[] requests = {0};
    page.onRequest(
        request -> {
          if (request.url().contains("/api/lab/")) requests[0]++;
        });
    page.getByTestId("lab-select").selectOption("purchase");
    page.getByTestId("lab-run").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "passed");
    assertTrue(page.getByTestId("lab-check").count() > 0);
    assertTrue(page.getByTestId("lab-exchange").count() > 0);
    int completedRequests = requests[0];
    page.getByTestId("lab-select").selectOption("insufficient-credit");
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "ready");
    assertThat(page.getByTestId("lab-status")).containsText("Ready");
    assertThat(page.getByTestId("lab-check")).hasCount(0);
    assertThat(page.getByTestId("lab-exchange")).hasCount(0);
    assertThat(page.getByTestId("lab-outstanding")).not().isVisible();
    assertThat(page.locator("#lab")).containsText("$750.01");
    assertEquals(
        completedRequests, requests[0], "Changing the selected demo must not issue requests");
  }

  @Test
  void failedLabVerificationRefreshesWithoutPostingAgain() {
    java.util.concurrent.atomic.AtomicInteger writes =
        new java.util.concurrent.atomic.AtomicInteger();
    java.util.concurrent.atomic.AtomicBoolean lost =
        new java.util.concurrent.atomic.AtomicBoolean();
    List<Response> snapshots = new ArrayList<>();
    page.onResponse(
        response -> {
          if (response.url().endsWith("/api/lab/banking")
              && response.request().method().equals("GET")
              && response.status() == 200) {
            snapshots.add(response);
          }
        });
    page.route(
        "**/api/lab/banking",
        route -> {
          if (route.request().method().equals("POST")) {
            writes.incrementAndGet();
            route.resume();
          } else if (writes.get() > 0 && lost.compareAndSet(false, true)) route.abort();
          else route.resume();
        });
    page.getByTestId("lab-select").selectOption("purchase");
    page.getByTestId("lab-run").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "inconclusive");
    assertThat(page.getByTestId("lab-refresh")).isVisible();
    assertThat(page.getByTestId("lab-retry")).not().isVisible();
    assertEquals(1, writes.get());
    page.getByTestId("lab-refresh").click();
    assertThat(page.getByTestId("lab-status")).hasAttribute("data-state", "passed");
    assertEquals(1, writes.get(), "Refreshing a confirmed write must never repeat it");
    assertFalse(snapshots.isEmpty());
    assertSnapshot(object(snapshots.getLast().text()), "350.00", "650.00", 1);
  }

  @Test
  void inspectorAndKeyboardLedgerDetailsShowTheActualPosting() {
    startAccount();
    page.getByTestId("amount").fill("50.00");
    Response posted =
        page.waitForResponse(
            response ->
                response.url().endsWith("/api/banking")
                    && response.request().method().equals("POST"),
            () -> page.getByTestId("submit-transaction").click());
    assertEquals(201, posted.status());
    Map<?, ?> receipt = object(posted.text());
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("inspector-status")).containsText("201");
    assertThat(page.getByTestId("inspector-duration")).containsText(Pattern.compile("\\d+.*ms"));
    assertThat(page.getByTestId("inspector-operation"))
        .containsText(Pattern.compile("payment", Pattern.CASE_INSENSITIVE));
    assertThat(page.getByTestId("inspector-request")).containsText("50.00");
    assertThat(page.getByTestId("receipt")).containsText(String.valueOf(receipt.get("id")));
    assertThat(page.getByTestId("receipt")).containsText("PAYMENT");
    assertSessionValuesAreAbsentFromPage();

    Locator ledgerDetails = page.getByTestId("ledger-details").first();
    ledgerDetails.focus();
    page.keyboard().press("Enter");
    Locator drawer = page.getByTestId("transaction-drawer");
    assertThat(drawer).isVisible();
    assertThat(drawer).containsText(String.valueOf(receipt.get("id")));
    assertThat(drawer).containsText("50.00");
    assertTrue((Boolean) drawer.evaluate("dialog => dialog.contains(document.activeElement)"));
    Locator drawerControls = drawer.locator("button:not([disabled]),a[href],pre[tabindex='0']");
    drawerControls.last().focus();
    page.keyboard().press("Tab");
    assertTrue(
        (Boolean) drawer.evaluate("dialog => dialog.contains(document.activeElement)"),
        "Forward Tab must remain inside the transaction drawer");
    drawerControls.first().focus();
    page.keyboard().press("Shift+Tab");
    assertTrue(
        (Boolean) drawer.evaluate("dialog => dialog.contains(document.activeElement)"),
        "Reverse Tab must remain inside the transaction drawer");
    page.keyboard().press("Escape");
    assertThat(drawer).not().isVisible();
    assertThat(ledgerDetails).isFocused();
    page.getByTestId("transaction-details").click();
    assertThat(drawer).isVisible();
    page.getByTestId("details-close").click();
    assertThat(drawer).not().isVisible();
  }

  @Test
  void mobileNavigationContainsKeyboardFocusAndRestoresItsTrigger() {
    page.setViewportSize(390, 844);
    Locator menu = page.getByTestId("mobile-menu");
    menu.focus();
    page.keyboard().press("Enter");
    Locator dialog = page.getByTestId("nav-dialog");
    assertThat(dialog).isVisible();
    assertTrue((Boolean) dialog.evaluate("dialog => dialog.contains(document.activeElement)"));
    Locator controls = dialog.locator("button:not([disabled]),a[href]");
    controls.last().focus();
    page.keyboard().press("Tab");
    assertTrue(
        (Boolean) dialog.evaluate("dialog => dialog.contains(document.activeElement)"),
        "Forward Tab must remain inside the modal navigation");
    controls.first().focus();
    page.keyboard().press("Shift+Tab");
    assertTrue(
        (Boolean) dialog.evaluate("dialog => dialog.contains(document.activeElement)"),
        "Reverse Tab must remain inside the modal navigation");
    page.keyboard().press("Escape");
    assertThat(dialog).not().isVisible();
    assertThat(menu).isFocused();
    menu.click();
    dialog.locator("a[href='#lab']").click();
    assertThat(dialog).not().isVisible();
    assertThat(page).hasURL(Pattern.compile(".*#lab$"));
    Locator labLinks = page.locator("nav a[href='#lab']");
    assertTrue(labLinks.count() > 0);
    for (Locator link : labLinks.all()) assertThat(link).hasAttribute("aria-current", "location");
    assertNoHorizontalPageOverflow();
  }

  @Test
  void activeNavigationFollowsHashAndManualScrolling() {
    page.locator("nav a[href='#api']:visible").click();
    assertThat(page).hasURL(Pattern.compile(".*#api$"));
    assertThat(page.locator("nav a[href='#api']:visible")).hasAttribute("aria-current", "location");
    page.locator("#architecture")
        .evaluate(
            "section => window.scrollTo({top:section.getBoundingClientRect().top + scrollY - 120,behavior:'instant'})");
    assertThat(page.locator("nav a[href='#architecture']:visible"))
        .hasAttribute("aria-current", "location");
  }

  @Test
  void mobileAndTwoHundredPercentReflowKeepPrimaryControlsUsable() {
    for (int width : List.of(390, 720)) {
      page.setViewportSize(width, width == 390 ? 844 : 1000);
      assertNoHorizontalPageOverflow();
      page.getByTestId("start-sandbox").click();
      assertThat(page.getByTestId("outstanding")).hasText("$250.00");
      page.getByTestId("amount").fill("10.00");
      page.getByTestId("submit-transaction").click();
      assertThat(page.getByTestId("outstanding")).hasText("$240.00");
      assertThat(page.getByTestId("ledger-details")).hasCount(1);
      page.getByTestId("ledger-details").click();
      assertThat(page.getByTestId("transaction-drawer")).isVisible();
      assertNoHorizontalPageOverflow();
      page.getByTestId("details-close").click();
    }
  }

  @Test
  void cssTwoHundredPercentZoomKeepsPostingAndDetailsUsable() {
    page.setViewportSize(1440, 1000);
    page.evaluate("() => { document.documentElement.style.zoom = '2'; }");
    try {
      assertEquals("2", page.evaluate("() => getComputedStyle(document.documentElement).zoom"));
      assertNoHorizontalPageOverflow();
      assertTrue(
          (Boolean)
              page.evaluate("() => document.body.getBoundingClientRect().right <= innerWidth + 1"),
          "The scaled body must remain inside the physical viewport");
      startAccount();
      page.getByTestId("amount").fill("10.00");
      page.getByTestId("submit-transaction").click();
      assertThat(page.getByTestId("outstanding")).hasText("$240.00");
      page.getByTestId("ledger-details").click();
      assertThat(page.getByTestId("transaction-drawer")).isVisible();
      assertThat(page.getByTestId("transaction-drawer")).containsText("10.00");
      assertNoHorizontalPageOverflow();
      page.getByTestId("details-close").click();
    } finally {
      page.evaluate("() => { document.documentElement.style.zoom = ''; }");
    }
  }

  @Test
  void reducedMotionDisablesSmoothScrollAndAnimatedTransitions() {
    page.emulateMedia(new Page.EmulateMediaOptions().setReducedMotion(ReducedMotion.REDUCE));
    assertTrue(
        (Boolean) page.evaluate("() => matchMedia('(prefers-reduced-motion: reduce)').matches"));
    assertEquals(
        "auto", page.evaluate("() => getComputedStyle(document.documentElement).scrollBehavior"));
    List<?> moving =
        (List<?>)
            page.evaluate(
                "() => [...document.querySelectorAll('body *')]"
                    + ".filter(el => {const s=getComputedStyle(el);return "
                    + "s.animationName!=='none'||s.transitionDuration.split(',').some(t=>parseFloat(t)>0.001)})"
                    + ".map(el=>el.tagName+'.'+el.className)");
    assertTrue(
        moving.isEmpty(), "Reduced motion must suppress workspace animations and transitions");
    page.locator("nav a[href='#simulator']:visible").click();
    assertThat(page.getByTestId("start-sandbox")).isVisible();
  }

  void assertNoHorizontalPageOverflow() {
    assertTrue(
        (Boolean)
            page.evaluate(
                "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"),
        "The document must fit the available viewport at mobile width, reflow width and CSS zoom");
  }

  void assertSessionValuesAreAbsentFromPage() {
    String visible = page.locator("body").innerText();
    for (String secret : TraceRedactor.sessionSecrets(context.cookies())) {
      assertFalse(
          visible.contains(secret), "Session cookie values must never appear in workspace text");
    }
  }

  @AfterEach
  void captureAndClose(TestInfo info) throws Exception {
    Path folder = Path.of("target", "ui-artifacts");
    Files.createDirectories(folder);
    String name = "workspace-" + info.getTestMethod().orElseThrow().getName();
    if (info.getDisplayName().startsWith("lab "))
      name += "-" + info.getDisplayName().split("[,)]")[0].replaceAll("[^a-zA-Z0-9-]", "-");
    try {
      if (page != null)
        page.screenshot(
            new Page.ScreenshotOptions().setPath(folder.resolve(name + ".png")).setFullPage(true));
      if (context != null) {
        Path raw = folder.resolve(name + "-raw.zip");
        try {
          List<String> secrets = TraceRedactor.sessionSecrets(context.cookies());
          context.tracing().stop(new Tracing.StopOptions().setPath(raw));
          TraceRedactor.redact(raw, folder.resolve(name + ".zip"), secrets);
        } finally {
          Files.deleteIfExists(raw);
        }
      }
    } finally {
      if (context != null) context.close();
      if (browser != null) browser.close();
      if (playwright != null) playwright.close();
    }
  }
}
