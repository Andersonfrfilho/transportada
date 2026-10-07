# Tasks

> Pré-condição: nenhum `[NEEDS CLARIFICATION]` aberto. Decisões do usuário e por delegação em
> `spec.md`. **Urgente para produção** (pedido de 2026-10-07): publica em staging, e produção entra
> por PR `staging → main` **com aprovação humana** — o autopilot não faz o merge.

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Na API, contrato e integração são dois comandos e nenhum cobre o outro;
a integração exige `--env-file=../../.env.test`; teste novo entra na lista do `package.json` da app.
Migration pede `make migration-test` além do `make check`.

## Fase 0 — Conferência

> 🤖 Modelo: `haiku`

- [ ] **T0.1** Conferir os fatos do `plan.md` § Contexto contra `origin/staging` (arquivo e linha).
      Divergência vira nota em `evidence.md`.

## Fase 1 — API

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — `opus`, validar com `architect` antes de implementar)

- [x] **T1.1** 🧠 Decidir e documentar no `plan.md` como o custo "depois" é lido na mesma transação
      da troca (`readTripValuation` aceita executor de transação? senão, segunda leitura dentro do
      repositório). Saída: 5 linhas no `plan.md`, sem código.
- [ ] **T1.2** Contratos vermelhos primeiro: grade de `trip-state.contract.ts` com a ação nova nos
      10 status; `crew-transfer.contract.ts` (permissão, corpo, `reason` obrigatório, `409
  TRIP_CREW_UNCHANGED`, recusa em `completed`/`cancelled`/`separating`, veículo ausente do corpo);
      `separator-role.contract.test.ts` prova que o separador não alcança a rota.
- [ ] **T1.3** Migration `trip_crew_events` + `rollback.sql` + `snapshot.json` + schema Drizzle.
      `make migration-test` verde.
- [ ] **T1.4** Domínio: `isCrewTransferable`, ação `transferCrew`, `allowed-actions`.
- [ ] **T1.5** Use case, repositório, rota `POST /v1/trips/:id/crew-transfers`, `audit_logs`,
      linha do tempo. Rota, pedágio, ETA e `vehicle_id` provados intactos.
- [ ] **T1.6** Integração: custo antes/depois com diárias diferentes (diferença ≠ 0 e sinal certo),
      divergência de MDF-e só com `authorized` e só com motorista trocado, motorista novo lê
      `/me/trips/current` e o antigo deixa de ver, concorrência (duas transferências → uma vence,
      outra 409/`TRIP_CREW_UNCHANGED`).

## Fase 2 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato vermelho: validação de `allowed-actions` com `transferCrew`, resposta com
      `costDifference` e `mdfeDriverDivergence`, estados do diálogo (motivo vazio desabilita).
- [ ] **T2.2** `TripCrewTransferDialog`, hook, cliente, botão no `TripHeaderActions` por
      `allowed-actions`, locales pt-BR/en, aviso de MDF-e, resumo da diferença de custo.
- [ ] **T2.3** Evento de tripulação na linha do tempo da viagem.

## Fase 3 — App do motorista

> 🤖 Modelo: `haiku`

- [ ] **T3.1** Texto do aviso de reatribuição e rótulos de recusa para viagem em andamento; teste
      de contrato.

## Fase 4 — Documentação e fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** `docs/ai-context/*`, corrigir "tripulação fixa" em `A/CLAUDE.md` e
      `docs/ai-context/api-transportada.md`, ADR curta (valor e MDF-e), prettier nos `.md`.
- [ ] **T4.2** Revisão de design e usabilidade do diálogo: print do painel (web.md §15), uma vez.
- [ ] **T4.3** Gates completos: `make check`, `make migration-test`, integração tocada
      (`bun --env-file=../../.env.test run test:integration`). Publicar em staging (`fetch → rebase →
  install → gates → push HEAD:staging`). PR `staging → main` aberto para aprovação humana.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/249-a-viagem-na-rua-troca-de-motorista-e-ajudante/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=haiku · Fases 1, 2 e 4 → executor model=sonnet ·
T1.1 🧠 → opus (validar com architect antes) · Fase 3 → executor model=haiku ·
revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, merge do PR staging→main, migration destrutiva.
```
