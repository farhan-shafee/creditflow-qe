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
| live URL | Add https://creditflow.farhan-shafee.com only after its approved deployment is verified |
| featured / visibility | true / public |
| inspection facts | Exact money, original receipt replay, account ownership, rollback and concurrent updates; attach only executed results |

Create a dedicated `src/data/creditflow-project.ts` following the existing TradeFlow pattern, import it into projects.ts, append it to the flagship selection, and reuse the shared card/case-study components. Use the reviewed screenshot from the real local UI test once available; do not use generated dashboard imagery as execution evidence.

The intended flagship sequence remains AegisGraph, CreditOps AI, TradeFlow, CreditFlow QE. Preserve all other project content and existing routes. This proposal requires owner approval after CreditFlow is validated and deployed.
