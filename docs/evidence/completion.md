# Completion follow-up — 2026-10-15

> **Historical deployment context** - This record retains its original milestone, source revisions, measured results and approval boundaries. Earlier hosting/source-visibility/pending-release statements are dated history. Use [the current production documentation](../railway-production.md) for the October 24-25 Railway topology, release state and remaining closeout.

**IMPLEMENTED / TESTED / DEPLOYED / VERIFIED.** At this historical completion timestamp the portfolio development dependency review below remained unresolved. The later [lint remediation](portfolio-lint-remediation.md) resolves it and supplies the current portfolio release pointer. This record supersedes the earlier release pointers without rewriting their original evidence.

## Released components

| Component | Actual source and deployment |
|---|---|
| CreditFlow frontend | 81fceff035c5ad23e761f6a1c49196e488f24d58; Vercel dpl_HQsUSUS6ag68W4Nq2jDNG8e6tCi8 |
| Banking API | Unchanged 20c91f5e10658ab4ce3ec7f2727c8a4934f5b314; Railway e0d833e4-2ed4-42a1-b32e-bfdd85bf22dd |
| Portfolio | Merge 5c52f2265bf204cbb0a027c487794c57553f255d; Vercel dpl_3xfGi5VMGGFBtzvXddzH1e771ZYQ |
| Live demo | https://creditflow.farhan-shafee.com |
| Portfolio case study | https://farhan-shafee.com/work/creditflow-qe |

Frontend source passed [both Actions jobs](https://github.com/farhan-shafee/creditflow-qe/actions/runs/38789200927) before its protected staging deployment. All 165 exported Git blobs were verified byte-for-byte before upload. The explicit creditflowReleaseCommit metadata identifies source 81fceff0. Automatic uploader githubCommitSha metadata names later documentation commit 5350573; it is not used as proof of the exported source. Both revisions have identical frontend and API source.

Ten staged checks passed, followed by promotion and readback of the actual custom alias. The dashboard now identifies its original tested baseline accurately and links the current execution status separately. Preview protection, public write origin, resource settings, secrets and DNS were preserved.

## Executed checks

| Scope | Actual result |
|---|---|
| Hosted Java UI/BFF module after correction | 11 passed: 2 Selenium, 4 Playwright, 4 BFF, 1 trace-redaction; 0 failures/errors/skips; Spotless passed |
| Portfolio tests | 42 unit passed; 26 full local browser tests at the parser source; 4 affected browser checks after the Jenkins-copy update |
| Portfolio source checks | Production build, TypeScript, ESLint and Prettier passed; 99 committed files scanned, Gitleaks 0 |
| Portfolio preview | 10 checks passed at feature head 2c48fb1a4bf8b47a7a616d6ce28765e03e91fab6 |
| Public portfolio | 19 HTTPS/content checks and 2 actual mobile/desktop browser journeys passed; no overflow/runtime errors |
| Local Jenkins | [Actual controller execution](jenkins-execution.md): 123 published cases, 32 separate framework tests, 147 matched report/log hashes |
| Bounded local observation | [204 requests](bounded-reliability.json), 80 postings, 40 identical-request replays, 0 errors |

The portfolio merge tree equals the tested feature tree. Its native Git integration built the exact main merge commit, reached READY and attached all three existing aliases. Existing project order, routes, article output, security headers, AI-assistance disclosure and the original payment screenshot were preserved. The original local portfolio main checkout was advanced with a clean fast-forward.

## Failures and corrections retained

The first hosted run at source 81fceff0 had 10 passing tests and one HttpTimeoutException while creating a synthetic account. BffContractTest allowed only 15 seconds, below the existing 20-second upstream deadline, 30-second hosted function deadline and previously measured 17.4-second cold start. The transport deadline is now 35 seconds. Status, cookie, authentication, ownership, validation, posting and replay assertions are unchanged; no retries or sleeps were added. The corrected candidate's exact file hash and complete 11-test pass are retained. This successful run does not establish a cold-start SLA.

The first release export differed only because Git archive applied CRLF conversion to mvnw.cmd. It was rejected before any deployment request. The corrected upload wrote each pinned Git blob directly and verified every file. A staging helper also assumed nonexistent HTML canonical markup; its failed receipt remains preserved. The corrected helper checks the actual configured origin and provider redirect contract. No application requirement or security assertion was removed.

The Unix Maven Wrapper mode was corrected to 100755 without changing contents. Actual direct execution from the archived tree passed in the Java21 Linux container; core PR #1 was then merged as f5c8dec0e2a52bb7158d8471924490ec79da0b37.

## Dependency review and operating limits

Portfolio production npm audit: **0 findings**. Full audit: **REVIEW**, five high-severity development-tool affected-package entries, zero moderate/critical findings. These entries arise from the unpatched upstream Next ESLint/fast-glob/micromatch/braces chain; they are not five unrelated root vulnerabilities. Removing gray-matter eliminated the older runtime YAML chain. No incompatible override, adapter, downgraded Next stack or disabled lint rule hides the remaining advisory. See [the exact audit scope](completion/portfolio-dependency-review.json).

Jenkins was an authenticated loopback-only verification controller with a private TLS Docker engine. Its two project-owned containers were stopped after artifacts were exported; retained volumes/images were not deleted. It is not a public or always-on Jenkins service. Sustained-load capacity, long-term availability and an SLA remain unverified. The $15/month allowance remains a planning allowance, not an enforced billing cap.

No new cloud infrastructure, plan, DNS, credential, system-software or unrelated-project change was made in this completion follow-up. Historical provider, domain and initial portfolio receipts remain intact. [Sanitized completion receipts and SHA-256 index](completion/index.json) retain the source, counts, failures and release identifiers. Final PR-head CI and merge are linked from the repository's pull request checks.
