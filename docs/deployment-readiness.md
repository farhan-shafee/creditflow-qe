# Deployment preparation — approval required

No cloud project, database, public service, DNS record or portfolio change has been created for CreditFlow QE.

## Proposed isolated release

| Service | Proposed resource | Boundaries |
|---|---|---|
| Railway | New creditflow-qe project and banking-api service | Java21 image, one replica, 512MB memory target, health endpoint, no CreditOps service edits |
| Neon | New creditflow-qe PostgreSQL project | Fresh migration identity, least-privilege runtime role, no existing database or credential reuse |
| Vercel | New creditflow-qe project, root apps/web | Server-only API URL, session signing key and provision key; no NEXT_PUBLIC credentials |
| Cloudflare | One creditflow.farhan-shafee.com record | Use the exact target returned for the new Vercel project; no unrelated record edits |

Read-only account discovery confirmed connected Railway workspaces, Neon organizations, Vercel projects and the active Cloudflare zone. Vercel domain lookup succeeded by project name; its initial explicit team/id lookup returned 404. This difference must be resolved before any mutation. Existing Vercel project `farhanshafee.com` actually serves farhan-shafee.com, verified by its domain records.

## Release gate

- A green core Actions run tied to the release commit, real UI journeys, secret/dependency scans and generated coverage.
- Bounded session creation and mutation traffic, bounded synthetic retention, protected backend provisioning, same-origin frontend writes and signed HttpOnly cookies.
- Dedicated migration credentials on a direct verified-TLS database connection. Runtime credentials must have no DDL or ledger-update permissions; disable runtime Flyway after migration.
- Unique server-only secrets generated for this project and stored in provider secret configuration, never in source/logs/arguments.
- Actual provider plan, resource limits, spend controls and incremental cost reviewed. Do not change a workspace-wide spending policy that would affect existing projects without separate authorization.
- Public verification after approved creation: HTTPS, health, ownership isolation, session limits, persistence, frontend/API communication, errors, logs and exact commit provenance.

## Cost review inputs

Current provider pricing must be checked again immediately before approval. Railway bills resource usage; its published RAM rate is $10/GB-month, so a continuously occupied 0.5GB service corresponds to roughly $5/month in RAM before CPU/egress and any plan credit. This is an estimate, not an enforced cap. Neon has a connected console-managed Free organization, but a new project's exact plan/limits must be confirmed. Vercel's current team plan and available included usage must be verified; do not activate a paid plan for this project without authorization.

Sources checked 2026-10-14: https://docs.railway.com/pricing/plans ; https://docs.railway.com/pricing/cost-control ; https://neon.com/blog/neon-free-plan-1-gb-per-project ; https://vercel.com/pricing . No spend ceiling is claimed until a provider confirms it.

## Host JDK choice

The local project currently uses a project-scoped Java21 Docker image. This does not install or upgrade Windows software. A host JDK21 remains optional for VS Code debugging. If approved, use Eclipse Temurin21 from Adoptium through `winget install --exact --id EclipseAdoptium.Temurin.21.JDK`, after inspecting that package's publisher/source/version. Do not run the installation until approved, then set Java21 only for this project before considering global defaults.
