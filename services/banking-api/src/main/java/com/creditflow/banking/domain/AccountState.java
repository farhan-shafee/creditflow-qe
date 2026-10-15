package com.creditflow.banking.domain;

import java.math.BigDecimal;

public record AccountState(BigDecimal creditLimit, BigDecimal outstanding) {
  public AccountState {
    if (creditLimit == null
        || outstanding == null
        || creditLimit.signum() <= 0
        || outstanding.signum() < 0
        || outstanding.compareTo(creditLimit) > 0)
      throw new IllegalArgumentException("Invalid account state");
  }

  public BigDecimal available() {
    return creditLimit.subtract(outstanding);
  }

  public AccountState post(String kind, BigDecimal amount) {
    Money.parse(Money.format(amount));
    return switch (kind) {
      case "PURCHASE" -> {
        if (amount.compareTo(available()) > 0)
          throw new DomainException(
              "INSUFFICIENT_CREDIT", 422, "Purchase exceeds available credit");
        yield new AccountState(creditLimit, outstanding.add(amount));
      }
      case "PAYMENT" -> {
        if (amount.compareTo(outstanding) > 0)
          throw new DomainException("OVERPAYMENT", 422, "Payment exceeds outstanding balance");
        yield new AccountState(creditLimit, outstanding.subtract(amount));
      }
      default -> throw new IllegalArgumentException("Unknown operation");
    };
  }
}
