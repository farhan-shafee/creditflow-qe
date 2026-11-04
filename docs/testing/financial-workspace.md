# Financial workspace verification

The [design brief](../design/financial-workspace.md) defines the visual direction and boundaries. The [approved-release checklist](../design/financial-workspace-release.md) is a plan for separate approval, not evidence of deployment.

## Behavioral ownership

- `apps/web/lib/banking.ts`: exact integer-cent helpers, strict account/receipt parsing and allowlisted HTTP observation. Status and browser-measured round trip are facts; a readable success response alone is not financial confirmation.
- `transaction-decision.ts` / `simulator-state.ts`: confirm the saved account, operation, exact amount and replay/status contract before releasing a new intent. Unknown responses retain identity; confirmed postings with failed reads refresh only. Expiry and cookie replacement cannot retarget an old intent.
- `pending-storage.ts`: bounded versioned tab-scoped recovery state contains only synthetic account/intent identity and acknowledgement. No session cookie, bearer token, provision key or signing secret is stored. Storage problems block financial POSTs; a new account must be explicitly confirmed before clearing an uncertain recovery barrier.
- `correctness-lab.ts`: each demo establishes a fresh separate account, literal opening state and empty history before sequential postings. It verifies actual statuses, complete receipt identity, exact balances and the complete persisted ledger. A normal invocation uses at most five browser requests; manual recovery is explicit and never an automatic loop. Quotas, expiry and interruptions are inconclusive operational outcomes.
- `app/api/lab/*`: reuse the server-only backend and protections with a separate signed HttpOnly `/api/lab` cookie. The lab account header must match that cookie. General simulator requests also bind their expected account before forwarding. These are bounded application routes, not administrative/fault-injection endpoints.
- `evidence.ts` / `data/evidence.json`: strict read-only snapshot, request-time freshness and pinned provenance. Recorded deployments, latest artifact-verified main CI and historical baselines are different claims. No per-visitor provider/GitHub polling occurs.

## Executable checks

Frontend Node tests exercise exact cents, sanitization, unavailable/malformed evidence, actual lab runner decisions, ambiguous responses, account changes and recovery persistence. Java `WorkspaceJourneyTest` uses the existing local Playwright server and real BFF/API/PostgreSQL responses. Its local delivery-loss fixtures first let the real POST commit, then interrupt the browser response; successful recovery must reuse the same complete intent and leave one ledger entry. Real cross-tab, expiry, creation-read and foreign-receipt cases preserve authoritative state.

Existing independent Java/Cucumber/REST Assured, TestNG, Selenium, Bruno, Spring/PostgreSQL, formatting/static/security and source-bound evidence gates remain required. `TraceRedactorTest` checks both session cookies and compact multi-record trace serialization. The evidence gate requires the expanded frontend count and the new workspace suite rather than accepting an old passing five-test log. Failed/skipped suites and stale producer timestamps remain rejected.

After the quality scope prepares the pinned scanner image, `node --test infrastructure/test-gitleaks-config.cjs` exercises it with generated, ignored fixtures. The recorded public API commit triggered two `generic-api-key` false positives. The exception applies only to that exact public SHA, that rule and the two evidence locations together; other values, other locations and credentials on the same line must still be detected. A future API revision requires fresh provenance review rather than a blanket hash exception. CI retains metadata-only receipts; generated inputs stay private.

