package com.creditflow.banking.web;

import com.creditflow.banking.domain.DomainException;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Enforced by the mapped creation handler so path aliases cannot bypass it. */
@Component
public final class SandboxQuota {
  private final RequestBudget budget;

  public SandboxQuota(@Value("${creditflow.sandbox-quota:20}") int quota) {
    budget = new RequestBudget(quota, Duration.ofHours(1), Clock.systemUTC());
  }

  public void acquire(String source) {
    if (!budget.acquire(source))
      throw new DomainException("RATE_LIMITED", 429, "Sandbox creation limit reached; try later");
  }
}
