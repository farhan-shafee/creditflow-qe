# CreditFlow QE engineering finish

> Execute the owner's approved six-step finish in the existing `feat/banking-core` checkout. Preserve the existing health regression. Commit only validated corrections; do not merge.

**Goal:** Complete the existing banking/QE implementation with fresh, reproducible local and GitHub Actions evidence.

**Architecture:** Keep the transactional API, independent Java automation, Next.js BFF and project-scoped Docker services. Use the same Java21/Maven service for verification and complete CycloneDX inventory generation. No new public administrative or failure-injection endpoints.

**Specification:** Owner's engineering-finish request, the read-only audit, and `docs/architecture/core-design.md`.

## Global constraints

- Preserve exact BigDecimal money, account ownership, original-receipt idempotency and atomic ledger posting.
- Preserve all prior failure evidence before generating fresh reports.
- Run one project verification process at a time; do not touch other projects or their credentials/data.
- Never print secrets, environment-file contents, tokens or connection strings.
- No cloud provisioning, public deployment, DNS, system installation or existing portfolio edits.
- No Browser Use/cloud browser, merge, force-push, history rewrite or resource deletion.

## Review focus

- A Linux runner must be able to produce a complete BOM after root-run Docker verification.
- Public liveness must remain independent of database availability; database readiness must remain protected.
- Public-mode automation must supply the server key without exposing it in reports.
- Replayed UI transactions must preserve the first committed receipt and request identity.
- A stale or partial report set must never qualify as a fresh successful run.

## 1. Inventory ownership diagnosis and CI correction

Files: `.github/workflows/verify.yml`, `Jenkinsfile`, project-scoped diagnostic evidence.

- [x] Reproduce the actual CycloneDX error in an isolated Linux filesystem; retain UID, target ownership/modes, exception, command result and timestamps.
- [x] Run complete `-Pui`, test-scope JSON inventory generation through the Compose Maven service, with diagnostic output and Maven exception detail.
- [x] Preserve dependency advisory and secret checks; correct equivalent Jenkins inventory scope.

## 2. Public health and database readiness

Files: `PublicBoundaryIT`, isolated database-unavailable integration test, `RequestControls`, `application.yml`, `Dockerfile.api`, `railway.toml`.

- [x] Preserve and extend the existing regression; demonstrate its intended failure before changing behavior.
- [x] Assert healthy public liveness200, protected aggregate/readiness403 without server key, authorized database readiness200.
- [x] Assert database-unavailable public liveness200 and authorized readiness503 using an isolated application/database fixture.
- [x] Configure readiness DB membership, minimum idle0, disabled idle keepalives and bounded idle retirement; move infrastructure probes to liveness.
- [x] Run the focused health tests against the actual PostgreSQL test environment.

## 3. Independent automation assertions

Files: API automation client/config/context/hooks/steps/features, TestNG client configuration, Java Playwright journey.

- [x] Add configurable server-key support; run against a separate public-mode API with suitable quotas.
- [x] Independently sum initial balance + purchases - payments and validate ledger receipts, ownership of posting/history and original receipt identity.
- [x] Observe first browser POST201 and receipt before losing delivery; assert retry200/replay, unchanged intent key, identical receipt and one persisted entry after reload.
- [x] Keep failure control in test fixtures; expose no public administrative endpoints.

## 4. Reproducible execution evidence

Files: local verification helpers, `verify-evidence.py`, CI/Jenkins evidence handling, targeted evidence regression tests.

- [x] Archive prior logs/reports before each run and regenerate clean report scopes without deleting preserved evidence.
- [x] Retain run ID, command outcomes, start/end timestamps, HEAD and working-tree/source provenance.
- [x] Reject failed, missing, stale, skipped or incomplete required report sets; test stale-report rejection.
- [x] Save actual inventory/advisory/secret scan and configuration-validation results through the quality scope (fresh execution follows in step5).

## 5. Complete verification and review

- [x] Run focused regressions, then the complete core, public-mode automation, frontend, Java UI, Bruno, formatting/static and security gates.
- [x] Review the final diff independently; repair genuine failures without weakening assertions or disabling suites.
- [x] Record exact counts and limitations from the current run, including Jenkins runtime availability.

## 6. Existing feature branch and release evidence

- [x] Commit and push validated corrections to `feat/banking-core` (`b688e17`); retain the existing PR1.
- [x] Inspect required GitHub Actions jobs until the entire workflow passes (run38665882283); preserve failure diagnostics if repair is needed.
- [x] Pin documentation and command-center links to the verified implementation/run; the final link revision receives its own frontend and complete CI checks.
- [x] Prepare concrete isolated deployment/readiness/cost review and stop at the owner's approval boundary.

The final link revision's commit, required CI result and updated PR description are recorded on [PR1](https://github.com/farhan-shafee/creditflow-qe/pull/1), avoiding a self-referential commit link in its own source. The pinned implementation evidence remains immutable in [the execution record](../../evidence/STATUS.md).
