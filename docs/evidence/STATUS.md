# Execution evidence — engineering finish

## Current provider pilot — 2026-10-15

**DEPLOYED / VERIFIED** at https://creditflow-qe-pilot.vercel.app. [The cloud release record](provider-pilot.md) identifies API commit 20c91f5 and frontend commit b3209d3, exact provider deployment IDs, 24 hosted API checks, the 14.8-second true cold start, restart persistence, and the 11-test successful hosted UI/Spotless run. Both jobs passed in [Actions 38680627735](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38680627735); all 174 downloaded report/log hashes matched.

DNS and existing portfolio changes remain unapplied. Jenkins server execution and sustained-load/SLA claims remain unverified. The historical engineering finish below retains its original provenance; its pre-deployment statements describe that earlier point in time.

## Historical engineering finish

The required [GitHub Actions run #2](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38665882283) passed completely for implementation commit [`b688e172c86c6e9cb711da79a39244636d62615c`](https://github.com/farhan-shafee/creditflow-qe/commit/b688e172c86c6e9cb711da79a39244636d62615c). Both [core](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38665882283/job/116197623096) and [browser](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38665882283/job/116197623278) jobs succeeded. The same engineering finish passed locally on 2026-10-14 (America/New_York), using project Java21/Maven3.9.11 containers, actual PostgreSQL and local Java browser drivers.

## Verified implementation and CI provenance

These links pin one verified implementation, rather than claiming every future branch revision passes. See [PR #1](https://github.com/farhan-shafee/creditflow-qe/pull/1) for later commits and their required checks.

Actions checked out PR merge HEAD `f5ac0de593608ad064c7e61b3142f09b4fef0a4f`, combining the implementation head above with base `6846890eff4e889513799576aab7aa14aacd9d3b`. All five manifests retain that executed HEAD, PR head, run ID and the same source fingerprint `de3e6d94d2f23b5440b5f5a92b91afe1f0fde71586ebcea5c910d1010bbb4955`. Job logs span 2026-10-15 01:29:03–01:32:36 UTC. The downloaded artifacts were inspected independently of the mutable module targets; command exits, report/log hashes and actual report counts were checked.

| Scope | Successful Actions evidence run |
|---|---|
| Core | `20261015T012910Z-1f65da3fd59f402a940e825312db5c10` |
| Public | `20261015T013131Z-0027e1e6b1fc47d29dd3520a1cbaaa92` |
| Web | `20261015T012905Z-acbe849a394d4d2a8fe50dd81b03833f` |
| Browser/Bruno | `20261015T012927Z-989c44ef00f3484faebe33036b9a23d0` |
| Quality | `20261015T013200Z-bbb2372bb9eb4d60b997665574a2352c` |

The run contains artifacts `creditflow-core-f5ac0de593608ad064c7e61b3142f09b4fef0a4f` (ID11941435027) and `creditflow-browser-f5ac0de593608ad064c7e61b3142f09b4fef0a4f` (ID11940877035). GitHub retention expires on 2026-10-29; the downloaded evidence remains in this checkout's ignored `.work/ci-finish-38665882283/`. Artifact downloads require repository access. The checked-in record retains provenance and counts after hosted artifacts expire.

## Results reproduced locally and in Actions

| Gate | Actual result |
|---|---|
| Application unit tests | 31 passed; zero failures/errors/skips |
| PostgreSQL/HTTP integration | 18 passed; includes healthy and database-unavailable public probes |
| Independent Cucumber, private API | 31 scenarios / 154 steps passed |
| Independent Cucumber, isolated public API | 31 scenarios / 154 steps passed |
| Separate TestNG | 6 private + 6 public cases passed |
| Java UI / BFF / trace tests | 11 passed: 2 Selenium, 4 Playwright, 4 BFF, 1 redaction |
| Browser artifacts | 6 screenshots and 4 redacted traces retained |
| Frontend | 5 passed; Next.js build and TypeScript passed |
| Bruno 4.2.1 | 7 requests and 11 checks passed |
| Evidence-framework behavior tests | 32 passed, including real stale-report and Windows encoding regressions |
| Spotless / SpotBugs | All checks passed; 0 SpotBugs defects/errors |
| Dependency checks | Complete 209-component Maven/UI/test inventory; OSV 0 affected; full npm audit 0 vulnerabilities |
| Gitleaks | 0 source findings; redacted JSON retained |
| Configuration | Private/public Compose validation passed; Jenkins Groovy AST parsed |
| Runtime-role SQL | Real local grants/probes passed inside a bounded transaction, then rolled back |

JaCoCo measured **222/239 lines** and **101/119 branches**. These are generated test measurements, not production-readiness or security-certification claims.

`python infrastructure/verify-evidence.py --all` returned exit0 after all five fresh scopes. The actual command result and working-tree state are retained in ignored `.work/final-local-validation.json`. Each scope has its own immutable sanitized manifest/logs/reports under `.work/evidence/runs/`, and the shared working targets are not counted across scopes.

Local execution was pre-commit: HEAD `44727ba121a8996d0ae8e2cb2f81b4c7355eb541` plus the engineering corrections. The manifest source fingerprint, not that old commit alone, identifies the tested working tree: `b5227b5b8abeb7ac0b67134a1edbd667d646017bd20051bdecb62b3cf49033b4`. The committed-source proof is the successful Actions run above; local and Linux checkout fingerprints need not match because documentation changed before commit and Git normalizes line endings.

| Scope | Actual successful local run |
|---|---|
| Core | `20261015T010924Z-d2e4bf634dee4a5b9f1fccf91bd23e75` |
| Public | `20261015T011458Z-4645a567a5004117b830d5ef9d2bf0b8` |
| Web | `20261015T010659Z-7fcd26684dbd47a6868c338458097d0b` |
| Browser/Bruno | `20261015T011815Z-822dcd6420984c63be4d8e1f51e1f6ed` |
| Quality | `20261015T012242Z-4941d6e3644d473db8b32729830d6ca6` |

## Defects demonstrated and corrected

The [first Actions run](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38652624557) passed core application tests and its browser job but failed host CycloneDX generation. A controlled Linux reproduction retained `java.nio.file.AccessDeniedException: /tmp/creditflow-qe-bom-ownership/target/bom.json`: runner UID 1001 could not create the file inside Docker-created root:root directories with mode 0755. Running the complete `-Pui`/test-scope goal through the Compose Maven service succeeded. Actions and Jenkins now use that shared command; inventory and advisory checks remain required.

The original uncommitted public-health regression was preserved before edits, observed failing, and completed. Public liveness is independent of PostgreSQL; aggregate/readiness probes require the server key in public mode. Healthy readiness returns 200; an isolated unavailable PostgreSQL fixture returns 503 while liveness remains200. Pool minimum idle 0, disabled keepalive and bounded idle retirement permit idle connections to drain.

Independent public-mode automation uses its own API/database and private environment-only server key, with suitable test quotas. Cucumber verifies foreign-token reads/writes and independently reconciles paginated receipts against literal initial balance and signed postings. Playwright observes the first POST201 before losing delivery, checks unchanged retry identity and the replayed receipt, then reloads and proves one posting persisted. No public administrative or fault-injection endpoint was added.

The old evidence checker accepted stale passing reports without current execution. Its regression failed before repair. During full validation, a new checker defect rejected an actually passing frontend run because Windows decoded UTF-8 logs as CP1252. That failed manifest and all zero-exit command outputs remain preserved. Explicit UTF-8 reads and safe console output passed focused regressions, followed by fresh successful scopes. Prior successful app runs under an earlier runner fingerprint are historical evidence, not reused as fresh results.

## Scope and limitations

The committed baseline had 31 unit, 14 integration, 28 Cucumber scenarios/129 steps and 6 TestNG cases. Its reports remain archived separately; they are not the finish counts above. Prior targets and raw failure diagnostics are private under `.work/evidence/private/`; CI publishes only sanitized runs/latest pointers. Manifests retain timestamps, command exits, executed HEAD, PR head where available, source fingerprint and original/snapshot hashes. Failed, skipped, stale, partial or modified evidence is rejected.

Bruno emits upstream deprecation messages. Its `glob@10.5.0` is a patched version in the [maintainer's advisory](https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2), and [Bruno 4.2.1 is the current release](https://github.com/usebruno/bruno/releases/tag/v4.2.1). This does not claim a complete audit of external CLI/container toolchains. No warning was suppressed. Local Bruno used HTTP; public HTTPS verification remains a release gate.

Jenkins syntax parsing passed; **no Jenkins server execution occurred**. Cloud deployment, actual provider sleep/cold-start behavior, DNS and portfolio integration remain unverified and require separate approval. No cloud infrastructure, public deployment, DNS, portfolio edit, system Java installation or Browser Use/cloud browser occurred. See [readiness and cost review](../deployment-readiness.md).

This synthetic, AI-assisted portfolio project does not claim banking settlement, regulatory compliance or professional workplace achievement.
