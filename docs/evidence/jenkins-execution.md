# Executed local Jenkins pipeline — 2026-10-15

> **Historical deployment context** - This record retains its original milestone, source revisions, measured results and approval boundaries. Earlier hosting/source-visibility/pending-release statements are dated history. Use [the current production documentation](../railway-production.md) for the October 24-25 Railway topology, release state and remaining closeout.

**TESTED / VERIFIED.** Jenkins 2.580.1 on Java 21 executed the repository Jenkinsfile through an actual authenticated local controller. Job creditflow-qe-verify, build 1, finished SUCCESS at 2026-10-15T18:53:55.642Z. SCM source was 47984ef34e444268d9315d4aa596fb6b8be8590d; its Jenkinsfile blob d598fe38b7c56d05ce519e8ff3bb0035331a0730 matches the later dashboard source's unchanged pipeline.

| Executed gate | Actual result |
|---|---|
| Evidence-framework behavior | 32 passed |
| Application unit / PostgreSQL integration | 31 / 18 passed |
| Private Cucumber / TestNG | 31 scenarios,154 steps / 6 passed |
| Independent public Cucumber / TestNG | 31 scenarios,154 steps / 6 passed |
| Published Jenkins JUnit cases | 123 passed, 0 failures, 0 skips |
| Quality | Spotless/SpotBugs,209-component inventory,OSV 0 affected, Gitleaks 0,private/public Compose,runtime-role rollback and GroovyAST checks passed |
| Frozen Jenkins archives | 153 files downloaded over authenticated HTTP;147 report/log hashes matched across core/public/quality |
| XML verification | 13 JUnit-format reports, 0 failures/errors/skips |

All seven observed stage groups, including checkout and post actions, completed successfully. Duration was 363781ms. The controller bound to loopback only; anonymous API access returned 403. A separate TLS Docker-in-Docker engine shared only this verification workspace, with no host Docker socket. No public deployment, billing change, global software installation or existing service mutation was needed for Jenkins.

The successful pipeline checks out source, builds the application, runs real PostgreSQL/API suites, publishes frozen JUnit reports and archives sanitized evidence. Browser/web/Bruno tests belong to the separately verified GitHub Actions path and are not included in the 123 Jenkins cases. The quality command's jenkins_runtime=NOT RUN records its own AST-only check; this separate controller receipt proves actual pipeline execution.

[Sanitized Jenkins receipt](jenkins-execution.json) records source,stage outcomes,counts,image IDs andarchive hashes. Actual setup,plugin inventory,raw controller/job logs andexported artifacts remain in ignored local storage. Two read-only receipt-helper defects were retained: the JUnit API field name and a final print-variable shadowing error. Neither changed the successful pipeline result, executed tests or frozen hashes.

## Bounded local stability observation

A separate [local observation](bounded-reliability.json) ran for 91,573 ms with 4 independent synthetic accounts:204 HTTP requests, 80 actual purchases/payments, 40 identical-request replays and 10 rounds. Every round reconciled exact balances and the entire ledger;0 errors. Tokens stayed in memory and no public requests occurred. These measured local observations do not establish sustained-load capacity, long-term reliability or an availability/SLA claim.

The local Jenkins service is a verification environment, not a managed always-on CI service. Historical syntax-only records remain preserved; current status is superseded by this receipt.
