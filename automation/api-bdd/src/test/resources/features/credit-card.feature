Feature: Synthetic credit-card ledger
  Each scenario receives a new owned USD account with 1000.00 limit and 250.00 outstanding.

  Scenario: Retrieve an owned account with a verified response contract
    When I retrieve my account
    Then the response status is 200
    And the account response matches its schema
    And the account has outstanding "250.00" and available "750.00"

  Scenario: Purchase and payment reconcile the ledger
    When I submit a purchases of "100.00" with key "purchase"
    Then the response status is 201
    And the receipt is a "PURCHASE" of "100.00" with outstanding "350.00" and available "650.00"
    When I submit a payments of "50.00" with key "payment"
    Then the response status is 201
    And the receipt is a "PAYMENT" of "50.00" with outstanding "300.00" and available "700.00"
    When I submit a purchases of "0.01" with key "fractional-purchase"
    Then the response status is 201
    And the receipt is a "PURCHASE" of "0.01" with outstanding "300.01" and available "699.99"
    And the account has outstanding "300.01" and available "699.99"
    And there are 3 ledger entries
    When I retrieve transactions
    Then the response status is 200
    And history is newest first
    And the complete transaction history reconciles with my account

  Scenario Outline: Invalid amount leaves financial state unchanged
    When I submit a payments of "<amount>" with key "invalid"
    Then the response status is 400
    And the error code is "INVALID_AMOUNT"
    And the account has outstanding "250.00" and available "750.00"
    And there are 0 ledger entries
    Examples:
      | amount     |
      | 0          |
      | -1         |
      | 1.001      |
      | 1e2        |
      | 1000000.01 |
      | NaN        |

  Scenario Outline: Business rule failures leave no ledger entry
    When I submit a <operation> of "<amount>" with key "rule"
    Then the response status is 422
    And the error code is "<code>"
    And there are 0 ledger entries
    And the account has outstanding "250.00" and available "750.00"
    Examples:
      | operation | amount | code                |
      | payments  | 250.01 | OVERPAYMENT         |
      | purchases | 750.01 | INSUFFICIENT_CREDIT |

  Scenario Outline: Exact valid boundaries post
    When I submit a <operation> of "<amount>" with key "boundary"
    Then the response status is 201
    And the account has outstanding "<outstanding>" and available "<available>"
    Examples:
      | operation | amount | outstanding | available |
      | payments  | 0.01   | 249.99      | 750.01    |
      | payments  | 250    | 0.00        | 1000.00   |
      | purchases | 750    | 1000.00     | 0.00      |

  Scenario: Replaying normalized payment after later activity returns the original receipt
    When I submit a payments of "10" with key "original"
    Then the response status is 201
    When I remember the receipt
    And I submit a purchases of "20" with key "later"
    Then the response status is 201
    When I submit a payments of "10.00" with key "original"
    Then the response status is 200
    And the receipt is the remembered receipt with balance "240.00"
    And the account has outstanding "260.00" and available "740.00"
    And there are 2 ledger entries
    And the complete transaction history reconciles with my account

  Scenario Outline: Conflicting idempotency key is rejected
    When I submit a payments of "10" with key "same"
    Then the response status is 201
    When I submit a <operation> of "<amount>" with key "same"
    Then the response status is 409
    And the error code is "IDEMPOTENCY_CONFLICT"
    And there are 1 ledger entries
    Examples:
      | operation | amount |
      | payments  | 11     |
      | purchases | 10     |

  Scenario: Missing authentication
    When I retrieve without authentication
    Then the response status is 401
    And the error code is "UNAUTHORIZED"

  Scenario: Invalid authentication
    When I retrieve with an invalid token
    Then the response status is 401
    And the error code is "UNAUTHORIZED"

  Scenario: Unknown account
    When I retrieve an unknown account
    Then the response status is 404
    And the error code is "ACCOUNT_NOT_FOUND"

  Scenario: Another visitor's synthetic account remains isolated
    When I retrieve another sandbox account
    Then the response status is 404
    And the error code is "ACCOUNT_NOT_FOUND"

  Scenario Outline: A foreign sandbox cannot mutate or read my ledger
    Given I have another sandbox account
    When I attempt a forbidden "<operation>" with the other sandbox token
    Then the response status is 404
    And the error code is "ACCOUNT_NOT_FOUND"
    And both sandbox accounts retain their original balances and empty histories
    Examples:
      | operation    |
      | payments     |
      | purchases    |
      | transactions |

  Scenario Outline: Malformed request contract
    When I submit raw payment body '<body>'
    Then the response status is 400
    And the error code is "INVALID_BODY"
    And there are 0 ledger entries
    Examples:
      | body                              |
      | {}                                |
      | {"amount":null}                   |
      | {"amount":1}                      |
      | {"amount":"1","unknown":true}     |
      | {broken                           |

  Scenario: Idempotency key is mandatory
    When I submit a payment without an idempotency key
    Then the response status is 400
    And the error code is "INVALID_IDEMPOTENCY_KEY"

  Scenario: Concurrent requests cannot overspend available credit
    When I submit 12 simultaneous purchases of "100"
    Then exactly 7 responses have status 201
    And exactly 5 responses have status 422
    And the account has outstanding "950.00" and available "50.00"
    And there are 7 ledger entries
    And the complete transaction history reconciles with my account

  Scenario: Concurrent duplicate requests post only once
    When I submit 8 simultaneous identical payments of "1"
    Then exactly 1 responses have status 201
    And exactly 7 responses have status 200
    And the account has outstanding "249.00" and available "751.00"
    And there are 1 ledger entries
    And all concurrent duplicate responses identify the same persisted receipt
    And the complete transaction history reconciles with my account
