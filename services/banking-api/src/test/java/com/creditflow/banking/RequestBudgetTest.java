package com.creditflow.banking;

import static org.junit.jupiter.api.Assertions.*;

import com.creditflow.banking.web.RequestBudget;
import java.time.*;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class RequestBudgetTest {
  @Test
  void limitsEachSourceAndRestoresAllowanceInNextWindow() {
    AtomicLong millis = new AtomicLong(0);
    Clock clock =
        new Clock() {
          public ZoneId getZone() {
            return ZoneOffset.UTC;
          }

          public Clock withZone(ZoneId zone) {
            return this;
          }

          public Instant instant() {
            return Instant.ofEpochMilli(millis.get());
          }
        };
    RequestBudget budget = new RequestBudget(2, Duration.ofMinutes(1), clock);
    assertTrue(budget.acquire("a"));
    assertTrue(budget.acquire("a"));
    assertFalse(budget.acquire("a"));
    assertTrue(budget.acquire("b"));
    millis.set(60000);
    assertTrue(budget.acquire("a"));
  }

  @Test
  void boundsDistinctSourceMemoryWithoutBlockingKnownSources() {
    RequestBudget budget =
        new RequestBudget(2, Duration.ofMinutes(1), Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
    for (int i = 0; i < 10000; i++) assertTrue(budget.acquire("source-" + i));
    assertFalse(budget.acquire("new-source"));
    assertTrue(budget.acquire("source-0"));
  }

  @Test
  void invalidLimitsFailClosed() {
    assertThrows(
        IllegalArgumentException.class,
        () -> new RequestBudget(0, Duration.ofMinutes(1), Clock.systemUTC()));
    assertThrows(
        IllegalArgumentException.class,
        () -> new RequestBudget(1, Duration.ZERO, Clock.systemUTC()));
  }
}
