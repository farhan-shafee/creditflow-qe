# Isolated release readiness and cost review — approval pending

No CreditFlow cloud resource, public deployment, DNS or existing portfolio change has been made. This proposal starts on provider HTTPS URLs. Custom DNS and portfolio integration remain separate approvals.

## Proposed pilot

| Service | New isolated resource | Proposed controls |
|---|---|---|
| Railway | One CreditFlow API project/service | One replica, no volume, 512 MB memory target, supported and approved CPU/RAM ceilings, serverless enabled |
| Neon | One Free PostgreSQL project | Primary 0.25 CU, no extra active compute branches, separate migration/runtime identities, five-minute scale-to-zero |
| Vercel | One project rooted at `apps/web` | Eligible existing Hobby/already approved plan, provider HTTPS origin, server-only API URL and fresh signing/provision keys |

No subscription upgrade, deploying-seat purchase, shared workspace spending-policy change or existing project edit is included. Account plans, available credits, capacity and billing-cycle balances have not been verified in this finish session; the connector metadata does not expose Railway billing details. Confirm them before any billable mutation. Stop for a revised decision if the selected plans/resource controls cannot support the approved budget.

A local Docker sample during the fresh core run measured 169.5 MiB for the private API and 179.2 MiB for the public API under their configured 512 MiB limits. This supports testing a 512 MB service footprint. It is one sample, not a peak-memory, sustained-load or cloud cold-start guarantee.

## Published prices checked 2026-10-14

| Provider | Published terms | Cost implication |
|---|---|---|
| [Railway](https://docs.railway.com/pricing/plans) | RAM $10/GB-month, CPU $20/vCPU-month, egress $0.05/GB. Hobby $5/month includes $5 usage; Pro $20 includes $20 usage. | Continuous 0.5 GB with average 0.25 vCPU is roughly $10 compute; 10 GB egress adds $0.50. Continuous 1 vCPU plus 0.5 GB is roughly $25 compute. Actual activity, subscription and unused credits are unknown; included credit is not charged twice. |
| [Neon Free](https://neon.com/docs/introduction/plans) | 100 CU-hours/project/month, 1 GB/project, 5 GB public transfer/project; 20 GB total storage across Free projects; mandatory five-minute sleep. | 0.25 CU × 400 active hours consumes 100 CU-hours. An always-awake compute exceeds that allowance. Check existing-account capacity. Exhausted compute/network limits can suspend service; storage limits constrain increases. |
| [Neon Launch](https://neon.com/docs/introduction/plans), only if separately approved | No monthly minimum; compute $0.106/CU-hour, storage $0.35/GB-month, plus applicable extra usage. | Do not silently upgrade when Free capacity is exhausted. |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | $0 for eligible personal/noncommercial use; 4 active CPU hours, 360 GB-hours memory, 1M function calls, 100 GB transfer, 10 GB origin transfer. | Verify eligibility and remaining included usage. Most Hobby overages wait for reset. |
| [Vercel Pro](https://vercel.com/docs/plans/pro-plan), only if separately approved | $20/month platform/one deploying seat with $20 usage credit; extra deploying seats $20. [Function rates](https://vercel.com/pricing) vary by region. | Published starting rates are $0.128/CPU-hour, $0.0106/GB-hour memory, $0.60/M invocations. No new plan/seat is included in this pilot. |

Proposed attributable pilot allowance: **$15/month, review near $10**. This is a planning budget, not an enforced cap. The 0.25 vCPU example is average consumption, not a verified admissible service limit. Railway documents [per-replica ceilings](https://docs.railway.com/pricing/cost-control) but not numeric minimum/granularity in the reviewed service contract. Confirm supported settings and readback before deployment. A continuously occupied 1 vCPU/0.5 GB footprint already costs about $25 compute and would require lower consumption or revised approval.

Railway's workspace hard limit shuts down workspace workloads. [Vercel Spend Management](https://vercel.com/docs/spend-management) is a Pro/Enterprise control, affects production deployments across the team, leaves previews running, can be delayed and excludes some charges. It does not protect the proposed Hobby workload. Changing shared billing controls could affect existing projects and requires separate approval.

## Technical release gates

- A green required Actions workflow for the approved release commit, with source-bound reports, full inventory/advisory/secret checks and generated coverage. See [actual execution status](evidence/STATUS.md). Jenkins syntax parsing is not a Jenkins server run.
- Run Flyway with a dedicated migration identity on a direct verified-TLS database connection. Apply restricted runtime grants, set a new private credential and disable runtime Flyway after migration. The local role probe verifies allowed inserts/balance update/read and denied direct ledger update/delete, expiry update and schema creation; it rolls back under bounded database/client timeouts. It does not claim a deployed Neon role.
- Use fresh project-only server keys, never another project's credentials/data. Public mode requires the server key plus account ownership. Keep conservative public quotas; high automation quotas belong only to the isolated test environment.
- Railway/Docker probes use `/actuator/health/liveness`. Aggregate/database readiness requires the server key in public mode at `/actuator/health/readiness`. Release checks must verify both; liveness alone does not certify database readiness.
- Configure exact HTTPS frontend origin, server-only API URL, independent signed HttpOnly session secret and provision key. Disable local-demo mode publicly. Verify same-origin writes, ownership isolation, exact posting/replay/persistence, bounded sessions/quotas, errors, logs and commit/image provenance.
- Verify HTTPS and cold starts using provider URLs before considering DNS. The BFF 8-second and database 5-second connection timeouts need testing against actual cold starts. [Neon sleeps after five inactive minutes](https://neon.com/docs/introduction/scale-to-zero); a query wakes it. [Railway serverless](https://docs.railway.com/deployments/serverless) depends on outbound inactivity, usually 5–10 minutes. Pools/telemetry can prevent sleep. Local minimum-idle 0/keepalive 0 and idle retirement permit empty pools; they are not proof of cloud sleep or a guaranteed bill.

## Smallest next approval

Approve only the isolated provider-URL pilot above, with fresh resources/secrets and the proposed planning budget, subject to plan/capacity and resource-limit preflight. Stop before provisioning if those checks cannot support the agreed constraints. Public provisioning/deployment requires this approval. DNS, existing portfolio edits, system installation, shared billing-policy changes and unrelated resources remain outside it. Browser Use/cloud browser still requires its own explicit permission and is not needed for the local Java suites.
