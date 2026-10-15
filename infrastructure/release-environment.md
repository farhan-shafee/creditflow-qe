# Release configuration contract

These files prepare a release; they do not provision or deploy anything. See `docs/deployment-readiness.md` for the owner approval gate and read-only account audit.

Railway uses repository-root `railway.toml` and `infrastructure/Dockerfile.api`. Set one replica and an approved memory/resource budget in the new service. Required server variables:

| Variable | Value source |
|---|---|
| `CREDITFLOW_BIND_ADDRESS` | `0.0.0.0` (already set in runtime image) |
| `CREDITFLOW_DB_URL` | New Neon JDBC URL with verified TLS, `sslmode=verify-full` |
| `CREDITFLOW_DB_USER` / `CREDITFLOW_DB_PASSWORD` | New isolated runtime role, provider secret configuration |
| `SPRING_FLYWAY_ENABLED` | `false` after a separately controlled owner migration |
| `CREDITFLOW_PUBLIC_MODE` | `true` |
| `CREDITFLOW_PROVISION_KEY` | Fresh random server key, minimum32 characters, shared only with this BFF |
| `CREDITFLOW_SANDBOX_QUOTA` | `20` per observed peer/hour (single-replica conservative demo limit) |
| `CREDITFLOW_REQUEST_QUOTA` | `300` per observed peer/minute |

Run Flyway migrations on the new database with a dedicated migration identity over a direct TLS connection before starting the runtime service. Apply `runtime-role.sql`; set the fresh role credential privately. No migration password belongs in runtime environment or build arguments. The application role can update the account balance and insert ledger entries, but cannot rewrite ledger entries or run migrations. Tests use a separate privileged local database to exercise controlled rollback fixtures.

Docker and Railway health probes use `/actuator/health/liveness`, which does not query PostgreSQL. In public mode, aggregate health and `/actuator/health/readiness` require `X-Sandbox-Provision-Key`; readiness includes PostgreSQL and returns 503 when it is unavailable. Use an authenticated readiness check as a separate release gate. Hikari minimum idle 0, keepalive 0 and a 60-second idle timeout allow unused connections to retire. Actual provider sleep and cold-start latency remain deployment checks.

`node infrastructure/validate-runtime-role.cjs` is a project-local verification probe, not a cloud migration command. It applies the role SQL and tests real privileges inside a transaction, with 10-second statement, 5-second lock and 30-second transaction limits beneath a 60-second client timeout, then rolls back. Its retained result must not be presented as proof of cloud role configuration. Public API automation similarly uses its own isolated Compose profile and private environment-only server key; its high quotas are not release settings.

Create a new Vercel project with root `apps/web`; its `vercel.json` pins the build commands. Required server-only variables:

| Variable | Value source |
|---|---|
| `CREDITFLOW_API_URL` | Verified HTTPS origin of the new Railway service |
| `CREDITFLOW_WEB_ORIGIN` | Exact approved HTTPS command-center origin |
| `CREDITFLOW_SESSION_SECRET` | Fresh independent random signing secret, minimum32 characters |
| `CREDITFLOW_PROVISION_KEY` | Same new server access key configured on this API |

Never set `CREDITFLOW_LOCAL_DEMO=true` in a public deployment, or expose these values through `NEXT_PUBLIC_` variables. Preview environments need their own exact origin and isolated credentials/data; do not point arbitrary previews at the public database by default.

Post-release verification must prove HTTPS, unauthorized direct API rejection, same-origin BFF writes, per-session account ownership, persistence and negative cases against the release commit. Public resource creation, deployment, DNS and portfolio edits each remain subject to the owner's explicit boundaries.
