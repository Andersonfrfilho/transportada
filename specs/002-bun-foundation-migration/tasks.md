# Tasks — Migração da fundação Bun

Uma task por vez e um commit atômico por task.

| ID   | Task                                                              | Dependência | Verificação                                                      | Modelo                        |
| ---- | ----------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- | ----------------------------- |
| T001 | Registrar ADR, arquitetura, spec e roteamento                     | nenhuma     | links, Markdown e ausência de clarification                      | Opus (alto)                   |
| T002 | Criar contract suite Bun do fiscal provider sem emissão           | T001        | import público, assinatura local mock/homologação segura e erros | Opus (alto)                   |
| T003 | Implementar provider Drizzle/Bun SQL no Ada                       | T001        | testes de conexão, transação, health e shutdown em Postgres      | Sonnet (médio) + revisão Opus |
| T004 | Implementar provider RabbitMQ/Bun no Ada                          | T001        | ack, prefetch, redelivery, retry/DLX, DLQ e shutdown             | Opus (alto)                   |
| T005 | Empacotar providers Ada e validar instalação Bun limpa            | T003, T004  | tarball/pack e smoke; publicação requer aprovação                | Sonnet (médio)                |
| T006 | Migrar raiz para Bun workspaces e CI                              | T005        | frozen install e scripts raiz via Bun                            | Sonnet (médio)                |
| T007 | Migrar banco para Drizzle e baseline não destrutivo               | T006        | generate sem drift, migrate em banco vazio e rollback            | Opus (alto)                   |
| T008 | Migrar API para `Bun.serve` com testes primeiro                   | T006, T007  | contrato HTTP, degraded readiness, limites e SIGTERM             | Sonnet (médio) + revisão Opus |
| T009 | Migrar worker para Bun/RabbitMQ                                   | T006, T007  | health interno, ack pós-commit, DLQ e drain                      | Opus (alto)                   |
| T010 | Migrar frontend para React/Vite/PWA                               | T006        | build, i18n, tokens, Query e 375/768/1280                        | Sonnet (médio)                |
| T011 | Atualizar Compose e Makefile para a stack Bun                     | T008-T010   | `make up`, `make dev`, `make smoke`                              | Sonnet (médio)                |
| T012 | Remover pnpm, Turbo, Nest, Next, Prisma, BullMQ e packages locais | T011        | busca residual e apps isolados                                   | Haiku (baixo)                 |
| T013 | Executar gates finais e revisão independente                      | T012        | check, smoke, isolamento, migration e evidência                  | OpenCode free + Opus          |

## Delegação econômica

- OpenCode `deepseek-v4-flash-free`: inventário e primeiro rascunho documental.
- OpenCode `north-mini-code-free`: testes previsíveis e bem delimitados.
- OpenCode `nemotron-3-ultra-free`: revisão somente leitura.
- Sempre fixe `--model opencode/<modelo>-free`; os agentes customizados atuais
  são subagentes e não são válidos como `--agent` primário.
- Duas falhas equivalentes escalam para Sonnet ou Opus.

## Estado

- [x] T001 Registrar ADR, arquitetura, spec e roteamento.
- [x] T002 Contract suite fiscal Bun, sem emissão real.
- [x] T003 Provider Drizzle/Bun SQL no Ada.
- [x] T004 Provider RabbitMQ/Bun no Ada.
- [x] T005 Empacotamento e instalação limpa.
- [x] T006 Bun workspaces e CI.
- [x] T007 Drizzle no TransportAdA.
- [x] T008 API Bun.
- [x] T009 Worker Bun.
- [x] T010 Frontend Vite/PWA.
- [x] T011 Compose/Makefile.
- [x] T012 Remoção de legado.
- [x] T013 Gates finais.
