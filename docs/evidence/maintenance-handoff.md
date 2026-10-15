# Verification and maintenance receipt — 2026-10-15

Follow-up: [PR #4 stack guard correction and fresh results](pr4-stack-guard.md). The counts and indexed receipts below remain evidence of the original maintenance implementation.

**TESTED / DOCUMENTED. No deployment or portfolio edit.** This follow-up starts from CreditFlow main `51a2affe38a733f350390fafd59b885b74823b42` and portfolio main `7cf155efa7ec7567a3aa7c2baa031722e971a915`. Both expected PRs are merged; neither remote main had a newer commit at the initial read-only check. Work is on `codex/maintenance-handoff` in the existing CreditFlow checkout.

[Operator, dependency and interview handoff](../maintenance-handoff.md) · [Sanitized JSON receipts and byte hashes](maintenance-20261015/receipt-index.json). These are pre-commit working-tree executions with their own HEAD/diff/file hashes; final committed-source CI belongs to the new PR's checks. Historical failures/releases/Jenkins results were inspected and preserved rather than rerun or overwritten.

## Confirmed defect and justified gaps

The Windows checkout contained CRLF in all 30 tracked Java files, while Spotless required LF. A real run passed 31 unit and 11 PostgreSQL integration tests, then failed formatting. The Git rule now explicitly sets Java to LF. Original working bytes were saved privately; each normalized file equals its existing HEAD blob, with no Java content change. A fresh `core.autocrlf=true` checkout verified all 30 files as LF. The complete focused gate and all-module formatting subsequently passed. [Correction and fresh-checkout receipts](maintenance-20261015/eol-correction.json).

The earlier bounded observation used an ignored, narrower harness. A versioned local-only harness now provides guard/invariant regressions, repeatable mixed contention and immutable safe outputs. During development, a schedule test caught 16 in-flight calls against the intended limit 12; two-request rejection batches repaired it. Independent review also required exact Compose-config ownership, now enforced and regression-tested. Both failures preceded real HTTP execution and remain [preserved](maintenance-20261015/harness-development.json). These were harness-development defects, not discovered financial API defects.

Interview material had six mixed drills and an inline answer. It now has exactly three exercises and separately linked complete reference solutions. Source/test links, a realistic demo preflight and nondeterministic scheduling caveats close the meaningful documentation gaps. AI-assistance disclosure and professional-experience boundaries remain explicit.

## Fresh local checks

| Check | Actual result |
|---|---|
| Harness guard/invariant regressions | 14 passed; 0 failures/cancellations/skips/todos |
| Bounded local PostgreSQL-backed workload | 253 HTTP requests; 4 new accounts; 12 completed account-round checkpoints |
| Financial outcomes | 48 postings, 36 original-receipt replays, 24 conflicts, 36 expected rejections; 0 transport failures |
| Maximum concurrency | 12 observed; 0 requests left active at completion |
| Current-source Java unit tests | 31 passed; 0 failures/errors/skips |
| Real PostgreSQL/HTTP `LedgerIT` | 11 passed, including insert-failure rollback, contention, retry/conflict and reconciliation |
| Spotless | Successful focused gate; all API/BDD/TestNG/UI modules clean in a separate format-only execution |
| SpotBugs | 0 bugs/errors in the successful focused run |
| Interview reference validation | All 3 Java blocks compiled; standalone Money example passed 13 input cases |
| Updated Jenkins definition | Groovy AST parsed; no new controller execution |
| Source secret scan | Gitleaks 8.30.1: 218 exported candidate files; 0 findings; exit 0 |

The [workload receipt](maintenance-20261015/bounded-workload.json) spans **21:32:13.442–21:32:17.448 UTC**, 4,006 ms including local metadata/setup. Latency over all **253 request samples**, including full body reading/JSON parsing and expected rejected requests, was **p50 8.650 ms, p95 39.801 ms, maximum 414.759 ms**. Percentiles use the nearest-rank sample. Native loopback HTTP used a fresh connection per request and no proxy/DNS target. This is one warm local functional observation, not a benchmark, production capacity result, long-term availability result or SLA.

Limits were four accounts, three rounds, three same-account contenders per phase, 12 global in-flight calls, 300 requests, 180 seconds total and ten seconds per request. Each round checks overspending contention, one posting/full receipt for identical retries, replay after later activity, changed amount/kind conflicts and unchanged state after invalid/overpayment rejection. Every paginated ledger is independently summed in integer cents from literal initial balance 250.00 and limit 1000.00, with chronological balance/available snapshots and receipt uniqueness checked.

Environment: Windows host, Node 26.12.0, Docker 29.8.2, API Java 21.0.12.1 and PostgreSQL 17.11. The API and PostgreSQL identities, Compose directory/configuration, healthy state and sole API loopback binding were verified before writes and again afterward. The running API image `sha256:c57004c5bc81a94ac6c7f2c38dfb8941d4d79f1efd348dafb78d503e18c3126e` lacks a verified embedded Git SHA. Its image ID identifies the observed runtime; current source hashes identify the harness, not that image's build revision. The focused integration fixture separately compiled current Java source.

The successful [focused Java run](maintenance-20261015/focused-java.json) is `20261015T213614Z-ef753c6d53b948719b9e28aeb57961de`; its frozen XML reports supply the 31/11 counts. Format-only run `20261015T213834Z-c3a11e8c064b44aead9d621143c81a51` contributes no test count. Do not count mutable module targets or either failed attempt as another successful test run. The Cucumber/LedgerIT practice additions were compiled but not executed as new scenarios/methods; the 13 Money cases are standalone examples, not 13 additional JUnit tests.

The first focused command failed before tests because an unquoted Maven property was split by PowerShell into `-Dit` and `.test=LedgerIT`. The corrected PowerShell example quotes `"-Dit.test=LedgerIT"`; the argument probe and retry are retained. The subsequent CRLF formatting failure and passing correction are separate. All original logs/report snapshots remain under ignored `.work/evidence/runs/focused/` and `.work/evidence/private/`.

The [secret-scan receipt](maintenance-20261015/security-validation.json) hashes the exact 218-file candidate export and scan outputs. Subsequent sanitized receipt/index updates are outside that snapshot; the new PR's required security job scans committed source independently.

## Dependency maintenance and current operations

No qualifying official lint-plugin replacement exists at this check: latest 16.4.2 still restores the affected chain. The portfolio patch, installed helper, 53 authenticated unchanged compiled files, 22 rules and clean lock graph passed fresh static inspection. Its earlier 63 unit/26 browser/21 focused regressions and audit results remain historical; portfolio scripts/install/tests were not rerun. [Exact upstream metadata, advisory and maintenance/removal criteria](maintenance-20261015/portfolio-dependency-audit.json).

[Railway/Neon readback](maintenance-20261015/provider-operations.json) confirmed the existing sleeping API deployment, one 0.5-vCPU/500,000,000-byte replica and idle Free Neon 0.25-CU endpoint. A six-hour retention setting is not a restore test. Two bounded unauthenticated page GETs returned HTTPS 200; they did not test banking, readiness, cold starts or deployed source identity. The initial sandbox network failure and successful authorized-network retry both remain recorded.

**Blocked:** current Vercel project/deployment/domain readback returned 404; current aliases/source/resource/spend-action settings remain unverified. Railway billing/workspace spending limits are not exposed by available tools. Vercel's monthly billing response exceeded 4 MiB and its successful daily aggregate did not provide target-project cost attribution. None of these observations implies zero cost or a configured dollar cap. **$15/month remains a planning allowance.** See the runbook for exact owner spending checks and rollback instructions; no provider setting, recovery action or monitor was changed.

## Remaining optional or separate work

- Restore project-scoped Vercel read access and inspect target billing/spending-control settings to close the specific blocked fields.
- Reassess official lint releases during separately approved portfolio maintenance; keep/rebase the local patch until every removal criterion passes.
- A new Jenkins controller run, database restore drill, sustained-load/cold-start study or production availability claim requires its own purpose and scope. The earlier executed Jenkins receipt remains historical proof at its pinned definition; it is not proof of the new Node-test stage.
- Any infrastructure, paid resource, system installation, public deployment/load test, DNS, portfolio edit, destructive action or force push requires separate approval. Browser Use/cloud browser still requires explicit permission.
