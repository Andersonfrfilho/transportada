# Tasks — Fundação

- [x] T001 Criar workspace pnpm/Turbo e configuração TypeScript raiz.
- [x] T002 [P] Criar `packages/config` com schema Zod e testes.
- [x] T003 [P] Criar `packages/observability` com Pino/correlation ID e testes.
- [x] T004 [P] Criar `packages/database` com Prisma vazio e conexão.
- [x] T005 [P] Criar `packages/queue` com conexão Redis/BullMQ.
- [x] T006 Criar API NestJS com live/readiness.
- [x] T007 Criar worker NestJS com live/readiness interno e shutdown gracioso.
- [x] T008 Criar web Next.js com tela mínima de status.
- [x] T009 Criar Docker Compose para Postgres, Redis, MinIO e Mailpit.
- [x] T010 Criar scripts de dev, lint, typecheck, test e build.
- [x] T011 Criar CI GitHub Actions com cache pnpm.
- [x] T012 Documentar bootstrap e troubleshooting.
- [x] T013 Executar todos os gates e registrar evidência.
- [x] T014 Padronizar bootstrap e infraestrutura local via Makefile com
      `PROJECT_NAME`.

## Roteamento de modelos

| Task | Executor recomendado           |
| ---- | ------------------------------ |
| T001 | Sonnet                         |
| T002 | Sonnet                         |
| T003 | Sonnet                         |
| T004 | Sonnet                         |
| T005 | Sonnet                         |
| T006 | Sonnet                         |
| T007 | Sonnet                         |
| T008 | Sonnet                         |
| T009 | Haiku                          |
| T010 | Haiku                          |
| T011 | Sonnet                         |
| T012 | OpenCode `spec-writer` + Haiku |
| T013 | OpenCode `reviewer` + Sonnet   |
| T014 | Sonnet + OpenCode `reviewer`   |

Evidência: [`evidence.md`](evidence.md).
