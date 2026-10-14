# CreditFlow QE

A simulated credit-card ledger and independent Java quality engineering framework for hands-on financial-services interviews. Synthetic data only; no card numbers, real customers, settlement, or money movement.

## Build status

Bootstrap in progress. Execution evidence is recorded in `docs/evidence/STATUS.md`; unexecuted components are never presented as passing. Public deployment is pending owner approval.

## Toolchain

Java 21, Maven Wrapper (3.9.11), Spring Boot, PostgreSQL, Cucumber JVM, REST Assured and JUnit. Windows development path: `D:\Dev\Repos\creditflow-qe`.

Docker-based Java 21 builds avoid modifying the host JDK or existing services. See `docs/architecture/core-design.md` and `docs/superpowers/plans/2026-10-14-creditflow-core.md`.
