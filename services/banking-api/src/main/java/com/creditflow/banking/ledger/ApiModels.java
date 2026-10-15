package com.creditflow.banking.ledger;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiModels {
  private ApiModels() {}

  public record Sandbox(UUID accountId, String token, Instant expiresAt) {}

  public record Account(
      UUID id,
      String currency,
      String creditLimit,
      String outstandingBalance,
      String availableCredit,
      Instant expiresAt) {}

  public record Entry(
      UUID id,
      long sequence,
      UUID accountId,
      String kind,
      String amount,
      String balanceAfter,
      String availableAfter,
      Instant postedAt) {}

  public record Posting(Entry entry, boolean replayed) {}

  public record History(List<Entry> entries, Long nextCursor) {
    public History {
      entries = List.copyOf(entries);
    }
  }

  public record ApiError(String code, String message, String requestId, Instant timestamp) {}
}
