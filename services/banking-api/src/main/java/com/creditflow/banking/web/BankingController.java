package com.creditflow.banking.web;

import com.creditflow.banking.domain.*;
import com.creditflow.banking.ledger.*;
import com.creditflow.banking.ledger.ApiModels.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class BankingController {
  private final LedgerService ledger;
  private final SandboxQuota quota;

  public BankingController(LedgerService ledger, SandboxQuota quota) {
    this.ledger = ledger;
    this.quota = quota;
  }

  @PostMapping("/sandboxes")
  public ResponseEntity<Sandbox> sandbox(HttpServletRequest request) {
    quota.acquire(request.getRemoteAddr());
    return ResponseEntity.status(201).body(ledger.createSandbox());
  }

  @GetMapping("/accounts/{id}")
  public Account account(
      @PathVariable UUID id,
      @RequestHeader(value = "Authorization", required = false) String auth) {
    return ledger.account(id, auth);
  }

  @GetMapping("/accounts/{id}/transactions")
  public History transactions(
      @PathVariable UUID id,
      @RequestHeader(value = "Authorization", required = false) String auth,
      @RequestParam(defaultValue = "9223372036854775807") long before,
      @RequestParam(defaultValue = "50") int limit) {
    return ledger.history(id, auth, before, limit);
  }

  @PostMapping("/accounts/{id}/{operation:payments|purchases}")
  public ResponseEntity<Entry> post(
      @PathVariable UUID id,
      @PathVariable String operation,
      @RequestHeader(value = "Authorization", required = false) String auth,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestBody Map<String, Object> body) {
    if (body.size() != 1 || !(body.get("amount") instanceof String raw))
      throw new DomainException(
          "INVALID_BODY", 400, "Body must contain only an amount decimal string");
    Posting result =
        ledger.post(
            id, auth, key, operation.equals("payments") ? "PAYMENT" : "PURCHASE", Money.parse(raw));
    return ResponseEntity.status(result.replayed() ? 200 : 201)
        .header("Idempotency-Replayed", Boolean.toString(result.replayed()))
        .body(result.entry());
  }
}
