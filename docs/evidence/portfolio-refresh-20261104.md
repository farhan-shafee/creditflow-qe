# CreditFlow QE portfolio refresh proposal — November 4, 2026

> **Applied and published — November 4:** [Portfolio PR #4](https://github.com/farhan-shafee/farhanshafee.com/pull/4) merged as `c77adc0`; [main CI 41914070783](https://github.com/farhan-shafee/farhanshafee.com/actions/runs/41914070783) passed and Railway deployment `04a17d27-edc3-43be-a2d4-46ffb86d8a73` reached SUCCESS. The [public case study](https://farhan-shafee.com/work/creditflow-qe) contains the new evidence links and hosted capture. The proposal below is preserved as the earlier planning checkpoint; its stale checkout and unpublished status are historical.

## Historical proposal checkpoint

**PROPOSED. Portfolio files and deployment remain unchanged.**

The canonical public case study returned HTTP 200 at https://farhan-shafee.com/work/creditflow-qe; its canonical URL uses the hyphenated host. A separate request to farhanshafee.com failed in the audit environment, so no redirect, DNS ownership or availability conclusion is drawn for that different domain. Vercel's project name is not treated as domain proof.

Reviewed GitHub main: `9675cacb77518e7cf8a0d7fa4f91d3d42f72d856`. The clean local checkout remains at `b927dbe5268af808c5d2fcb56faac4ec6e381209` and is stale. Any approved edit must first re-read remote main and preserve concurrent changes.

## Proposed card

| Field | Proposed content |
| --- | --- |
| Title / status | CreditFlow QE / Active; keep its existing fourth-flagship position |
| Summary | A Java/PostgreSQL credit-card simulator with independent Cucumber and REST Assured automation, inspectable transaction receipts and four real correctness demos. |
| Stack | Preserve Java 21, Spring Boot, Cucumber, REST Assured, PostgreSQL, Maven, Playwright and GitHub Actions; add Next.js to represent the workspace |
| Source | https://github.com/farhan-shafee/creditflow-qe |
| Live demo | https://creditflow.farhan-shafee.com |
| Recorded main CI (November 4) | https://github.com/farhan-shafee/creditflow-qe/actions/runs/41886196621 |
| Recorded frontend release | https://github.com/farhan-shafee/creditflow-qe/blob/4fac13ac84565296281fed72ae6e1b1dd9b3be55/docs/evidence/financial-workspace-20261104.md |

Keep the existing CI-history, deployment/recovery, local-Jenkins and interview links. The inspection summary becomes: “Post a synthetic purchase or payment, inspect its receipt, and run four isolated correctness demonstrations backed by real HTTP responses and the saved ledger.”

Replace the case-study validation paragraphs with dated, separate facts:
- November 4 merged-main CI at b286242: 31 Java unit / 18 PostgreSQL integration; each private/public mode 31 Cucumber scenarios, 154 steps and 6 TestNG cases; 37 Java UI/BFF cases; 57 frontend tests; 7 Bruno requests / 11 checks. All 192 report and 22 command-log hashes matched.
- November 4 public acceptance at that frontend revision: five synthetic accounts / 44 requests, including a read-only navigation follow-up. Purchases, payments, replay/conflict behavior and complete saved ledgers reconciled. This establishes bounded correctness, not capacity or availability.
- Preserve October 15 Jenkins evidence as a separate earlier pinned execution. Do not relabel it as execution of b286242 or later source.

## Capture and affected files

Use the [actual hosted payment capture](financial-workspace-20261104/payment.png), SHA-256 `307ec2bc5d69c5ee4ba21650c75075fee3263203d7546810166ee2d707aeb62e`, dimensions 1440 × 1000. Add it as a new portfolio asset `public/projects/creditflow-qe/payment-20261104.png`; retain the historical image. Alt text: “CreditFlow QE hosted simulator after a synthetic purchase and payment.” Caption: “Actual November 4 public journey: 100 USD purchase, 50 USD payment, 300 USD outstanding, 700 USD available and two persisted receipts.”

The approved implementation would touch only `src/data/creditflow-project.ts`, the CreditFlow entries in `src/data/project-evidence.ts` and `src/app/llms.txt/route.ts`, the new asset, and relevant project-content assertions. Keep all other cards, design tokens, routes, statuses and historical releases. Preserve synthetic-data, AI-assistance, no-settlement and no-SLA boundaries. No fifth flagship or project rename.

Before publication: re-read the latest source/instructions, prepare and validate an isolated content diff, run the portfolio's required checks and inspect responsive rendering. A public portfolio release, its deployment target/identity and the new CreditFlow evidence deployment require the owner's separate approval. This proposal is not an applied portfolio patch.
