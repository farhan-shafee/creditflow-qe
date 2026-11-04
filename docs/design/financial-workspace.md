# CreditFlow QE — Ledger Studio

## Starting point and direction

Baseline: main `5b65732a9ce8fd77ea0052215d1d8f6156629441`, independently checked against origin on November 4. The checkout was clean; other worktrees are preserved. Work uses `feat/financial-workspace` in the clean existing checkout, retaining its project-scoped Compose tooling.

Actual local desktop/mobile captures were saved and inspected before redesign. The existing forest sidebar, warm paper and emerald identity work well. The 14px body, tiny labels, permanently selected first link, absent mobile navigation and long landing-page proportions make the engineering workspace harder to read and demonstrate.

Chosen direction: **Ledger Studio**, a calm financial engineering workspace. Retain the headline and identity; make precise balances, request outcomes and Java/Cucumber source evidence the organizing content. A compact introduction leads directly into the simulator. The guided browser lab and release evidence are separate destinations. Avoid a chart-heavy dashboard, decorative banking claims, extra frameworks or fabricated metrics.

## Foundation

- Self-host Inter 4.1 variable (SIL Open Font License included), one UI family; system monospace for code. Font source: official `rsms/inter` tag `v4.1`, `docs/font-files/InterVariable.woff2`; SHA256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`.
- Body approximately 16–17px, supporting copy 13–14px, tabular financial figures, readable 14px code and tables. Headings express task hierarchy rather than tiny uppercase section labels alone.
- Forest navigation, warm off-white canvas, white panels, emerald outcomes, restrained borders, consistent 8px spacing rhythm and at least 44px primary control targets. Visible keyboard focus throughout.
- Desktop sidebar and accurate active anchors; mobile modal navigation with focus containment and restoration. Old `#overview`, `#simulator`, `#api`, `#automation`, `#architecture`, `#interview` targets survive; add `#lab` and `#evidence`.

## Product behavior

- Simulator: backend-authoritative exact decimal strings; immutable intent/key retained across an ambiguous response. Confirmed posting plus failed refresh offers refresh only. Reconciliation of an uncertain intent does not authorize a new identity.
- Inspector: sanitized observed application request/response, real HTTP status/replay flag, browser-measured HTTP round trip, structured errors and returned receipt snapshots. No credential/header dumps, invented backend time or inferred transaction failure.
- Details: native accessible dialog for an observed exchange or selected immutable ledger receipt; copy sanitized JSON; no fabricated HTTP metadata for historical ledger entries.
- Correctness lab: separate HttpOnly account session, deterministic fresh opening state, four sequential bounded real API demonstrations, exact balances and ledger checks, explicit expected/observed outcomes and source links. It does not execute Cucumber. Unknown/interrupted results remain inconclusive; manual retry keeps identity. Existing origin, ownership, expiry, quota and provisioning controls remain intact.
- Evidence: validated static read-only snapshot. Distinguish recorded deployed revisions, artifact-verified main CI and historical baselines. Show dates, provenance, availability and staleness; never poll GitHub/provider APIs per visitor.
- Motion: ordinary transitions 180ms, restrained dialog entry, brief newly confirmed ledger highlight, stable loading space. Reduced-motion preference removes nonessential transitions/animation.

## Validation and release boundary

Behavioral RED/GREEN tests precede new domain/client helpers. Reuse real PostgreSQL/Java browser automation, strengthen trace redaction for the separate lab cookie, and retain independent API suites. Inspect actual desktop/tablet/mobile, 200% zoom, keyboard, reduced-motion, loading/empty/error/success screenshots. Freeze source for each repository evidence scope; preserve failures. Full CI must pass before handoff.

Commit/push a feature branch and open a PR with actual before/after screenshots and source-bound results. No merge, deployment, provider/DNS/spending changes, system installation, portfolio edit or Browser Use. A separate deployment/rollback plan will identify exact revisions, approval scope, smoke checks and rollback boundaries.
