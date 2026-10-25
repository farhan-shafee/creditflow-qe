# Portfolio integration — merged, deployed and verified

> **Historical integration record (October 15, 2026).** The portfolio now runs on Railway; its old Vercel deployment no longer owns canonical traffic. See [current CreditFlow hosting](railway-production.md) and the [current portfolio deployment matrix](https://github.com/farhan-shafee/farhanshafee.com/blob/main/docs/PROJECT_DEPLOYMENTS.md). The source/test/deployment claims and card JSON below are snapshots of that earlier release.

The fourth flagship remains live at https://farhan-shafee.com/work/creditflow-qe. The repository and Vercel project are named farhanshafee.com; the actual public domain is farhan-shafee.com.

At the October 15 portfolio release, [PR #2](https://github.com/farhan-shafee/farhanshafee.com/pull/2) merged as 7cf155efa7ec7567a3aa7c2baa031722e971a915; native Git deployment dpl_8GMzv1fz6A76G9CnhLkFSJyFsB8j was READY and owned the then-current aliases. The tested feature, executed PR merge and actual main merge have identical source trees. Both PR and main Actions passed 63 unit and 26 browser tests, build/types/lint/format and full/production npm audits with zero findings. Protected preview (10), public HTTPS/content (19) and actual mobile/desktop journeys (2) passed. Final source scan: 164 files, Gitleaks zero findings.

The [dated dependency closure and receipts](evidence/portfolio-lint-remediation.md) explain the reviewed local Next lint fork, preserved upstream rules, failure history and maintenance obligation. Application source, articles, images and project order are unchanged by this tooling fix. AegisGraph, CreditOps AI, TradeFlow and CreditFlow QE remain the four flagships, followed by the same four supporting projects.

The earlier [PR #1](https://github.com/farhan-shafee/farhanshafee.com/pull/1) at 5c52f226 and [completion record](evidence/completion.md) preserve the initial integration, runtime YAML cleanup and actual local Jenkins evidence. Their former five-entry development-tool REVIEW status is historical and superseded by the new closure. The [card record](portfolio-creditflow-card.json) preserves the October 15 verified integration snapshot; it is not the current deployment record.

CreditFlow application services and DNS were unchanged. No new plan, resource limit, credential, system software or unrelated project changed. Synthetic-data, AI-assistance, cold-start and sustained-load/availability limitations remain accurately documented.
