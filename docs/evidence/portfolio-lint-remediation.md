# Portfolio lint dependency remediation — 2026-10-15

**IMPLEMENTED / TESTED / DEPLOYED / VERIFIED.** The previous five high-severity development-tool affected-package entries are resolved by removing their shared Next ESLint → fast-glob → micromatch → braces chain. Full and production-only portfolio npm audits report zero findings at the executions below. This dated follow-up supersedes the earlier unresolved-review status; historical audit receipts remain unchanged.

## Source, CI and release

- Portfolio [PR #2](https://github.com/farhan-shafee/farhanshafee.com/pull/2) merged tested head ba750a11477d66d829d7412b142389128a4b0bb3 as 7cf155efa7ec7567a3aa7c2baa031722e971a915. The source trees match.
- [PR Actions run](https://github.com/farhan-shafee/farhanshafee.com/actions/runs/38804226782) and [main Actions run](https://github.com/farhan-shafee/farhanshafee.com/actions/runs/38805388340) passed. Downloaded artifacts confirmed 63 unit tests (including 21 lint regressions), 26 browser tests, zero failures/skips/flaky cases and zero findings in both audits in each run.
- Native Vercel Git deployment dpl_8GMzv1fz6A76G9CnhLkFSJyFsB8j is READY at exact main source 7cf155efa7ec7567a3aa7c2baa031722e971a915. All three existing aliases were read back; protection and resource configuration were preserved.
- 10 protected-preview checks, 19 public HTTPS/content checks and 2 actual public mobile/desktop journeys passed.
- Fresh local install, all 63 unit/26 browser tests, build, ESLint, TypeScript and formatting passed. Final 164-file reviewed source scan: Gitleaks zero findings.

The live portfolio remains https://farhan-shafee.com/work/creditflow-qe. Portfolio source is private; its source and CI links require repository access. The unchanged public CreditFlow application remains https://creditflow.farhan-shafee.com.

## Technical decision and retained failures

A private local fork of Next lint plugin 16.3.8 replaces only directory discovery, using pinned glob 13.0.6 via its documented raw export and minimatch 10.2.6. The lock graph contains no fast-glob, micromatch or braces. All 22 upstream rules and every other compiled rule/configuration/declaration file retain authenticated upstream hashes; three effective configurations and actual page-link violations are checked.

This is a maintained local patch, not an official Next release. Rebase it when upgrading the plugin and remove it when a tested official release eliminates the chain. No application lint rule or audit gate was disabled. Independent review matched 54 upstream/fork path cases. Its three discovered lint-weakening cases were reproduced with six failing regressions and corrected before integration.

The initial CI run 38803557382 passed tests but failed artifact publication because hidden output files were excluded by the upload action. A non-hidden scoped output directory corrected publication; missing reports still fail CI. Original local failures, the bundled-parser rejection and the failed CI receipt remain preserved.

The corrected source CI first encountered an unusually long install and was cancelled for diagnosis. Clean local Linux/Node24 installation completed in 18 seconds and all 21 focused regressions passed; the same unchanged commit was re-executed successfully in CI. The exact delay cause remains undetermined. This cancelled attempt is retained separately from the successful execution.

## Scope and limits

Application source, articles, project ordering, images and public behavior were unchanged. CreditFlow backend/frontend deployments, DNS, credentials, cloud resources/plans and system software were unchanged. Jenkins remains an executed local verification controller, not an always-on public service. Sustained-load capacity, long-term availability and an SLA remain unverified. A zero-finding audit is not a security certification.

[Sanitized receipts and SHA-256 index](portfolio-lint-remediation/index.json). Earlier [completion](completion.md) and its original receipt index retain their original history.

Receipt files use LF through a narrowly scoped Git attribute so their byte hashes survive Windows autocrlf checkouts. A fresh checkout first reproduced all 11 mismatches; the corrected staged export verified all 11 original hashes without changing receipt contents or historical records. [Checkout regression receipt](portfolio-lint-checkout.json).
