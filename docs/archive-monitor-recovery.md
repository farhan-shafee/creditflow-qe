# CreditFlow archive incident and monitor recovery

> **Rollout completed — October 31, 2026 (New York):** [PR #6](https://github.com/farhan-shafee/creditflow-qe/pull/6) merged as `5b65732`; native monitor `374ce843-286f-44ec-927c-92a57ac58d9a` reached SUCCESS. Source SHA-256 `8a1bae0492c21c54fdd9eea2ed194b1c678dd72b0a7cd2d9718d538ca9c95204` matched the reviewed blob. Two distinct scheduled executions at November 1 01:55:48 and 02:00:49 UTC returned status=ok while retaining failedCount=11 and the exact reviewed incident. No counter reset or provider root-cause resolution is claimed. The pending-rollout statements below are historical checkpoints.

## Historical implementation and rollout plan

**IMPLEMENTED / TESTED locally; LIVE ROLLOUT PENDING separate approval.**

The October 31 incident is diagnosed as actual archive request timeouts, including a repository HTTP 408. It is distinct from the watcher's separate rc50 initialization lock contention. Ten async archive timeouts and one repository-metadata failure account for eleven recorded archive-command failures. All seven named failed WAL segments have later successful push records in the bounded 19:35–20:15 UTC service log read. A later differential completed at 20:07 UTC. No queue-loss warning matched the bounded read. This is not a provider root-cause resolution or a new restore guarantee.

The live monitor imported here was verified byte-for-byte: SHA-256 `d3b3bd2b38bb7db0b678b582fb321da594f4a5cdb485a454f661356cd830e27c`. It alerts forever when `failed_count > 0`. PostgreSQL retains these cumulative statistics across clean restarts. Its documentation also warns that later WAL numbers do not prove all older WAL archived. pgBackRest can acknowledge then drop WAL if a configured queue limit is exceeded. Therefore general automatic clearance based only on later WAL is unsafe.

## Review-bounded recovery policy

The candidate acknowledges only incident `CF-ARCHIVE-20261031`, bound to the exact cluster identity, failure count11, failure timestamp1793477059.095708, failed WAL `00000001000000240000008B`, and statistics-reset epoch1792905469.450778. The [sanitized incident receipt](evidence/archive-monitor-20261031/incident.json) preserves the matched retry evidence. The [metadata fixture](evidence/archive-monitor-20261031/metadata-fixture.json) comes from a session explicitly set read-only, querying metadata only through existing scoped SSH.

For that exact reviewed incident, clearance also requires a strictly later successful archive timestamp, same-timeline WAL progress at/beyond the failed WAL, at least900 seconds since the failure, coherent metadata and every existing health/backup/identity/certificate/lag gate. Its output retains `failedCount`, `lastFailedUnix`, `lastFailedWal`, `statsResetUnix`, `reviewedIncidentId` and `archiveFailureState`. It never resets PostgreSQL statistics or deletes evidence.

New counts, new failure timestamps, different failed WALs, different clusters, or changed statistics-reset epochs cannot inherit this acknowledgement. Unreviewed failures stay alerts even after their quiet period. Missing metadata fails closed. A future incident requires new investigation and a reviewed acknowledgement, not a counter reset or an automatic baseline update. No additional infrastructure, persistence store, credential or dependency is introduced.

## Verify locally

```powershell
node infrastructure/monitor/legacy-validation.mjs
node --test --test-reporter=tap infrastructure/monitor/creditflow-monitor.test.mjs
python -m unittest infrastructure/test_evidence_run.py -v
node --test infrastructure/test-bounded-reliability.cjs
```

These offline fixtures exercise the real exported assessment and monitor functions. They do not inject faults into production. The unchanged Java/API/browser/security gates also run on the PR in GitHub Actions. Bun-native platform execution remains a post-approval rollout check; Node-only local tests do not establish that live execution.

## Exact rollout scope, not yet executed

Only replace the source of existing function `630304f8-8d6c-44cc-9c96-d781f9606f42` in CreditFlow project `d76d1a2a-17bb-42e2-b192-481a83f1cfab`, live environment `ea414395-69ad-4a40-bf74-61ffe0911649`, with the reviewed Git blob `infrastructure/monitor/creditflow-monitor.mjs`. Do not deploy this branch to the Java API or frontend. Keep cron, restart policy, limits, variables, database, backups, DNS and all other projects unchanged.

Before applying, re-read deployed source and require the baseline hash above; inspect staged changes; re-read the acknowledgement's exact metadata and current health. Stop on drift, new failures, missing archive progress, backup/identity/TLS problems or unrelated pending changes. Source changes to a public operational service require the owner's separate deployment approval. PR creation or passing CI does not grant that approval.

After approval/application: observe terminal deployment success and a fresh actual result with all checks passing, the eleven failures retained, exact incident ID, and `historical_with_later_progress`. Verify the deployed source hash against the reviewed Git blob. Then observe a distinct later native five-minute scheduled execution; deployment acceptance alone does not verify scheduled operation. A new failure must still produce an alert. Do not manufacture a production failure to test this.

The separate hourly review task is read-only and was not edited. Its reviewer must continue reporting real new archive failures and must not treat cumulative nonzero counters as automatically cleared. If its prompt requires zero lifetime failures, prepare a separately reviewed CreditFlow-only interpretation change. Never promise chat delivery from an enabled flag alone.

## Sources and limitations

- [PostgreSQL17 pg_stat_archiver](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ARCHIVER-VIEW): cumulative counters and WAL ordering limits.
- [pgBackRest queue limit](https://pgbackrest.org/configuration.html#section-archive/option-archive-push-queue-max): acknowledgement/drop behavior and archive warnings.
- [Existing production topology](railway-production.md).

The original provider timeout cause cannot be repaired by changing alert classification. Production state and all historical alerts remain untouched pending approval. Future restore drills, archive-object integrity, weekly retention, external statistics resets and monitoring delivery need their own evidence; this change makes no new RPO/RTO, continuous-uptime or production-capacity claim.

## Proposed hourly-review interpretation (also pending approval)

The existing task explicitly requires `failedCount0` for CreditFlow, so the native function change alone would leave the hourly review inconsistent. The proposed edit replaces only this exact phrase in the CreditFlow section:

`matching systemIdentifier, failedCount0, archived/pending counts nonnegative`

with:

`matching systemIdentifier, either failedCount0 or the exact reviewed CF-ARCHIVE-20261031 history (reviewedIncidentId=CF-ARCHIVE-20261031, archiveFailureState=historical_with_later_progress, failedCount=11, lastFailedUnix=1793477059.095708, lastFailedWal=00000001000000240000008B, statsResetUnix=1792905469.450778, and lastArchivedUnix strictly after lastFailedUnix with at least900 seconds since that failure), archived/pending counts nonnegative`

All other task text, project scopes, checks, event-window rules, enabled state and hourly schedule remain unchanged. Compare the entire current prompt with the privately retained pre-change prompt before applying; stop on drift. This proposal does not authorize resetting counters or ignoring a new failure. The task was not changed during implementation.

## Security findings discovered by full CI

The first full PR run [41260248400](https://github.com/farhan-shafee/creditflow-qe/actions/runs/41260248400) failed its unchanged OSV gate on two existing resolved dependencies. The browser job passed. Its [failure receipt](evidence/archive-monitor-20261031/failed-ci-41260248400.json) and original artifacts remain preserved.

The root POM now manages Guava at `33.7.2-jre` for [GHSA-xxph-c9ww-hj94](https://github.com/advisories/GHSA-xxph-c9ww-hj94) and overrides Boot's imported OpenTelemetry BOM through `opentelemetry.version=1.67.0` for [GHSA-ccrj-gw8r-854m](https://github.com/advisories/GHSA-ccrj-gw8r-854m). The latter aligns the stable API/context/SDK/exporter family instead of pinning API alone. These are dependency-management changes for future builds, not a live application upgrade. No audit rule, vulnerability exception or assertion was weakened. Resolved-inventory, security and full runtime/browser checks must pass before merge approval.

The same monitor source also passed 50 tests and 13 legacy checks in the matching Bun1.4.4 runtime, using an isolated network-disabled/read-only container; see [runtime receipt](evidence/archive-monitor-20261031/bun-runtime.json). This does not substitute for a post-approval native scheduled execution.


## Inventory completeness correction

The second full run [41260917206](https://github.com/farhan-shafee/creditflow-qe/actions/runs/41260917206) passed the API/public/browser suites and the unchanged OSV scan (205 components, zero affected), then failed the evidence validator's hard-coded 209-version minimum. Comparing both resolved BOMs proves that all 204 distinct group:artifact families remain present; only duplicate versions converged. The original failed run and its artifacts are retained in a [separate receipt](evidence/archive-monitor-20261031/failed-ci-41260917206.json).

The completeness gate now retains the 204-family baseline, requires exact application/automation module and Selenium/Playwright identities, validates versioned Maven coordinates, and requires unique graph nodes, complete references and root reachability. Duplicate versions cannot pad a missing library. Eight added regressions cover valid convergence, duplicate padding, missing nodes/references/modules, disconnected nodes, duplicate nodes and inconsistent coordinates. All 40 evidence behavior tests pass locally; both the original 209-entry and patched 205-entry real inventories pass the stronger graph checks. OSV still binds every resolved component to the exact BOM and query time; no advisory is suppressed. Full CI must pass on the resulting commit before live rollout approval.
