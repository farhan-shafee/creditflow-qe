package com.creditflow.qe.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import com.microsoft.playwright.*;
import java.nio.file.*;
import org.junit.jupiter.api.*;

class PlaywrightJourneyTest {
  Playwright playwright;
  Browser browser;
  BrowserContext context;
  Page page;

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
    java.util.concurrent.atomic.AtomicBoolean lost =
        new java.util.concurrent.atomic.AtomicBoolean();
    page.route(
        "**/api/banking",
        route -> {
          if (route.request().method().equals("POST") && lost.compareAndSet(false, true)) {
            route.fetch();
            route.abort();
          } else route.resume();
        });
    page.getByTestId("submit-transaction").click();
    assertThat(page.getByTestId("retry-transaction")).isVisible();
    assertThat(page.getByTestId("amount")).isDisabled();
    page.getByTestId("retry-transaction").click();
    assertThat(page.getByTestId("outstanding")).hasText("$200.00");
    assertThat(page.getByTestId("ledger-row")).hasCount(1);
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
