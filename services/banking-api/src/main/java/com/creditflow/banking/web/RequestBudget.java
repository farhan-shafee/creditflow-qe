package com.creditflow.banking.web;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/** Process-local fixed-window limiter; memory is bounded even for untrusted source addresses. */
public final class RequestBudget {
  private final int maximum;
  private final long windowMillis;
  private final Clock clock;
  private final Map<String, Window> sources = new HashMap<>();

  public RequestBudget(int maximum, Duration window, Clock clock) {
    if (maximum < 1 || window.toMillis() < 1)
      throw new IllegalArgumentException("Positive request limits required");
    this.maximum = maximum;
    this.windowMillis = window.toMillis();
    this.clock = clock;
  }

  public synchronized boolean acquire(String source) {
    long window = Math.floorDiv(clock.millis(), windowMillis);
    sources.entrySet().removeIf(e -> e.getValue().number() != window);
    Window previous = sources.get(source);
    if (previous == null && sources.size() >= 10000
        || previous != null && previous.count() >= maximum) return false;
    sources.put(source, new Window(window, previous == null ? 1 : previous.count() + 1));
    return true;
  }

  private record Window(long number, int count) {}
}