Run the [repository verification commands](../../README.md#run-the-working-system) sequentially after freezing source. The final feature PR records the actual final counts, exact commit, complete Actions run, original command exits and source-bound artifact audit. A documentation/configuration change is not execution evidence, and a green feature commit is not production verification.

## Actual visual captures

The [capture index](../design/financial-workspace-screenshots/capture-index.json) hashes the exact committed PNGs and records capture geometry/status. These are actual local browser renders, not mockups or generated images.

| View | Before | After |
|---|---|---|
| Desktop, 1440 × 1000 | [Baseline](../design/financial-workspace-screenshots/before-desktop.png) | [Workspace](../design/financial-workspace-screenshots/after-desktop.png) |
| Mobile, 390 × 844 | [Baseline](../design/financial-workspace-screenshots/before-mobile.png) | [Workspace](../design/financial-workspace-screenshots/after-mobile.png) |

Additional inspected renders: [tablet](../design/financial-workspace-screenshots/after-tablet.png), [posted simulator](../design/financial-workspace-screenshots/after-desktop-simulator.png), [receipt drawer](../design/financial-workspace-screenshots/after-desktop-details.png), [real replay proof](../design/financial-workspace-screenshots/after-desktop-lab.png), [mobile navigation](../design/financial-workspace-screenshots/after-mobile-navigation.png), [rendered 200% CSS zoom](../design/financial-workspace-screenshots/after-desktop-css-zoom-200.png).

The refreshed after captures use the local frontend image validated by the complete 37-case browser run. The index records that image, WIP HEAD and source fingerprint rather than claiming a deployed or future committed revision. The [desktop evidence](../design/financial-workspace-screenshots/after-desktop-evidence.png), [mobile evidence](../design/financial-workspace-screenshots/after-mobile-evidence.png), [desktop architecture](../design/financial-workspace-screenshots/after-desktop-architecture.png) and [mobile architecture](../design/financial-workspace-screenshots/after-mobile-architecture.png) renders include the final neutral record badges and compact mobile stack.

Separate ignored captures cover actual loading/empty/422 error states, API/automation/evidence/architecture/walkthrough sections, keyboard focus and reduced motion. The accepted three-device capture recorded navigation 200, no page errors/request failures and contained document widths. Java tests also exercise 720px reflow and rendered CSS zoom at 200%; native Chrome toolbar zoom was not manipulated. Reduced motion reported zero animated elements and automatic scrolling. These checks do not establish complete accessibility conformance.

## Preserved failures and limits

The initial real 35-case UI run executed 30 passes / 5 failures / 0 errors / 0 skips. It exposed compact-NDJSON serialization, a Java-only regex flag reaching JavaScript, hidden-table-heading overflow at mobile/zoom and native Tab traversal reaching browser chrome. Strong assertions were retained; serialization, test regex transport, the table containing block and explicit modal focus wrapping were corrected. The unchanged 35-case retry passed, with 7 Bruno requests / 11 checks. The final suite adds reload/recovery-barrier cases; final counts belong to the PR's later frozen run.

The first 37-case run had 36 passes / 1 failure / 0 errors / 0 skips: an old assertion prohibited explicit replacement-account creation during recovery. The corrected case retains financial locks and adds a persisted-barrier check, a held real reconciliation GET, exact replacement identity and one permitted posting only after reconciliation. Both focused execution and the subsequent complete 37-case run passed. The first quality run retained the two public-commit false positives described above; it reported 205 resolved Maven components and zero OSV-affected components before stopping at the scanner.

The [first feature CI run](https://github.com/farhan-shafee/creditflow-qe/actions/runs/41859734013) passed the complete core job but recorded 36/37 UI passes, with no errors or skips. The retained network trace shows the correct conflict flow: POST 201 at `15:40:47.493Z`, POST 409 at `15:40:47.529Z`, then GET 200. Reading response bodies inside Java's response callback pumped nested events and reversed its collected status list. The regression deliberately exercises this reentrancy during the real conflict flow. The observer records response handles before any blocking call and materializes bodies after the flow; ordered status, ownership, exact balance and complete-ledger assertions remain required.

Earlier real captures also exposed unavailable `randomUUID` on the local HTTP container origin and empty-body creation streams. Secure `getRandomValues` identity and creation-only empty-body support fixed those issues without relaxing transaction validation. A Maven Central HTTP 502 stopped a separate retry before tests; an unchanged-command retry recovered. All original capture attempts, unit RED/GREEN logs and immutable failed manifests remain under ignored `.work/workspace-design-20261104/` and `.work/evidence/runs/`.

The current production source/provider state was not queried or changed. Saved deployment identities remain dated records. The lab does not run Cucumber, CI, load tests or production-capacity measurements. Copying uses the secure browser clipboard API with a selection instruction if unavailable. Synthetic sessions still expire and existing server limits may stop a run. No new system software, cloud resources, DNS, portfolio changes, dependency framework or release occurred.
