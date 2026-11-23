# CreditFlow WAL backup-history monitor correction — November 23, 2026

## Evidence and cause

On 2026-11-23 at 05:24:46 UTC, the production PostgreSQL/pgBackRest logs recorded a successful differential backup and successful asynchronous archive-push acknowledgements for both WAL segment `00000001000000A000000071` and its backup-history file `00000001000000A000000071.00000028.backup`. The next CreditFlow monitor run at 05:25:39 UTC reported `wal_metadata_invalid` and `archiver_failure_metadata_invalid` despite all three health checks returning HTTP 200 and its backup assessment being healthy. The monitor's `lastArchivedUnix` of 1795411486.605595 matches the backup-history archive timestamp. It returned `status: ok` at 05:32:48 UTC and later runs, after an ordinary WAL file was archived.

The production monitor's strict 24-character WAL filename parser did not recognize PostgreSQL's valid `<24-hex-WAL>.<8-hex-offset>.backup` history filenames. A recent `.backup` history file is a plausible root cause strongly corroborated by the adjacent logs; the original raw database row from the failed run was not retained, so exact one-run state cannot be proven retrospectively.

## Corrective behavior

- Accept only the exact backup-history filename grammar and an offset smaller than the database WAL segment size.
- Treat the history file's WAL prefix **only as a conservative progress floor**, one segment before the named WAL, rather than asserting its named segment was durably archived. The progress estimate deliberately errs toward reporting extra pending segments.
- Retain all timeline, segment-size, WAL-order, archive-lag, archive-failure-history, reviewed-incident, certificate, backup freshness, identity, and HTTP checks. Malformed metadata, stale archive lag, changed failure count/epoch, or any new failure still generates an alert.
- Expose `lastArchivedFileType` as `wal_segment`, `backup_history`, or `unverifiable` for reviewability.

## Verification and release gate

- Local Node.js v24: **59/59** monitor tests passed.
- Exact production runtime Bun 1.4.4, network disabled, repository read-only: **59/59** monitor tests passed.
- `git diff --check`: passed.
- New regressions cover valid history files, conservative backlog, lag, altered failure counts, invalid suffix, invalid offset, timeline mismatch, history ahead of current WAL, and end-to-end monitor behavior.
- The deployed Railway function matched the baseline GitHub main source exactly before this change. The change has not modified the production function, backups, WAL archives, or PostgreSQL.

A successful unit test is not proof of a live scheduled run or a restore drill. Release requires review and full CI followed by a separately approved Railway function deployment. Postdeployment acceptance: matching source, healthy next scheduled monitor run **and** healthy post-backup monitor run without new archive failures or relaxed gates.

Reference: PostgreSQL `pg_stat_archiver` documents the latest archived filename and the limitations of treating its ordering as a continuity proof; `pg_walfile_name` documentation specifies WAL-segment naming.