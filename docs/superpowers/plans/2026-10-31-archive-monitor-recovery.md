# CreditFlow archive monitor recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in the isolated worktree.

**Goal:** Prepare a tested, reviewable recovery-aware CreditFlow monitor without erasing failures or changing production.

**Architecture:** Import the deployed Bun module byte-for-byte, then change only archive assessment and its read-only metadata query. Keep historical failure observations explicit while preserving every unrelated health gate.

**Tech Stack:** Node.js built-in test runner, Bun runtime, PostgreSQL pg_stat_archiver, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-10-31-archive-monitor-recovery-design.md

## Global constraints
- No PostgreSQL statistics reset, backup trigger, provider mutation, live deployment or new dependency.
- Preserve counts, timestamps, failed WAL identifiers and historical receipts.
- Alert on recent failure, missing/incoherent metadata, archive lag, invalid/expiring certificates, stale backup, or mismatched database identity.
- Recovery quiet period is 900 seconds; compare WAL on matching timelines with exact integer arithmetic.

## Review focus
- A future or missing failure timestamp must not suppress an incident.
- Equal archived/failed WAL requires a strictly later success timestamp.
- WAL segment rollover and timelines must be checked correctly.
- A new intermittent failure must re-alert even after an old failure recovered.
- Recovered archive state must never override another failing monitor gate.

## Task 1: Reproduce and implement archive recovery assessment
**Files:** infrastructure/monitor/creditflow-monitor.mjs, legacy-validation.mjs, creditflow-monitor.test.mjs
**Interfaces:** assessArchive(row, now, reviewedIncident) -> sanitized assessment with ok/issues and retained failure evidence; monitor retains its existing injected read/fetch interfaces.
- [ ] Import exact deployed source and run preserved baseline validation (13 checks).
- [ ] Write tests for recovered failure and every review-focus class; run against old source and retain expected failures.
- [ ] Implement bounded timestamp/WAL recovery classification and add last_failed_wal to the existing SELECT.
- [ ] Run the complete monitor suite; preserve every existing negative check.

## Task 2: Integrate evidence, CI and review
**Files:** .github/workflows/verify.yml, docs/evidence/archive-monitor-20261031/*, docs/archive-monitor-recovery.md, docs/railway-production.md
**Interfaces:** CI executes the same monitor command as local tests; incident receipt contains sanitized observations only.
- [ ] Add the monitor suite to the existing core CI job.
- [ ] Record incident timeline, seven retry matches, historical-counter cause and bounded recovery evidence.
- [ ] Document exact rollout scope and independent post-deploy checks; label rollout pending approval.
- [ ] Run relevant existing checks, inspect diff/secrets and obtain independent branch review.
- [ ] Commit/push feature branch, open PR, inspect full CI; keep main and live providers unchanged.

## Execution ledger
Native execution is already authorized by the owner; routine implementation decisions are made here without another planning approval. Existing main checkout and all older worktrees remain untouched. No shared interfaces conflict: Task 2 consumes Task 1's tested exported monitor.

Ruling: Require an explicit exact incident acknowledgement instead of general auto-clearance. PostgreSQL documents that WAL ordering is not guaranteed, so unknown failures remain actionable even after later progress. Cost: future genuine incidents require a new reviewed acknowledgement.
Task 1: complete locally. Baseline deployed source byte-match verified. Regression RED: 40 tests,9 failed; initial GREEN40. Safety refinement RED49,9 failed; identity diagnostic fixed, GREEN49. Original13 checks retained. CI and independent review pending Task2.
