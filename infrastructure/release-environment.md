# Current Railway release configuration contract

Reviewed October 25, 2026. The canonical web, original API and live PostgreSQL are on Railway. See [production topology, source pins, backup/recovery and pending closeout](../docs/railway-production.md). Earlier Vercel/Neon pilot settings are historical.

## Per-service builds and source

- API: pinned `20c91f5e10658ab4ce3ec7f2727c8a4934f5b314`, repository-root `infrastructure/Dockerfile.api`.
- Web: pinned `7a16b50b595d01c735ae566e9737b24b6121eaf6`, `infrastructure/Dockerfile.web` in that release. Do not infer an automatic main release.
- Keep separate Dockerfile selection for each service; do not add an auto-discovered root API config that overrides the web build.
- Both application services have one replica with 0.5 vCPU / 500,000,000-byte configured ceilings. API sleep is disabled; web sleep remains enabled.
- API health uses `/actuator/health/liveness`; separately verify protected `/actuator/health/readiness`. Web health is `/` on port 3100.

## API variables

| Variable                                        | Current purpose / handling                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CREDITFLOW_BIND_ADDRESS`                       | `0.0.0.0`                                                                                                                   |
| `CREDITFLOW_DB_URL`                             | Private Railway PostgreSQL JDBC destination, verify-full TLS, hostname validation and dedicated CA trust; resolve privately |
| `CREDITFLOW_DB_USER` / `CREDITFLOW_DB_PASSWORD` | Project-only restricted runtime identity; never publish values                                                              |
| `CREDITFLOW_DB_CA_B64`                          | Project CA material resolved privately to the startup trust file                                                            |
| `SPRING_FLYWAY_ENABLED`                         | `false`; schema migration is administrative                                                                                 |
| `CREDITFLOW_PUBLIC_MODE`                        | `true`                                                                                                                      |
| `CREDITFLOW_PROVISION_KEY`                      | Independent server key shared only with this BFF                                                                            |
| `CREDITFLOW_SANDBOX_QUOTA`                      | Conservative public provisioning quota                                                                                      |
| `CREDITFLOW_REQUEST_QUOTA`                      | Conservative public request quota                                                                                           |

The current startup writes its private trust file with restrictive permissions, then starts Java. Never log variables, connection URLs, signing secrets, keys or database rows. Keep the database private with no public SQL proxy. Runtime grants/RLS allow intended ledger posting and expired-account cleanup, deny direct ledger rewriting and protect active accounts. Never grant migration ownership to the running API.

Liveness does not query PostgreSQL; protected readiness does. The BFF has a bounded backend deadline. Former Neon sleep and Vercel function-limit measurements belong to the dated pilot and do not describe the current deployment.

## Frontend variables

| Variable                    | Current purpose / handling                                |
| --------------------------- | --------------------------------------------------------- |
| `CREDITFLOW_API_URL`        | Server-only HTTPS origin of the original Railway API      |
| `CREDITFLOW_WEB_ORIGIN`     | `https://creditflow.farhan-shafee.com`                    |
| `CREDITFLOW_SESSION_SECRET` | Independent private signing secret                        |
| `CREDITFLOW_PROVISION_KEY`  | Same project-only server access key configured on the API |

Never set `CREDITFLOW_LOCAL_DEMO=true` publicly or expose server values through `NEXT_PUBLIC_*`. Keep signed HttpOnly cookies, exact-origin mutations, per-account ownership, request/body caps and conservative quotas. Rehearsals need isolated data and their own intended origins/configuration.

## Verification and recovery

After an authorized release, require terminal SUCCESS at the approved pinned SHA, canonical HTTPS, unauthorized API rejection, protected readiness, session isolation and bounded error/5xx/capacity checks. Mutating production canaries need an explicitly authorized synthetic scope.

The local runtime-role validator and fault-injection harness target disposable owned local databases; their command presence is not proof of current cloud grants. Keep those tests separate from read-only production review.

Production PostgreSQL uses a 1,024 MB volume, off-volume pgBackRest full/differential backups and WAL archiving. First scheduled daily-backup verification and stabilization remain open as of October 25. Retain frozen Neon, Vercel and rehearsals until those gates pass and retirement is separately approved. After Railway writes, stale Neon is not a synchronized rollback destination.
