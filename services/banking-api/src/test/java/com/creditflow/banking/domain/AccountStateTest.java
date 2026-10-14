package com.creditflow.banking.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class AccountStateTest {
  private final AccountState account =
      new AccountState(new BigDecimal("1000.00"), new BigDecimal("250.00"));

  @Test
  void purchaseReconciles() {
    AccountState updated = account.post("PURCHASE", Money.parse("100"));
    assertEquals(new BigDecimal("350.00"), updated.outstanding());
    assertEquals(new BigDecimal("650.00"), updated.available());
    assertEquals(new BigDecimal("250.00"), account.outstanding());
  }

  @Test
  void paymentReconciles() {
    AccountState updated = account.post("PAYMENT", Money.parse("50"));
    assertEquals(new BigDecimal("200.00"), updated.outstanding());
    assertEquals(new BigDecimal("800.00"), updated.available());
  }

  @Test
  void permitsExactCreditBoundary() {
    assertEquals(new BigDecimal("0.00"), account.post("PURCHASE", Money.parse("750")).available());
  }

  @Test
  void permitsExactPayoff() {
    assertEquals(new BigDecimal("0.00"), account.post("PAYMENT", Money.parse("250")).outstanding());
  }

  @Test
  void rejectsOverCredit() {
    assertEquals(
        "INSUFFICIENT_CREDIT",
        assertThrows(DomainException.class, () -> account.post("PURCHASE", Money.parse("750.01")))
            .code());
  }

  @Test
  void rejectsOverpayment() {
    assertEquals(
        "OVERPAYMENT",
        assertThrows(DomainException.class, () -> account.post("PAYMENT", Money.parse("250.01")))
            .code());
  }

  @Test
  void rejectsUnknownOperation() {
    assertThrows(IllegalArgumentException.class, () -> account.post("REFUND", Money.parse("1")));
  }

  @Test
  void enforcesStateInvariant() {
    assertThrows(
        IllegalArgumentException.class,
        () -> new AccountState(new BigDecimal("100"), new BigDecimal("101")));
  }

  @Test
  void rejectsNegativeOutstanding() {
    assertThrows(
        IllegalArgumentException.class,
        () -> new AccountState(new BigDecimal("100"), new BigDecimal("-1")));
  }
}
