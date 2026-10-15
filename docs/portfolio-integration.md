# Portfolio integration — merged, deployed and verified

The approved fourth flagship is live at https://farhan-shafee.com/work/creditflow-qe. The repository and Vercel project are named farhanshafee.com; the actual public domain is the hyphenated farhan-shafee.com.

[Portfolio PR #1](https://github.com/farhan-shafee/farhanshafee.com/pull/1) is merged as 5c52f2265bf204cbb0a027c487794c57553f255d. Its source tree equals the tested feature head 2c48fb1a4bf8b47a7a616d6ce28765e03e91fab6. Native Git deployment dpl_3xfGi5VMGGFBtzvXddzH1e771ZYQ reached READY and owns the existing public aliases. The original local main checkout was fast-forwarded cleanly. [Current completion evidence](evidence/completion.md) supersedes the [initial portfolio snapshot](evidence/portfolio-integration.md), which remains intact.

The existing card, inspection panel, case-study route and design patterns were reused. AegisGraph, CreditOps AI, TradeFlow and CreditFlow QE remain the four flagships, followed by the same four supporting projects. Existing pages and articles retain their behavior. The original real synthetic-payment screenshot is unchanged. The [applied card JSON](portfolio-creditflow-card.json) records the actual main merge and deployment.

The later authorized follow-up replaced inherited runtime frontmatter dependencies and updated Jenkins copy to reflect the actual local controller run, with 123 published cases and 32 separate framework tests. It retains synthetic-data, AI-assistance, cold-start, sustained-load and availability limitations.

Validation: 42 unit tests; 26 full local browser tests at the parser revision and 4 affected checks after the Jenkins-copy update; build, TypeScript, ESLint and Prettier; 99-file Gitleaks scan with 0 findings. Ten protected-preview checks, 19 public HTTPS/content checks and two mobile/desktop public journeys passed. Production npm audit is clean; full audit remains REVIEW with five unpatched high-severity development-tool affected-package entries in the upstream Next ESLint/fast-glob/micromatch/braces chain. No override or lint suppression masks them.

No plan, resource limit, DNS, credential, system software or unrelated project was changed by this follow-up. Future unrelated changes remain outside the completed scope.
