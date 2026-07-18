# Feature 001 — Fundação executável

## Resultado

Criar um monorepo que execute web, API e worker localmente, tenha health checks,
CI e os contratos mínimos para iniciar as features de negócio.

## Fora do escopo

Autenticação, entidades fiscais, importação real, regras de frete e emissão.

## Histórias

### P1 — Ambiente local

**Given** um checkout limpo e Docker disponível, **when** o desenvolvedor segue
o README, **then** web, API, worker, PostgreSQL, Redis, MinIO e Mailpit ficam
prontos sem segredo real.

### P1 — Qualidade automatizada

**Given** um pull request, **when** a CI executa, **then** lint, typecheck, testes
e build precisam passar antes do merge.

### P2 — Operabilidade

**Given** API/worker em execução, **when** health/readiness são consultados,
**then** distinguem processo vivo de dependências prontas e expõem correlation
ID nos logs.

## Critérios de aceite

- pnpm workspace e Turborepo com TypeScript strict;
- `apps/web`, `apps/api`, `apps/worker`;
- Docker Compose com Postgres, Redis, MinIO e Mailpit;
- `/health/live` e `/health/ready`;
- Pino estruturado e propagation de `x-correlation-id`;
- `.env.example` validado no startup;
- CI sem deploy e sem segredos;
- nenhuma dependência de negócio implementada.
