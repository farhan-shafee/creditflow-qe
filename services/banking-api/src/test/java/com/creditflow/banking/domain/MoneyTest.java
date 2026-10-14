package com.creditflow.banking.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class MoneyTest {
  @ParameterizedTest
  @ValueSource(strings = {"0.01", "1", "1.2", "1000000.00"})
  void acceptsExactPositiveUsd(String value) {
    BigDecimal amount = Money.parse(value);
    assertEquals(2, amount.scale());
    assertEquals(0, new BigDecimal(value).compareTo(amount));
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(
      strings = {
        "0",
        "0.00",
        "-1",
        "1.001",
        "1e2",
        " 1",
        "1 ",
        ".50",
        "NaN",
        "1000000.01",
        "9999999999",
        "+1"
      })
  void rejectsNonCanonicalOrOutOfRangeAmounts(String value) {
    assertEquals(
        "INVALID_AMOUNT", assertThrows(DomainException.class, () -> Money.parse(value)).code());
  }
}
