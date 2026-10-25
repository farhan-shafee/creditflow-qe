# Railway frontend pilot

The monorepo has two independent Dockerfiles. Set each service's build configuration explicitly.

| Service | Dockerfile | Port | Healthcheck |
| --- | --- | --- | --- |
| Banking API | infrastructure/Dockerfile.api | 8080 | /actuator/health/liveness |
| Command center | infrastructure/Dockerfile.web | 3100 | / |

The historical API-only root railway.toml is retained as infrastructure/railway.api.toml for reference. Keeping it at the repository root caused the frontend pilot to build the API image even while its service configuration selected Dockerfile.web. The reference file is not a deployment control or an instruction to opt into deprecated Config as Code.

Configure the web service's RAILWAY_DOCKERFILE_PATH to infrastructure/Dockerfile.web as well as its Dockerfile build setting. Retain production-mode session signing, the server-only provisioning key, exact HTTPS CREDITFLOW_WEB_ORIGIN and an HTTPS CREDITFLOW_API_URL. Do not enable CREDITFLOW_LOCAL_DEMO on a public URL.

Use an isolated environment, API and disposable database for tests that create accounts or post transactions. Keep current Vercel hosting, custom DNS, public API and Neon database unchanged during the pilot.

Authenticated API readiness must pass separately from liveness. Verify secure HttpOnly SameSite cookies, exact Origin/Host checks, account ownership, original idempotent receipts, reconciliation and browser workflows before proposing any production traffic change.

This source change does not switch a domain or migrate a database. Existing service source pins remain unchanged until an independently reviewed release changes them.
