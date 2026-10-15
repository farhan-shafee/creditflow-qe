# Isolated pilot readiness, cost and completed approvals

For the 2026-10-15 21:23–21:26 UTC read-only follow-up, see the [maintenance/operator handoff](maintenance-handoff.md). Railway/Neon identities and settings were read back; current Vercel project/deployment access and target cost/spending-control fields remain blocked or unavailable. The balances and release validations below describe their original preflight/release timestamps, not a new invoice or current Vercel readback. No provider configuration changed in this maintenance pass.

The owner approved the isolated provider-URL pilot. Fresh Railway, Neon Free and Vercel resources are now deployed and verified; see [component commits, tests, limits and retained failures](evidence/provider-pilot.md). The separately approved custom-domain release is now verified at https://creditflow.farhan-shafee.com, with one DNS-only CNAME and its production origin update. See the [actual custom-domain receipt](evidence/custom-domain.md). The separately approved [portfolio integration](portfolio-integration.md) is merged, deployed and verified. [Current release and dependency-closure evidence](evidence/portfolio-lint-remediation.md) records the verified portfolio source and clean audits. The [hosted banking release record](evidence/completion.md) retains the later frontend release and actual local Jenkins execution.

## Approved pilot scope

| Service | New isolated resource | Verified controls |
|---|---|---|
| Railway | One CreditFlow API project/service | One replica, no volume, verified 0.5 vCPU / 500,000,000-byte RAM ceilings, serverless enabled |
| Neon | One Free PostgreSQL project | Primary 0.25 CU, no extra active compute branches, separate migration/runtime identities, five-minute scale-to-zero |
| Vercel | One project rooted at `apps/web` | Verified existing Pro plan / Owner seat; no new plan or seat, provider HTTPS origin, server-only API URL and fresh signing/provision keys |

Before provisioning, signed-in read-only preflight verified Railway Hobby active ($0.46 usage, $5 included usage), Vercel Pro active with an Owner seat ($0.78 of $20 usage credit used), and Neon Free eligibility/capacity. Supported Railway limits were checked and read back. No subscription upgrade, deploying-seat purchase, shared spending-policy change or existing project edit occurred. These are preflight balances, not final invoice figures. Stop for revised approval if later constraints require a paid plan or new infrastructure.

A local Docker sample during the fresh core run measured 169.5 MiB for the private API and 179.2 MiB for the public API under their configured 512 MiB limits. This supports testing a 512 MB service footprint. It is one sample, not a peak-memory, sustained-load or cloud cold-start guarantee.

## Published prices checked 2026-10-14

| Provider | Published terms | Cost implication |
|---|---|---|
| [Railway](https://docs.railway.com/pricing/plans) | RAM $10/GB-month, CPU $20/vCPU-month, egress $0.05/GB. Hobby $5/month includes $5 usage; Pro $20 includes $20 usage. | Continuous 0.5 GB with average 0.25 vCPU is roughly $10 compute; 10 GB egress adds $0.50. Continuous 1 vCPU plus 0.5 GB is roughly $25 compute. Actual activity, subscription and unused credits are unknown; included credit is not charged twice. |
| [Neon Free](https://neon.com/docs/introduction/plans) | 100 CU-hours/project/month, 1 GB/project, 5 GB public transfer/project; 20 GB total storage across Free projects; mandatory five-minute sleep. | 0.25 CU × 400 active hours consumes 100 CU-hours. An always-awake compute exceeds that allowance. Check existing-account capacity. Exhausted compute/network limits can suspend service; storage limits constrain increases. |
| [Neon Launch](https://neon.com/docs/introduction/plans), only if separately approved | No monthly minimum; compute $0.106/CU-hour, storage $0.35/GB-month, plus applicable extra usage. | Do not silently upgrade when Free capacity is exhausted. |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | $0 for eligible personal/noncommercial use; 4 active CPU hours, 360 GB-hours memory, 1M function calls, 100 GB transfer, 10 GB origin transfer. | Verify eligibility and remaining included usage. Most Hobby overages wait for reset. |
| [Vercel Pro](https://vercel.com/docs/plans/pro-plan), existing plan used by this approved pilot | $20/month platform/one deploying seat with $20 usage credit; extra deploying seats $20. [Function rates](https://vercel.com/pricing) vary by region. | Published starting rates are $0.128/CPU-hour, $0.0106/GB-hour memory, $0.60/M invocations. No new plan/seat is included in this pilot. |

Approved planning allowance: **$15/month, review near $10**. This is not an enforced cap. Railway readback confirms one replica capped at 0.5 vCPU and 500,000,000 bytes RAM. Continuous full use is roughly $15/month compute at the published rates, plus network traffic; included credits and actual consumption affect invoices. Sampled cloud memory peaked at 0.182665216 GB in the retained one-hour window. This is not a sustained-load or cost guarantee.

Railway's workspace hard limit shuts down workspace workloads. [Vercel Spend Management](https://vercel.com/docs/spend-management) is a Pro/Enterprise control, affects production deployments across the team, leaves previews running, can be delayed and excludes some charges. The pilot uses the existing Pro plan; these are shared team controls and were not changed. Changing shared billing controls could affect existing projects and requires separate approval.

## Technical release gates

- A green required Actions workflow for the approved release commit, with source-bound reports, full inventory/advisory/secret checks and generated coverage. See [actual execution status](evidence/STATUS.md). Jenkins syntax parsing is not a server run; the separate [actual local controller receipt](evidence/jenkins-execution.md) now verifies 123 published cases and 32 framework tests at pinned source.
- Run Flyway with a dedicated migration identity on a direct verified-TLS database connection. Apply restricted runtime grants, set a new private credential and disable runtime Flyway after migration. The local role probe verifies allowed inserts/balance update/read and denied direct ledger update/delete, expiry update and schema creation; it rolls back under bounded database/client timeouts. It does not claim a deployed Neon role.
- Use fresh project-only server keys, never another project's credentials/data. Public mode requires the server key plus account ownership. Keep conservative public quotas; high automation quotas belong only to the isolated test environment.
- Railway/Docker probes use `/actuator/health/liveness`. Aggregate/database readiness requires the server key in public mode at `/actuator/health/readiness`. Release checks must verify both; liveness alone does not certify database readiness.
- Configure exact HTTPS frontend origin, server-only API URL, independent signed HttpOnly session secret and provision key. Disable local-demo mode publicly. Verify same-origin writes, ownership isolation, exact posting/replay/persistence, bounded sessions/quotas, errors, logs and commit/image provenance.
- Verify HTTPS and cold starts using provider URLs before considering DNS. The original 8-second BFF deadline failed a real cold request; the corrected 20-second deadline beneath a 30-second Vercel function limit succeeded in 14,767 ms. The database connection timeout remains 5 seconds. [Neon sleeps after five inactive minutes](https://neon.com/docs/introduction/scale-to-zero); a query wakes it. [Railway serverless](https://docs.railway.com/deployments/serverless) depends on outbound inactivity, usually 5–10 minutes. Pools/telemetry can prevent sleep. Local minimum-idle 0/keepalive 0 and idle retirement permit empty pools; they are not proof of cloud sleep or a guaranteed bill.

## Approval scope after release

The custom-domain approval has been exercised: the new CNAME, exact production origin, HTTPS, redirect and banking/UI flows are verified. See the [actual release](evidence/custom-domain.md). The separately approved [portfolio integration](portfolio-integration.md) has also been exercised and verified. Deletion of the unused bootstrap role whose password is disabled remains a separate decision. System installation, shared billing changes and unrelated resources remain outside this release. Browser Use still requires explicit permission.
