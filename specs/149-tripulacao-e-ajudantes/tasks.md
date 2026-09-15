# Spec 149 — Tarefas

| fase | tasks     | modelo recomendado | fallback se der 429 |
| ---- | --------- | ------------------ | ------------------- |
| 1    | T1 🧠, T2 | `opus`, `sonnet`   | `fable`, `opus`     |
| 2    | T3–T5     | `sonnet`           | `opus`              |
| 3    | T6–T7     | `sonnet`           | `opus`              |
| 4    | T8 🧠, T9 | `opus`, `sonnet`   | `fable`, `opus`     |
| 5    | T10–T11   | `sonnet`           | `opus`              |
| 6    | T12–T14   | `sonnet`           | `opus`              |
| 7    | T15       | `haiku`            | `sonnet`            |

Toda task fecha com: contrato vermelho antes, `bun run typecheck`, testes da app (integração com
`--env-file=../../.env.test`), `make check` na fase, commit isolado e evidência em `evidence.md`.

## Fase 1 — Modelo de dados

> 🤖 Modelo: `sonnet` (T1 é 🧠 — `opus`)

- [x] T1 🧠 — Aceitar a ADR-0065 e escrever as migrations do plano (6 mudanças, aditivas, com snapshot).
      `make migration-test` verde; contrato de schema e tenant-safety das tabelas novas.
- [x] T2 — Ficha do motorista: `canActAsHelper` e `helperDailyRate` no schema de request, mapper e
      leitura; `GET/PUT /company-crew-settings`. Contratos de validação (valor negativo 400) e permissão.

## Fase 2 — Tripulação na viagem

> 🤖 Modelo: `sonnet`

- [x] T3 — `resolveTripCrewForCreation` com papel; posição 1 sempre `driver` (409 caso contrário).
- [ ] T4 — MDF-e da viagem só com `role = driver` (critério 3).
- [ ] T5 — Sugestão: corpo `helperIds`, tabela de ajudantes, 409 para pessoa repetida e para quem não
      pode ajudar; aceite grava a tripulação completa via `trip-composer.adapter.ts`.

## Fase 3 — Diária do ajudante

> 🤖 Modelo: `sonnet`

- [ ] T6 — `trip-helper-cost.policy.ts` (D7) e parcela `helper` em `TRIP_COST_KINDS` pelo seam único.
      Critérios 4 e 5.
- [ ] T7 — Mesma parcela na valuation da sugestão (`suggestion-valuation.policy.ts`), sem segunda conta.

## Fase 4 — Score de entregas

> 🤖 Modelo: `sonnet` (T8 é 🧠 — `opus`)

- [ ] T8 🧠 — `driver-performance.policy.ts` (pesos, renormalização, sem histórico) e
      `driver-performance.query.ts` (uma consulta, 90 dias, tenant). Integração contra Postgres com
      `EXPLAIN` registrado.
- [ ] T9 — `GET /fleet-drivers/performance` (`fleet.read`), com contrato de envelope e isolamento.

## Fase 5 — Recomendação e aprendizado

> 🤖 Modelo: `sonnet`

- [ ] T10 — `driver-recommendation.policy.ts` (D9/D10) e preenchimento `recommended` na criação da
      proposta (critério 1).
- [ ] T11 — `PATCH /route-suggestions/:id/vehicles/:vehicleId/crew` com feedback (critério 2).

## Fase 6 — Tela

> 🤖 Modelo: `sonnet`

- [ ] T12 — Ficha do motorista e painel "Diária do ajudante" perto do efeito.
- [ ] T13 — Montagem manda os pares do estado (D12); revisão com select de motorista (score + motivo) e
      ajudantes por veículo, gravando pelo PATCH; resumo das linhas sem motorista.
- [ ] T14 — Linha "Ajudantes" na conta da proposta e da viagem.

## Fase 7 — Documentação viva

> 🤖 Modelo: `haiku`

- [ ] T15 — `docs/ai-context/api-transportada.md` e `frontend-transportada.md`, núcleos `CLAUDE.md` das
      duas apps, contrato das rotas novas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/149-tripulacao-e-ajudantes/ (leia spec.md, plan.md e
tasks.md antes de começar, e a ADR-0065). Uma task por vez, na ordem do tasks.md, na branch
work/spec-149-tripulacao-ajudantes.
Modelos: Fase 1 → T1 🧠 opus (validar migrations com architect antes de gerar) · T2 executor model=sonnet ·
Fases 2, 3, 5 e 6 → executor model=sonnet · T8 🧠 → opus (fórmula e consulta validadas por architect) ·
T9 executor model=sonnet · Fase 7 → executor model=haiku · revisão final → code-reviewer model=opus.
Cada task fecha com contrato vermelho antes, bun run typecheck, testes da app (integração da API com
bun --env-file=../../.env.test test --timeout 120000), teste novo adicionado ao package.json, commit
isolado, evidência em evidence.md; make check e make migration-test ao fim de cada fase.
Pare e pergunte antes de: deploy, push para staging, migration destrutiva, mudar pesos do score ou a regra
de dias da diária (D7/D8), e qualquer [NEEDS CLARIFICATION].
```
