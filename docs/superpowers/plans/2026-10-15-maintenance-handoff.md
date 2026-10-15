# CreditFlow verification and maintenance handoff

**Goal:** Close reproducibility and interview handoff gaps without repeating completed releases or changing the portfolio.

**Baseline:** CreditFlow main `51a2affe38a733f350390fafd59b885b74823b42`; portfolio main `7cf155efa7ec7567a3aa7c2baa031722e971a915`. Both expected PRs are confirmed merged. Work proceeds in the existing CreditFlow checkout on `codex/maintenance-handoff`.

**Approach:** Reuse the transactional API, independent automation, local Compose PostgreSQL and historical source-bound reports. Add a versioned, bounded loopback-only workload where the earlier ignored harness is insufficient. Keep provider checks read-only and reference solutions separate from exercises.

## Constraints and review focus

- No portfolio edits, infrastructure, paid resources, installation, public deployment/load test, DNS, destructive actions, borrowed credentials or force push.
- No Browser Use/cloud browser. Never emit credentials, environment values or connection strings.
- Preserve historical receipts and failures. Label historical results and current observations separately.
- One local verification producer at a time; freeze source while a source-bound verification scope runs.
- Workload must reject public/foreign targets, enforce request/concurrency/time bounds and reconcile exact cents independently.
- Reuse real rollback/concurrency tests; do not add fault endpoints or claim production capacity/SLA.
- Distinguish configured CPU/RAM/database ceilings, provider quotas and billing controls from the $15/month planning allowance.

## Work items

- [x] Read instructions, verify clean local baselines, current remote main and merged PR identities.
- [x] Document the upstream ESLint-plugin check, existing patch maintenance and precise removal criteria in CreditFlow only.
- [x] Add `infrastructure/bounded-reliability.cjs` and meaningful safety/invariant tests, required by existing Actions/Jenkins stages; run against fresh synthetic accounts on the identified local PostgreSQL stack. Preserve command exits, environment/image/source identity, latency distribution and limitations.
- [x] Reuse `LedgerIT` for genuine insert-failure rollback and existing contention/replay checks; run appropriate focused Maven checks after source freezes. Preserve the failed PowerShell invocation and Windows CRLF formatting failure; correct Java checkout attributes and verify fresh LF checkout plus passing retry.
- [x] Record current read-only provider identities/settings/usage and specifically blocked fields. Add an operational runbook covering cold starts, health, troubleshooting, rollback and spending review.
- [x] Replace six mixed interview drills with three exercises and separate reference solutions; add source/test links and a realistic five-minute demo preflight. Compile all three examples and run 13 standalone Money cases in Java21.
- [x] Review links/diff, validate meaningful code/examples and scan source for secrets. Keep historical failures intact. Independent review passed; 118 local Markdown targets, 14 receipt hashes and frozen 31/11 XML counts checked; Gitleaks found zero candidate-source leaks.
- [ ] Commit/push validated CreditFlow changes, create/attach a focused PR, inspect its required checks and deliver exact results plus handoff checklist.

## Expected files

New bounded workload/test, `docs/maintenance-handoff.md`, operational/evidence records and `docs/interview-guide/reference-solutions.md`; focused edits to interview guides, README and current status/readiness pointers where justified. Production application behavior and portfolio files remain unchanged.

Verification outputs are immutable run-specific files under ignored `.work/maintenance-20261015/`; only sanitized reviewed evidence is exported to documentation. Existing `bounded-reliability.json` remains a historical observation rather than being overwritten.

This source records the pre-commit execution plan. Final delivery identities and committed-source CI outcomes are recorded on its pull request and in the task response, avoiding a self-referential commit/run claim in the source being committed.
