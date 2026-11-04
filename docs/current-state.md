# CreditFlow QE — current release and evidence index

Reviewed November 4, 2026 against GitHub and Railway provider reads. This is a dated release index; it does not continuously poll production.

[Live synthetic workspace](https://creditflow.farhan-shafee.com) · [Portfolio case study](https://farhan-shafee.com/work/creditflow-qe) · [Source](https://github.com/farhan-shafee/creditflow-qe)

## Deployed components

| Component | Recorded source / deployment | State observed November 4 |
| --- | --- | --- |
| Next.js frontend | `d7658be`; Railway `e19a4383-e1ef-4568-acc4-c15cb684072e` | SUCCESS; pinned commit on `main` |
| Spring Boot API | `20c91f5`; Railway `061eba48-7344-4bb4-b44c-769374180ce7` | SUCCESS; independently pinned `feat/provider-pilot` source |
| PostgreSQL | Railway `7e6043dd-cfe8-4d20-b265-d035f83b21c3` | SUCCESS; private persistent database |
| Five-minute monitor | Railway `374ce843-286f-44ec-927c-92a57ac58d9a` | SUCCESS; recovery policy rollout recorded in [PR #6](https://github.com/farhan-shafee/creditflow-qe/pull/6) |

No staged configuration or pending deployment was observed. Later documentation commits do not change either application's pin. See the [production runbook](railway-production.md) and [configuration contract](../infrastructure/release-environment.md) for operational controls.

## Which evidence proves what?

| Record | Exact scope |
| --- | --- |
| [Workspace acceptance / PR #7](evidence/financial-workspace-20261104.md) | Frontend `b286242`, deployment `5af466c1`; five synthetic accounts / 44 requests, purchase/payment receipts, four correctness demonstrations and read-only navigation follow-up |
| [Workspace CI 41886196621](https://github.com/farhan-shafee/creditflow-qe/actions/runs/41886196621) | `b286242`: 31 Java unit / 18 PostgreSQL integration; private and public each 31 Cucumber scenarios / 154 steps / 6 TestNG cases; 37 Java UI/BFF cases; 57 frontend tests; 7 Bruno requests / 11 checks; 192 report and 22 command-log hashes matched in the recorded audit |
| [Evidence release / PR #8](https://github.com/farhan-shafee/creditflow-qe/pull/8) and [main CI 41899735083](https://github.com/farhan-shafee/creditflow-qe/actions/runs/41899735083) | Frontend `d7658be`; both full CI jobs passed. Its separate public release check used 10 read-only HTTP requests, zero accounts and zero page errors. It did not repeat the earlier financial acceptance |
| [Portfolio PR #4](https://github.com/farhan-shafee/farhanshafee.com/pull/4) and [main CI 41914070783](https://github.com/farhan-shafee/farhanshafee.com/actions/runs/41914070783) | Recorded portfolio release `c77adc0`, Railway `04a17d27-edc3-43be-a2d4-46ffb86d8a73`; SUCCESS. Candidate CI recorded 69 unit / 26 browser tests and zero full/production audit findings; the main workflow also passed |
| [Local Jenkins receipt](evidence/jenkins-execution.md) | October 15 isolated controller execution at its original pinned source; not a Jenkins execution of the November 4 workspace |

The workspace intentionally displays a **dated snapshot of `b286242` functional acceptance**. The deployed frontend `d7658be` publishes that snapshot; these are different provenance fields. The snapshot does not claim live provider health, and a later documentation-only revision is not relabeled as a new financial test. The retained screenshot and original CI reports remain attached to their executed revisions. Hosted artifacts expire; the checked-in receipts preserve dates, counts and provenance without claiming permanent download availability.

## Operations closeout

- The October 26 first scheduled daily-backup/stabilization gate passed. Five rehearsal service instances were retired October 29; protected volumes and archive storage were retained. These completed gates supersede the older October 25 pending statements.
- The reviewed October 31 archive-monitor recovery was deployed, and two distinct scheduled executions passed at November 1 01:55:48 and 02:00:49 UTC (October 31 evening in New York). The eleven historical archive failures remain recorded; new/unreviewed failures still alert. [PR #6](https://github.com/farhan-shafee/creditflow-qe/pull/6) contains the rollout observations.
- Retained Neon/Vercel resources are historical recovery resources, not active hosting or synchronized database standbys. Further retirement is a separate operational decision. Provider-side timeout resolution, future backup chains, alert delivery, sustained capacity, RPO/RTO and availability/SLA are not established by these finite checks.

This synchronization updates documentation and portfolio claims. It creates no synthetic transactions and changes no CreditFlow runtime, database, monitor, DNS, credentials or billing controls. Synthetic data only; no real cards, funds, settlement or regulatory-compliance claim.
