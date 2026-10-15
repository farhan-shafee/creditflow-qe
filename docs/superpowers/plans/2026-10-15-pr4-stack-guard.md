# PR #4 local stack guard correction

**Goal:** Correct PR #4 at `32d6852` on its existing branch, preserving historical evidence and leaving the PR unmerged.

**Scope:** The bounded local workload guard and its regressions/evidence. No application, portfolio, deployment, provider or dependency changes.

- [x] Add path-case regressions first. Observe the old guard accepting distinct POSIX checkout/configuration paths. Run them on Windows and native Linux; preserve RED output.
- [x] Compare POSIX paths exactly and Windows paths with Windows semantics. Preserve exact Compose-file and binding checks.
- [x] Add failing relationship regressions: foreign/stale/overridden datasource configuration, ambiguous DNS/network ownership, and a running JVM connection that does not terminate at the owned database. Verify rejection before any POST.
- [x] Inspect only the existing local stack. Keep process environment, connection strings, credentials, raw Docker/SQL output out of logs/reports. Reject unsupported overrides instead of guessing Spring precedence.
- [x] Require a canonical process/configuration, owned network/DNS destination, and read-only live JVM-socket/PostgreSQL-session correspondence before workload mutation. Record only nonsecret proof outcomes and container/image/source identities.
- [x] Run host/native-Linux regressions (25+1 skip / 26 passed), the final 253-request local workload and independent review. Preserve all failed attempts. Syntax/diff, 35 local links, all 14 historical receipt hashes and a 222-file Gitleaks scan passed. Full Actions remains a delivery gate below.
- [ ] Commit/push to PR #4, inspect full CI and artifact provenance, then resolve only verified review threads. Record final commit/run identities in the PR and task response; do not merge.

The primary review failure modes are POSIX case folding, higher-priority Spring/JVM overrides, stale process environment, duplicate/foreign network aliases or host overrides, and metadata that looks local while the live connection targets a different database. None may be accepted merely because both containers are healthy.
