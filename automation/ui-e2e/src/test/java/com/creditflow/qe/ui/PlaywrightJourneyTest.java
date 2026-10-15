package com.creditflow.qe.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

import com.microsoft.playwright.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.openqa.selenium.json.Json;

class PlaywrightJourneyTest {
  Playwright playwright;
  Browser browser;
  BrowserContext context;
  Page page;

  private record ObservedPost(Map<?, ?> intent, int status, String replayed, Map<?, ?> receipt) {}

  @BeforeEach
  void start() {
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
    page.navigate(System.getenv().getOrDefault("CREDITFLOW_WEB_URL", "http://localhost:3100"));
    page.getByTestId("start-sandbox").click();
    assertThat(page.getByTestId("outstanding")).hasText("$250.00");
  }

  @Test
  void paymentUpdatesBalanceAndLedger() {
    page.getByTestId("amount").fill("50.00");
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("available")).hasText("$800.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
  }

  @Test
  void overpaymentShowsErrorWithoutChangingBalance() {
    page.getByTestId("amount").fill("300.00");
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("error")).containsText("OVERPAYMENT");
    page.reload();
    assertThat(page.getByTestId("outstanding")).hasText("$250.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(0);
  }

  @Test
  void committedPaymentWithLostResponseRetriesTheSameIntent() {
    List<ObservedPost> posts = new ArrayList<>();
    Json json = new Json();
    page.route(
        "**/api/banking",
        route -> {
          if (!route.request().method().equals("POST")) {
            route.resume();
            return;
          }
          APIResponse response = route.fetch();
          try {
            posts.add(
                new ObservedPost(
                    json.toType(route.request().postData(), Map.class),
                    response.status(),
                    response.headers().get("idempotency-replayed"),
                    json.toType(response.text(), Map.class)));
            if (posts.size() == 1) route.abort();
            // Java fulfills asynchronously; copy the live body before finally disposes its handle.
            else
              route.fulfill(
                  new Route.FulfillOptions().setResponse(response).setBodyBytes(response.body()));
          } finally {
            response.dispose();
          }
        });
    page.getByTestId("operation").selectOption("payments");
    page.getByTestId("amount").fill("50.00");
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("retry-transaction")).isVisible();
    assertThat(page.getByTestId("amount")).isDisabled();
    assertEquals(1, posts.size(), "Exactly one POST must precede the transport loss");
    ObservedPost committed = posts.getFirst();
    assertEquals(201, committed.status(), "The first POST must commit before delivery is lost");
    assertEquals("false", committed.replayed(), "The first POST must be a new posting");
    assertTrue(
        committed.receipt().get("id") instanceof String id && !id.isBlank(),
        "The committed posting must have a receipt identity");

    page.getByTestId("retry-transaction").click();
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("available")).hasText("$800.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
    assertEquals(2, posts.size(), "The journey must issue exactly the original POST and its retry");
    ObservedPost replay = posts.get(1);
    for (String field : List.of("operation", "amount", "key")) {
      assertTrue(
          committed.intent().get(field) instanceof String value
              && value.equals(replay.intent().get(field)),
          "Retry must preserve the original " + field);
    }
    assertEquals(200, replay.status(), "The retry must return the existing posting");
    assertEquals("true", replay.replayed(), "The retry must be identified as a replay");
    assertEquals(
        committed.receipt().get("id"),
        replay.receipt().get("id"),
        "The retry must return the first committed receipt");

    Response refreshed =
        page.waitForResponse(
            response ->
                response.request().method().equals("GET")
                    && response.url().endsWith("/api/banking"),
            () -> page.reload());
    assertEquals(200, refreshed.status(), "Reload must retrieve the persisted account and ledger");
    Map<?, ?> snapshot = json.toType(refreshed.text(), Map.class);
    Map<?, ?> account = assertInstanceOf(Map.class, snapshot.get("account"));
    assertEquals("200.00", account.get("outstandingBalance"));
    assertEquals("800.00", account.get("availableCredit"));
    Map<?, ?> history = assertInstanceOf(Map.class, snapshot.get("history"));
    List<?> entries = assertInstanceOf(List.class, history.get("entries"));
    assertEquals(1, entries.size(), "Transport retry must leave exactly one persisted posting");
    Map<?, ?> entry = assertInstanceOf(Map.class, entries.getFirst());
    assertEquals(committed.receipt().get("id"), entry.get("id"));
    assertEquals("PAYMENT", entry.get("kind"));
    assertEquals("50.00", entry.get("amount"));
    assertEquals("200.00", entry.get("balanceAfter"));
    assertEquals("800.00", entry.get("availableAfter"));
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("available")).hasText("$800.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
    assertEquals(2, posts.size(), "Reload must not submit another posting");
  }

  @Test
  void failedRefreshBlocksNewTransactionsUntilStateIsReconciled() {
    java.util.concurrent.atomic.AtomicBoolean posted =
        new java.util.concurrent.atomic.AtomicBoolean();
    java.util.concurrent.atomic.AtomicBoolean lost =
        new java.util.concurrent.atomic.AtomicBoolean();
    page.route(
        "**/api/banking",
        route -> {
          if (route.request().method().equals("POST")) {
            posted.set(true);
            route.resume();
          } else if (posted.get() && lost.compareAndSet(false, true)) route.abort();
          else route.resume();
        });
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("refresh-account")).isVisible();
    assertThat(page.getByTestId("submit-transaction")).isDisabled();
    page.getByTestId("refresh-account").click();
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
    assertThat(page.getByTestId("submit-transaction")).isEnabled();
  }

  @AfterEach
  void captureAndClose(TestInfo info) throws Exception {
    Path folder = Path.of("target", "ui-artifacts");
    Files.createDirectories(folder);
    String name = "playwright-" + info.getTestMethod().orElseThrow().getName();
    try {
      if (page != null)
        page.screenshot(
            new Page.ScreenshotOptions().setPath(folder.resolve(name + ".png")).setFullPage(true));
      if (context != null) {
        Path raw = folder.resolve(name + "-raw.zip");
        try {
          var secrets =
              context.cookies().stream()
                  .filter(c -> c.name.equals("creditflow_session"))
                  .map(c -> c.value)
                  .toList();
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
