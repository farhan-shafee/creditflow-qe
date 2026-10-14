# Bruno collection

Run the collection in sequence; the first request provisions a fresh sandbox. Token and account ID live in Bruno runtime variables, never committed environments. A new run starts a new account.

With the project API running: `npx @usebruno/cli@4.2.1 run --env Local` from this directory. Use `--env-var baseUrl=http://api:8080` inside the Compose network. CLI installation is a project dependency/cache, not a global install. Avoid saving response bodies or authentication variables in shared reports.
