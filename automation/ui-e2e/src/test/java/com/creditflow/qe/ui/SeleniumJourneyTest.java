package com.creditflow.qe.ui;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.nio.file.*;
import java.time.Duration;
import org.junit.jupiter.api.*;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;

class SeleniumJourneyTest {
  RemoteWebDriver browser;
  WebDriverWait wait;

  @BeforeEach
  void start() throws Exception {
    ChromeOptions options = new ChromeOptions();
    options.addArguments(
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1000");
    browser =
        new RemoteWebDriver(
            URI.create(
                    System.getenv()
                        .getOrDefault("CREDITFLOW_SELENIUM_URL", "http://localhost:4444"))
                .toURL(),
            options);
    wait = new WebDriverWait(browser, Duration.ofSeconds(20));
    browser.get(System.getenv().getOrDefault("CREDITFLOW_WEB_URL", "http://localhost:3100"));
    find("start-sandbox").click();
    wait.until(d -> find("outstanding").getText().equals("$250.00"));
  }

  WebElement find(String id) {
    return browser.findElement(By.cssSelector("[data-testid='" + id + "']"));
  }

  void pay(String amount) {
    WebElement field = find("amount");
    field.clear();
    field.sendKeys(amount);
    WebElement submit = find("submit-transaction");
    browser.executeScript(
        "arguments[0].scrollIntoView({block:'center',behavior:'instant'})", submit);
    wait.until(
        d ->
            Boolean.TRUE.equals(
                browser.executeScript(
                    "const e=arguments[0],r=e.getBoundingClientRect(); return !e.disabled && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));",
                    submit)));
    submit.click();
  }

  @Test
  void paymentUpdatesBalanceAndLedger() {
    pay("50.00");
    wait.until(d -> find("outstanding").getText().equals("$200.00"));
    assertEquals("$800.00", find("available").getText());
    assertEquals(1, browser.findElements(By.cssSelector("[data-testid='ledger-row']")).size());
    assertTrue(find("receipt").getText().contains("PAYMENT"));
  }

  @Test
  void overpaymentShowsErrorWithoutChangingBalance() {
    pay("300.00");
    wait.until(d -> find("error").getText().contains("OVERPAYMENT"));
    browser.navigate().refresh();
    wait.until(d -> find("outstanding").getText().equals("$250.00"));
    assertEquals("$250.00", find("outstanding").getText());
    assertTrue(browser.findElements(By.cssSelector("[data-testid='ledger-row']")).isEmpty());
  }

  @AfterEach
  void captureAndClose(TestInfo info) throws Exception {
    if (browser != null) {
      try {
        Path folder = Path.of("target", "ui-artifacts");
        Files.createDirectories(folder);
        Files.write(
            folder.resolve("selenium-" + info.getTestMethod().orElseThrow().getName() + ".png"),
            browser.getScreenshotAs(OutputType.BYTES));
      } finally {
        browser.quit();
      }
    }
  }
}
