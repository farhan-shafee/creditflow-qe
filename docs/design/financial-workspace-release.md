# Frontend release and rollback plan — separate approval required

> **Release completed — November 4:** [PR #7](https://github.com/farhan-shafee/creditflow-qe/pull/7) was merged and the workspace accepted at `b286242`. The later evidence refresh is deployed at `d7658be`. See the [current release index](../current-state.md) for exact deployment identities and distinct checks. The original plan below is historical; a future application release still requires its own reviewed source and release scope.

## Historical pre-release plan

This plan authorizes no release. The feature PR remains unmerged and production is unchanged. Select the exact approved 40-character frontend commit after reviewing its complete Actions run and screenshots. Keep the Spring Boot API, PostgreSQL, schema, DNS, secrets, limits, spending controls and portfolio unchanged.

## Preflight for an approved frontend-only release

1. Re-read [Railway production topology](../railway-production.md) and current provider state using read-only access. The October 25 record pins frontend `7a16b50b595d01c735ae566e9737b24b6121eaf6` and API `20c91f5e10658ab4ce3ec7f2727c8a4934f5b314`; these records do not establish today's deployed revision.
2. Record the actual current frontend deployment ID, source/image, successful health state and rollback eligibility. Confirm the existing service, environment and custom-domain alias. Stop if identities or access are unclear.
3. Verify the approved frontend commit has passing core/browser workflow jobs and intact source-bound artifacts, including the expanded workspace journeys. Build with the existing `infrastructure/Dockerfile.web`; fonts are self-hosted and no new runtime service is required.
4. Reuse the existing server-only API URL, signing secret, provision key and canonical origin through the existing secret-managed release mechanism. Do not print or rotate them. No new environment variable, database migration or quota increase is required. Both simulator and lab use expiring signed HttpOnly sessions; lab cookies are scoped to `/api/lab`.
5. Confirm the exact release/rollback actions and smoke-test allowance with the owner before changing the frontend service. Do not enable automatic production deployments as part of this PR.

## Bounded checks after that separate approval

- Verify exact deployed frontend source, HTTPS/canonical host, asset/font loading and unchanged backend source. Inspect desktop/mobile navigation and request-time evidence freshness.
- Use at most **five synthetic accounts and sixty HTTP requests total**, sequentially, within existing quota headroom: one simulator account and the four isolated lab demos. Stop on rate limits or availability errors; never relax protections or run the full local browser suite against production.
- Check real purchase/payment receipts, safe same-identity replay, conflict/no duplicate posting, expected insufficient-credit rejection, session isolation and sanitized inspector data. Inspect read-only liveness; database readiness stays protected and uses the established operator mechanism if needed.
- Record actual timestamps, component identities, outcomes and failures. Update the saved evidence snapshot only from observed source-bound results. A green feature CI commit alone is not production verification.

## Frontend rollback

If the approved release has broken navigation/assets, changed banking behavior, leaked sensitive data or cannot complete the bounded checks, stop further mutations and use the existing provider rollback/redeploy mechanism for the **previously recorded successful frontend deployment only**. Re-verify source, alias, HTTPS, liveness and a separately authorized bounded account check. Preserve the failed release evidence.

The API/database remain untouched, so this plan includes no schema rollback or data reset. New lab cookies are ignored by the previous frontend; leave the session signing secret unchanged. Do not select a failed build as a fallback, assume the October source is still eligible, delete resources or change DNS. If database, credentials, provider access or backend recovery is implicated, stop for separately scoped approval.
