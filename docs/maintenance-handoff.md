# CreditFlow QE verification and maintenance handoff

This maintenance pass starts from CreditFlow main `51a2affe38a733f350390fafd59b885b74823b42` and portfolio main `7cf155efa7ec7567a3aa7c2baa031722e971a915`. [CreditFlow PR #3](https://github.com/farhan-shafee/creditflow-qe/pull/3) and [portfolio PR #2](https://github.com/farhan-shafee/farhanshafee.com/pull/2) are confirmed merged. Neither remote main had a newer commit at the initial check. The portfolio checkout remains read-only.

The [dated maintenance receipt](evidence/maintenance-handoff.md) separates fresh checks from historical verification. Earlier failure, release and Jenkins records remain intact. No application defect has been confirmed in this pass. The justified changes address reproducible local workload evidence, operator instructions and separate interview exercises/answers.

## Portfolio lint patch: ongoing upkeep

As checked on 2026-10-15, the official latest Next, ESLint configuration and plugin are **16.4.2**. The [official plugin source](https://raw.githubusercontent.com/vercel/next.js/v16.4.2/packages/eslint-plugin-next/package.json) still uses `fast-glob@3.3.1`, which resolves through `micromatch@4.0.8` to `braces@3.0.3`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still lists the latter as affected with no patched version. All published stable plugin versions from 16.3.8 through 16.4.2 retain that chain. **No qualifying official replacement was found.** Merely removing the local override would restore the affected chain.

The portfolio deliberately retains Next/config 16.3.8 and local plugin `16.3.8-farhan.1` at `tooling/next-eslint-plugin`. Only directory discovery is patched, using pinned `glob@13.0.6` through `glob/raw` and `minimatch@10.2.6`. Fresh static inspection matched 53 unchanged upstream compiled files, all 22 upstream rules, the installed reviewed helper and one lockfile plugin instance; affected chain entries are absent. The earlier 63 unit tests, 21 focused lint regressions, 26 browser tests and zero-finding audits are [historical execution evidence](evidence/portfolio-lint-remediation.md), not fresh executions in this pass.

For a separately approved portfolio dependency change:

1. Inspect the matching official plugin/configuration release and its resolved graph. Rebase only the reviewed helper change when upgrading the Next lint stack; preserve authenticated upstream-file hashes and review effective configuration/rule changes intentionally.
2. Run the existing 21 regression behaviors: roots supplied as literals, arrays, relative/absolute paths, symlinks and hidden directories; globstars/braces/bracket-containing checkouts; missing/empty inputs, singleton classes and bounded nesting; actual `no-html-link-for-pages` violations.
3. Perform a clean install, verify the installed plugin resolution and graph, then run full unit/browser suites, ESLint, build, Next type generation, TypeScript, formatting, both dependency audits and normal CI/artifact gates. Never update expected hashes just to accept an unexplained upstream change.
4. Remove the local package/override only after an official release eliminates the affected chain, resolves as the actual installed plugin, preserves required lint behavior/configuration and passes those checks. Patch removal and a portfolio upgrade remain separate authorized work; neither happened here.

## Bounded local verification

The [PR #4 guard correction](evidence/pr4-stack-guard.md) supersedes the earlier metadata-only preflight. It preserves POSIX case and requires local Docker, canonical configured/PID1 datasource settings, owned network/DNS targets and a live JVM-socket/PostgreSQL-session match before any POST. Raw configuration and credentials never enter evidence. Unsupported overrides/targets are refused; this is a current observation under trusted local Docker/images, not image-source attestation or protection against concurrent external reconfiguration.

The previous [204-request observation](evidence/bounded-reliability.json) remains historical. Its ignored harness and narrower traffic did not provide a maintained mixed-contention regression. The versioned [bounded harness](../infrastructure/bounded-reliability.cjs) runs only against the identified local Compose API/PostgreSQL stack at `http://127.0.0.1:18081`. It rejects foreign/public targets and redirects, verifies container ownership/health/binding, and refuses overlap with an active project verification scope.

This pass also reproduced a Windows checkout defect: all 30 tracked Java files had CRLF while Spotless required LF. The Git attributes now explicitly keep Java files LF. Original working bytes were archived before normalization; every normalized file equaled its existing HEAD blob. A fresh `core.autocrlf=true` checkout verified all 30 files as LF with unchanged content. No financial application behavior changed, and the failed formatting run remains preserved.

Run its safety/invariant tests first, then the workload when the local stack is already healthy:

```powershell
node --test infrastructure/test-bounded-reliability.cjs
node infrastructure/bounded-reliability.cjs
```

The workload is fixed at four new synthetic accounts, three rounds and three same-account contenders per phase: at most 12 requests in flight, 300 total requests and 180 seconds, with a ten-second request timeout. It checks overspending, one persisted posting for identical retries, original receipts after later activity, altered-operation/amount conflicts, unchanged state after rejected writes and independent paginated reconciliation using exact integer cents. Actual counts, latency sample size/percentiles, image identities, source provenance and failures belong to the run-specific receipt; do not substitute configured bounds for measured results.

Reuse [LedgerIT](../services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java) for a genuine PostgreSQL insert failure after a balance update, asserting rollback and successful reuse of the same intent afterward. Its contention/replay cases and the [independent Cucumber scenarios](../automation/api-bdd/src/test/resources/features/credit-card.feature) already cover the corresponding API contracts. No fault endpoint or public workload is necessary. Use the existing source-bound Maven wrapper for a focused run:

```powershell
node infrastructure/maven.cjs -pl services/banking-api "-Dit.test=LedgerIT" verify spotless:check
```

Outputs are immutable under `.work/maintenance-20261015/` and `.work/evidence/runs/focused/`. Tokens and raw sandbox responses are not evidence artifacts. The running API image ID identifies the observed runtime; it has no embedded Git SHA, so do not assert that it equals the documentation branch HEAD. The focused Java integration fixture compiles the current source separately. These bounded functional observations do not establish production capacity, sustained stability, long-term availability or an SLA.

## Current operations: read-only observations

Provider observations below are from 2026-10-15 21:23–21:26 UTC, not continuous monitoring. [Sanitized receipts](evidence/maintenance-20261015/receipt-index.json) retain exact identities, fields and access failures.

| Target | Freshly verified | Limitations |
|---|---|---|
| Railway `creditflow-qe-pilot` / `pilot` / `banking-api` | Source `20c91f5`, deployment `e0d833e4-2ed4-42a1-b32e-bfdd85bf22dd`, SLEEPING; one replica, 0.5 vCPU / 500,000,000 bytes RAM; sleep enabled, no volume/staged changes | Capacity ceilings are not a dollar cap. Current invoice, plan/credit balance and workspace spending-limit settings are unavailable through present tools. |
| Neon `shiny-scene-38527470` | Free, PostgreSQL 17; sole endpoint idle, fixed 0.25 CU; branch logical-size ceiling 536,870,912 bytes; six-hour history retention | Timeout field 0 selects the Free plan default of five-minute suspension. Retention is configuration, not a tested restore. |
| Vercel CreditFlow and portfolio | Exact historical project/deployment/team IDs were queried; supplied public pages returned HTTPS 200 | Current project/deployment/domain reads returned 404. Current aliases/source identity/resource settings and spend actions could not be confirmed. The monthly billing response exceeded its response limit; a daily aggregate did not provide target-project cost attribution. |

The successful page GETs took 231 ms for CreditFlow and 181 ms for the portfolio. They establish frontend reachability only; no API banking, database-readiness or new cold-start probe occurred. Historical frontend source `81fceff0` and portfolio source `7cf155ef` remain [evidence-bound release pointers](evidence/completion.md); current Vercel control-plane verification is blocked rather than inferred from HTTP200.

### Cold starts, health and troubleshooting

Sleeping Railway and idle Neon are expected. A legitimate account operation wakes the API/database; the custom-domain release measured one first account request at 17.4 seconds. That historical sample is not a deadline guarantee. Current source uses a 20-second BFF upstream deadline and five-second database connection timeout; the historical Vercel function limit is 30 seconds. No new uptime monitor or artificial keep-awake polling was added.

- Check provider state and the canonical frontend before diagnosing banking. Public `/actuator/health/liveness` confirms process liveness and excludes PostgreSQL. Aggregate/database readiness at `/actuator/health/readiness` requires the server key in public mode and can wake the database. Use the existing secret-managed operator workflow for an authorized bounded check; never put secrets in command output or receipts.
- For 401, a synthetic session may have expired after 30 minutes. For 403, inspect canonical origin and protected provisioning/readiness configuration. For 429, distinguish per-peer time-window quotas from the 10,000-account capacity guard; do not relax them as a shortcut. Expired-account cleanup happens lazily when creating a sandbox, not on a claimed cleanup schedule.
- For timeout/503, inspect exact source/deployment, sleep state, resource configuration and bounded redacted errors. Do not disable sleep, authentication or quotas, raise ceilings, rotate credentials or upgrade a plan without separately scoped approval.
- After an ambiguous transaction response, reconcile account/history first. An intentional replay must reuse its key, operation and amount; a new key can create a second financial posting. Do not use production mutations as routine monitoring.

### Rollback instructions: no execution

Confirm the exact component/project/environment, present source, known-good evidence and schema compatibility before a release change. Use the provider's existing component release workflow, then verify source/alias, HTTPS, liveness and authorized readiness. Application rollback does not restore database state. Database restore/reset, migration changes and credential rotation require separately scoped recovery approval.

Railway's returned history contains only the current successful/sleeping API deployment and one failed build; the failed build is not a rollback candidate. No earlier successful API fallback was found. Capability flags such as `canRollback` do not establish a usable previous release. Vercel rollback candidacy/aliases must be inspected after provider access is restored; do not assume an earlier documented deployment remains eligible. No rollback/redeploy or database recovery was performed.

### Spending review

**$15/month remains a planning allowance, with review around $10; no combined enforced $15 cap was verified.** The configured Railway CPU/RAM ceilings are capacity controls. At the [published rates](https://docs.railway.com/pricing/plans), continuous full use of 0.5 vCPU plus 0.5 GB is approximately $15/month compute before egress and subscription/included-credit effects. A short resource sample cannot predict an invoice.

Railway's observed 24-hour window contained 289 samples and peaked at 0.203784192 GB memory; samples are neither billed totals nor production-capacity proof. Neon consumption fields for the reported 2026-10-10→2026-11-01 period are `compute_time_seconds=1060`, `active_time_seconds=4192` and `data_transfer_bytes=215023`. Zero storage billing counters do not mean an empty database: current branch logical size was 31,268,864 bytes. Preserve provider field units; do not infer current dollar cost from them.

An owner should review the exact Railway workspace Usage/Compute hard limit and target project cost, Neon project Consumption/limits, and Vercel project Usage plus team Billing/Spend Management. Record date, billing period, credits, target attribution, thresholds and enabled actions. [Railway hard limits](https://docs.railway.com/pricing/cost-control) can take workspace workloads offline. [Vercel spend pausing](https://vercel.com/docs/spend-management) is a separate team-wide action with delays/exclusions; a notification amount alone is not a pause. Never change shared controls in read-only maintenance. [Neon Free quotas](https://neon.com/docs/introduction/plans) and [fixed suspension](https://neon.com/docs/introduction/scale-to-zero) constrain service use; exhausted allowances are not authorization to upgrade.

## Interview and handoff checklist

Use the [five-minute guide](interview-guide/five-minute-walkthrough.md), [three exercises](interview-guide/coding-exercises.md) and [separate reference solutions](interview-guide/reference-solutions.md). Pre-run expensive verification and select source-bound reports before the demonstration; an offline/frozen-evidence explanation is preferable to claiming an unavailable live step succeeded. Keep the AI-assistance disclosure and distinguish portfolio work from professional workplace experience.

- Before maintenance, verify branch/HEAD/remote, unrelated changes, active producers and exact target environment.
- Review the dated receipt; preserve failures and distinguish fresh checks from earlier releases/Jenkins runs.
- Check the local lint patch only during a separately approved portfolio change; apply all removal criteria.
- Run the bounded harness only on the owned local stack; retain request limits, latency sample scope and independent reconciliation.
- Restore Vercel read access and inspect target billing/spend controls before claiming those blocked fields verified. Any provider mutation, public deployment, DNS, portfolio edit, resource deletion or system installation needs separate approval. Browser Use/cloud browser requires its own explicit permission.

The added Node guard tests are required in Actions and the Jenkins definition. The expanded Jenkins stage is checked locally for syntax; the earlier real controller run remains historical evidence and is not relabeled as execution of the new definition.
