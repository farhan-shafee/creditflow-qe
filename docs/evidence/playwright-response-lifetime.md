# Playwright response-lifetime correction — 2026-10-15

> **Historical deployment context** - This record retains its original milestone, source revisions, measured results and approval boundaries. Earlier hosting/source-visibility/pending-release statements are dated history. Use [the current production documentation](../railway-production.md) for the October 24-25 Railway topology, release state and remaining closeout.

The [portfolio integration](portfolio-integration.md) remains deployed and verified. The later CreditFlow documentation run [38784669890](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38784669890) failed one browser test on source f2533700d2467ea9ca8c17215adc351e014c4e93. Core, public API, quality and web-build checks passed. The failure is retained, not relabeled as success.

## Observed failure and cause

All 11 UI/BFF tests executed: 10 passed and the lost-response recovery journey failed after the original payment had committed. Bruno did not run because the preceding test command failed. The trace records Route.fulfill failing with “Fetch response has been disposed”; the UI correctly continued to display its last known balance instead of an unconfirmed update.

The official Playwright Java 1.63.0 RouteImpl implementation sends fulfillment asynchronously. The fixture immediately disposed the fetched APIResponse in finally, leaving a race while remote fulfillment still referenced its response handle. This is a test-fixture resource-lifetime defect; the trace does not demonstrate an application idempotency failure.

## Narrow correction and actual local checks

The fixture now gives fulfillment the body bytes read from the actual fetched response. It retains the response's real status and headers and disposes the APIResponse afterward. No canned response, sleep, assertion removal, retry-to-green or application change was added. Existing checks still prove original 201, replay 200, identical operation/amount/key/receipt, balances and exactly one persisted posting after reload.

The focused recovery journey passed, followed by all 11 Selenium/Playwright/BFF/redaction tests with zero failures/errors/skips. Both Maven executions and Spotless checks exited 0. An initial compile attempt used the string-body setter with a byte array and executed zero tests; its diagnostic is retained before the correct setBodyBytes API was applied.

[Sanitized diagnostic receipt](playwright-response-lifetime.json) records the original run/artifact IDs, protocol error, source/log/report hashes and exact local execution times. Original downloaded artifacts, failed trace and raw logs remain in ignored local storage. Fresh CI for the correction commit is tracked in [PR #2](https://github.com/farhan-shafee/creditflow-qe/pull/2); this pre-commit receipt does not claim that future run has passed. No cloud redeployment or portfolio change is needed for this test-only correction.
