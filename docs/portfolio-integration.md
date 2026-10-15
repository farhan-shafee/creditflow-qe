# Prepared portfolio integration — not applied

## Verified destination

Existing repository: `farhan-shafee/farhanshafee.com`, local `D:\Dev\Repos\farhanshafee.com`. The Vercel project name is `farhanshafee.com`, but its verified custom domains are **farhan-shafee.com** and **www.farhan-shafee.com**. The project also has `farhanshafeecom.vercel.app`. The connected Cloudflare zone for farhan-shafee.com is active; no exact creditflow.farhan-shafee.com record exists in the read-only audit.

No existing portfolio source, deployment, or DNS record was modified.

## Existing implementation pattern

- `src/data/projects.ts` defines the shared Project type and imports CreditOps and TradeFlow records.
- `src/components/project-card.tsx` uses the shared `flagship` presentation, selected evidence links, optional reviewed screenshot, and an existing `/work/{slug}` case-study route.
- `src/app/page.tsx` uses `getFeaturedProjects()` and the existing card component.
- `src/app/work/page.tsx` explicitly selects flagship slugs; the approved change must add CreditFlow to that list rather than inventing a fifth flagship or restructuring other projects.

## Proposed fourth flagship

| Field | Proposed value |
|---|---|
| title | CreditFlow QE |
| slug | creditflow-qe |
| status | Active; update only from actual release evidence |
| category | Financial systems / Quality engineering |
| kind | personal |
| description | A synthetic credit-card ledger with transactional PostgreSQL state, independently tested through Java, Cucumber and REST Assured. |
| technologies | Java21, Spring Boot, PostgreSQL, Cucumber, REST Assured, Jupiter, TestNG, Selenium, Playwright, Next.js, Maven, GitHub Actions |
| GitHub | https://github.com/farhan-shafee/creditflow-qe |
| live URL | https://creditflow-qe-pilot.vercel.app — provider pilot verified; use https://creditflow.farhan-shafee.com only after separate DNS approval and verification |
| featured / visibility | true / public |
| inspection facts | Exact money, original receipt replay, account ownership, rollback and concurrent updates; attach only executed results |

Create a dedicated `src/data/creditflow-project.ts` following the existing TradeFlow pattern, import it into projects.ts, append it to the flagship selection, and reuse the shared card/case-study components. The reviewed, actual hosted payment screenshot is `docs/evidence/provider-pilot/payment.png`. After approval, copy it into a new portfolio asset path and reuse the existing screenshot fields. It shows a real synthetic $50 payment leaving $200 outstanding and $800 available; it contains no credentials.

The intended flagship sequence remains AegisGraph, CreditOps AI, TradeFlow, CreditFlow QE. Preserve all other project content and existing routes. The provider pilot is now validated and deployed; see [the release receipt](evidence/provider-pilot.md). This concrete integration remains unapplied and requires separate owner approval. Proposed inspection links are the verified provider demo, GitHub source, Actions 38680627735 and the pilot receipt. The card should say Active, not production banking software. Existing project summaries and routes remain intact.
