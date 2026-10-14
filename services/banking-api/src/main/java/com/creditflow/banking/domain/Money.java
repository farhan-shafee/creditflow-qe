package com.creditflow.banking.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
  private static final BigDecimal MAX = new BigDecimal("1000000.00");

  private Money() {}

  public static BigDecimal parse(String raw) {
    if (raw == null || !raw.matches("[0-9]{1,9}(\\.[0-9]{1,2})?")) throw invalid();
    BigDecimal value = new BigDecimal(raw).setScale(2, RoundingMode.UNNECESSARY);
    if (value.signum() <= 0 || value.compareTo(MAX) > 0) throw invalid();
    return value;
  }

  public static String format(BigDecimal value) {
    return value.setScale(2, RoundingMode.UNNECESSARY).toPlainString();
  }

  private static DomainException invalid() {
    return new DomainException(
        "INVALID_AMOUNT",
        400,
        "Amount must be a positive USD decimal string with at most 2 fractional digits, no greater than 1000000.00");
  }
}
