# Evidência — Feature 001

Data: 2026-07-18

## Gates

| Gate                  | Resultado                                  |
| --------------------- | ------------------------------------------ |
| Prettier              | aprovado                                   |
| ESLint type-aware     | 8/8 workspaces                             |
| TypeScript strict     | 13/13 tasks                                |
| Vitest                | 8 testes aprovados                         |
| Build                 | 8/8 workspaces; Next static route gerada   |
| Docker Compose config | válido                                     |
| Infraestrutura local  | PostgreSQL, Redis, MinIO e Mailpit healthy |

## Smoke test

- `GET api:/health/live` → `200`, `status=ok`;
- `GET api:/health/ready` → `200`, database/redis `up`;
- `GET worker:/health/live` → `200`, `status=ok`;
- `GET worker:/health/ready` → `200`, database/redis `up`;
- correlation ID `smoke-foundation-001` retornado no header e registrado no
  log estruturado da API;
- API e worker encerrados com `SIGINT`, usando hooks de shutdown do Nest.

## Escopo

Nenhuma entidade, regra ou operação fiscal foi adicionada. Emissão fiscal real
permanece desabilitada por padrão.
