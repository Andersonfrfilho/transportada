# Tasks — Spec 259

Gates de **toda** task: typecheck da app tocada, testes do módulo (lista explícita no `package.json`), commit
isolado, linha em `evidence.md`. Escalada: gate falhou 2x → sobe um nível e registra em `evidence.md`.
Tarefa de tela fecha com revisão de design (`web.md` §15) e print. Publicação: painel tolerante → API → telas.

## Fase 1 — Contrato e medição

> 🤖 Modelo: `sonnet` (T1.1 🧠 → `opus`)

- **T1.1 🧠** Medir consultas do `readContext`, `loadTripOccupancy` e `loadTripCargoWeight` e decidir lote real ×
  reuso (plan.md, decisão 2). Validar com `architect`. Aceite: parecer e contagem de consultas em `evidence.md`.
- **T1.2** Teste de paridade (falhando): fixture com 3 viagens; lista × detalhe devem dar o mesmo `totalCost`,
  `totalMargin`, `payloadRatio`, `occupancy`. Aceite: teste existe e falha pelo motivo certo.

## Fase 2 — API

> 🤖 Modelo: `sonnet` · T2.5 → `haiku`

- **T2.1** `readValuationContexts` em lote (uma consulta por leitura, por página). Aceite: contrato de contagem de
  consultas igual para 1 e 20 viagens; isolamento de empresa no `tenant-safety`.
- **T2.2** `readTripListFinancials` com `buildValuationFromContext`; `TripAmounts` ganha `costTotal`, `marginTotal`,
  `marginPercentage`; `TRIP_AMOUNTS_FIELD_POLICY` classifica `money`. Aceite: typecheck + paridade de custo verde.
- **T2.3** Leitor de ocupação em lote (ou reuso, conforme T1.1) e campo `occupancy` em `serializeTrip`. Aceite:
  paridade de ocupação verde; sem veículo → `null`.
- **T2.4** Isolamento de falha (`allSettled`/`.catch`) + `warn` só de ids; medir tempo da página de 20 antes e
  depois. Aceite: teste "uma viagem falha, as outras seguem"; números em `evidence.md`.
- **T2.5** Teste de redação: sem `trip.financials` o JSON não tem os três campos novos. Aceite: contrato verde.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` · T3.1 → `haiku`

- **T3.1** Tipos, `tripResponse.validation.ts` tolerante a campo ausente e adaptador em `tripClient.service.ts`.
  **Publicar antes da API.** Aceite: contrato do cliente com resposta antiga e nova.
- **T3.2** `TripOccupancyBars` e `TripResultCell` (acessíveis, com marca de estimado/previsto/parcial) e colunas em
  `TRIP_COLUMN_KEYS`; `visibleTripColumns` esconde resultado sem `trip.financials`. Aceite: contratos de coluna e
  de componente.
- **T3.3** Lista do `package.json` do painel com os testes novos. Aceite: `bun run test` do painel verde.

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet`

- **T4.1** Revisão de design e usabilidade da coluna (largura, densidade, mobile) com print contra a tela real.
- **T4.2** `make check`, integração tocada, `docs/ai-context/api-transportada.md` e CLAUDE.md da app atualizados.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/259-a-lista-de-viagens-diz-ocupacao-e-lucro/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet (T1.1 🧠 → opus, validar com architect) · Fase 2 → executor model=sonnet
(T2.5 haiku) · Fase 3 → executor model=sonnet (T3.1 haiku) · Fase 4 → sonnet · revisão final → code-reviewer sonnet.
Escalada: gate falhou 2x → sobe um nível e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
