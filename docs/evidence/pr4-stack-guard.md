# PR #4 stack ownership correction — 2026-10-15

> **Historical deployment context** - This record retains its original milestone, source revisions, measured results and approval boundaries. Earlier hosting/source-visibility/pending-release statements are dated history. Use [the current production documentation](../railway-production.md) for the October 24-25 Railway topology, release state and remaining closeout.

This corrects the bounded local harness at `32d685271fae32f71e32b1e4b6f657e63dd6b523`. PR #4 remains unmerged. The [earlier maintenance receipt](maintenance-handoff.md), failures and existing indexed JSON bytes remain historical evidence. [New sanitized receipt](pr4-stack-guard/verification.json).

## Confirmed defects and correction

- The old guard lowercased every checkout/configuration path. RED assertions reproduced acceptance of distinct POSIX paths on Windows and native Linux. POSIX paths now compare exactly, including POSIX-style inputs on Windows. Only Windows drive/UNC roots on Windows receive case folding; absolute paths and a single exact Compose file remain required.
- Valid container metadata accepted foreign/stale datasource settings. The correction checks configured and PID1 environments, canonical Java command, packaged application configuration and absence of external config. Spring/JVM/loader overrides and PostgreSQL probe routing overrides are rejected.
- Network checks require owned bridge endpoints, a unique `postgres` alias/DNS destination and no custom hosts/DNS/links/extra networks. Remote Docker endpoints are refused before inspection or HTTP.
- Before the first POST, a read-only health GET opens/reuses a database connection. PID1 socket inodes and Linux TCP/TCP6 tuples must match the owned PostgreSQL endpoint and read-only `pg_stat_activity` database/role/client-address/client-port rows. At least one match is required; every established outbound JVM TCP connection must match. Native IPv6 database targets are unsupported and refused.
- Raw Docker, process, configuration, DNS and SQL observations stay in memory. Only whitelisted metadata and proof booleans/counts enter reports. Failure and successful-preflight canary tests verify this boundary; rejected proof dispatches zero POSTs.

## Fresh local verification

| Check | Actual result |
|---|---|
| Windows Node 26.12.0 | 26 tests: 25 passed, 1 Linux filesystem test skipped; 0 failed |
| Existing Linux Node24 image | 26 passed; 0 failed/skipped; no network, read-only checkout, no pull |
| Node syntax / diff checks | Passed |
| Candidate source secret scan | Gitleaks 8.30.1: 222 files; 0 findings |
| Bounded PostgreSQL workload | 253 HTTP requests, 4 isolated accounts, 12 account-round checkpoints |
| Financial outcomes | 48 postings, 36 replays, 24 conflicts, 36 expected rejections; 0 transport failures |
| Pre-POST relationship proof | 6 JVM sockets matched owned PostgreSQL sessions |

Final run: `20261015T221611324Z-74adacd3-0ce5-4ca7-9e64-ee6bc8a97b98`, **22:16:11.328–22:16:21.592 UTC**, 10,263 ms including metadata/proof. Across 253 HTTP samples: p50 **5.884 ms**, p95 **16.418 ms**, maximum **27.048 ms**. Maximum concurrency 12; zero active requests at completion. Bounds remain 4 accounts, 3 rounds, 300 requests, 12 in flight, 180 seconds total and 10 seconds/request. Metadata/proof time is outside HTTP latency samples. This warm local observation is not capacity, availability or SLA evidence.

Source fingerprints remained unchanged during execution. Versions, image/container/source identities and original command hashes are recorded. The running image still lacks an attested Git revision. Proof assumes trusted local Docker/application images and observes their current relationship; it cannot defeat hostile code or concurrent external reconfiguration.

Actions now executes the guarded workload on its real Linux API/PostgreSQL stack after private/public automation and uploads its immutable receipts alongside the normal artifacts. This is local to the runner; it makes no public requests. Jenkins continues to execute the guard unit tests; no new Jenkins controller execution is claimed.

## Preserved failures and counting

The first Linux attempt referenced a deleted web-image ID and executed no assertions. A retry used the already available Node24 image with `--pull never`, reproducing real case-path assertion failures. Path, foreign-datasource, remote-daemon and probe-routing regressions were observed RED before correction. An intermediate temporary-root fixture mismatch was corrected separately.

The first real guarded run refused with **0 HTTP / 0 POSTs** because the JVM launcher adds a canonical JDK parent-library directory. A new RED fixture captured that behavior. Only three normalized JDK library directories are now accepted; untrusted loader paths remain rejected. That refusal and an intermediate passing workload remain preserved; only the final run above supplies current workload counts.

Original logs/outcomes remain under `.work/pr4-guard-review/`; immutable workloads remain under `.work/maintenance-20261015/reliability/`. New JSON hashes those originals without copying sensitive observations. Later documentation/receipt additions are outside the pre-commit workload fingerprint. Final committed-source CI and verified thread resolution are recorded on [PR #4](https://github.com/farhan-shafee/creditflow-qe/pull/4), avoiding a self-referential source/commit claim.

No application, dependency, portfolio, deployment, provider, public workload or system installation changed.
