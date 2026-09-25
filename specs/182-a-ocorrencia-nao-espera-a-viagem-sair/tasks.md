# Tasks — Feature 182

Uma task por vez. Cada uma fecha com typecheck + testes + commit isolado, e evidência em
`evidence.md`. Teste de aceite **antes** da implementação.

## Fase 1 — A máquina libera a baixa antes do despacho (RF3)

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Atualizar `test/trip-domain/trip-state.contract.ts`: separar os dois testes que hoje
      tratam `deliver`+`return` como bloco único — `deliver` passa a aplicar em qualquer estado
      não-terminal (`route_planned`, `separating`, `loading`, `dispatched`, `in_transit`,
      `on_delivery_route`), `return` continua só em `DISPATCHED_STATUSES`. Rodar e ver falhar.
- [x] **T1.2** `checkTripAcceptsDocumentWork` (`trips/domain/trip-state.policy.ts`): `deliver` deixa
      de exigir `isTripDispatched`; `return` inalterado. Comentário registrando RF3/decisão de
      24/09. Fecha com T1.1 verde.

## Fase 2 — A lista de ações acompanha a máquina (RF1, RF2)

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Atualizar `test/trip-allowed-actions/policy.contract.ts`: o caso hoje chamado
      `'parada fora da rua (antes do despacho ou concluída) não tem ação'` some para `loading`
      (passa a `['occurrence']`) e permanece só para `completed`; casos novos cobrindo `draft` (nota
      vinculada), `route_planned`, `separating`, `loading` para `resolveStopActions` e
      `resolveFieldDocumentActions` (CA01, CA02, CA06), e `cancelled` explicitamente para as duas.
      Rodar e ver falhar.
- [x] **T2.2** `trip-allowed-actions.policy.ts`: `resolveStopActions` separa `occurrence` (sem
      `isTripOnRoad`, ainda exige viagem não `cancelled`/`completed`) de `arrive` (mantém
      `isTripOnRoad`). `resolveFieldDocumentActions`: `fieldOccurrence` deixa de exigir
      `isTripDispatched`, só exige viagem não `cancelled`. Fecha com T2.1 verde.

## Fase 3 — Prova contra Postgres (CA03, CA05)

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Novo teste em `test/integration/trip-field-office.integration.ts`: viagem em
      `loading`, nota `loaded`, `POST .../field-delivery` responde 200 e grava `delivered` — prova
      que o gate da rota (não só da listagem) mudou. Rodar e ver falhar.
- [x] **T3.2** Nenhuma mudança de produção esperada aqui (a Fase 1 já cobre a rota) — task fecha
      confirmando T3.1 verde com `bun --env-file=../../.env.test run test:integration`.

## Fase 4 — Revisão

> 🤖 Modelo: `sonnet`

- [x] **T4.1** Revisão de design (web.md §15): nenhum arquivo de frontend muda (D0 do plan.md) —
      print da tela de viagem em `loading` mostrando o botão de ocorrência na linha da nota, 375px e
      desktop, claro/escuro conforme a app suporta, em `prints/`, como prova de que o servidor já
      entrega a ação sem mudança de UI.
- [x] **T4.2** Atualizar `apps/api-transportada/CLAUDE.md` (bloco "O escritório dá baixa em nome do
      motorista") registrando que `deliver` não exige mais despacho (RF3, spec 182).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/182-a-ocorrencia-nao-espera-a-viagem-sair/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: todas as fases → executor model=sonnet.
Cada task fecha com typecheck + testes (contrato E integração da API quando tocar
`test/integration/**`) + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer [NEEDS
CLARIFICATION] — não há nenhum aberto nesta spec.
```
