# Tarefas — 238

> Bloqueada por **D1–D3** (têm recomendação). Sem prompt de execução até serem respondidas.

## Fase 1 — Domínio e dado

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [ ] **T1.1** 🧠 `business-calendar.policy.ts` + contrato em tabela **antes** (CA1, CA2, extremos);
      feriados nacionais por Páscoa; mutação.
- [ ] **T1.2** Migration aditiva: `municipal_holidays.recurrence/kind/month/day`, `state_holidays`,
      `saturday_is_business_day`; `rollback.sql`; `make migration-test`; `db:generate` = `no_changes`.
- [ ] **T1.3** Repositório e rotas (RF8), Zod `.strict()`, contratos de validação (CA4); integração contra
      Postgres incluindo que o solver continua lendo as datas.
- [ ] **T1.4** Revisão da fase com `code-reviewer` em `opus` (passada separada); publicar em staging com
      tudo verde e **confirmar o deploy**.

## Fase 2 — Tela

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes** da tela (formulário, validação, tabela com filtro/ordenação).
- [ ] **T2.2** Tela de feriados em Configurações (municipal, estadual, aniversário), locale pt-BR/en.
- [ ] **T2.3** Prova por mutação e evidência em `evidence.md`.
- [ ] **T2.4** **Revisão de design e usabilidade** (web.md §15) com print enviado ao usuário e aprovado antes
      de publicar; publicar em staging.
