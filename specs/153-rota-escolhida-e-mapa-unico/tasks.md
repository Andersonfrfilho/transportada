# Tasks — 153

Cada task: contrato vermelho → implementação → typecheck + lint + testes da app (API com
`--env-file=../../.env.test`) → evidência em `evidence.md` → commit isolado.

## Fase 0 — Spike

> 🤖 Modelo: `sonnet`

- [x] T001 Confirmar que o OSRM (profile `car.lua` padrão, MLD, v6.0.0) aceita `exclude=toll`:
      chamada real contra o OSRM de staging ou a fixture `deploy/osrm/fixtures` — resultado em
      `evidence.md`. Se não aceitar, parar e reportar (D1 depende disso).

## Fase 1 — Dados e seams da API

> 🤖 Modelo: `sonnet` (T102 é 🧠 — `opus`)

- [x] T101 Migration aditiva do RF1 + schema Drizzle + rollback — `make migration-test`.
- [x] T102 🧠 Assinatura de rota, `selectRouteOption` e `summarizeRoadDistance` (domínio puro) —
      contratos de domínio (assinatura estável, critérios, não reproduzida, volta `0` em
      `last_stop`).
- [x] T103 Gateway com `exclude=toll` em paralelo, dedupe por assinatura, `isNoToll`, falha isolada —
      contrato com gateway falso.
- [x] T104 `read-route-geometry`: `signature`, `isNoToll`, `selectedIndex` na mais barata, topo = a
      selecionada — contratos de route-geometry atualizados.

## Fase 2 — A viagem grava a rota

> 🤖 Modelo: `sonnet`

- [x] T201 Congelamento da rota inteira (`freeze-trip-planned-route`), `plan-route` com
      `routeChoice`, D3 e D5 — contratos + integração.
- [x] T202 Valuation da viagem lê distância e pedágio gravados; prévia aceita `routeChoice`;
      paridade prévia × viagem (aceite 2).
- [x] T203 `GET /trips/:id/route-geometry` devolve a gravada (`frozen`) — contrato HTTP.
- [x] T204 Aceite multi-veículo com `routeChoice` por veículo; aceite por viagem grava rota.
- [x] T205 Reorder, link (unitário e lote) e release recalculam com `cheapest` antes do despacho —
      contratos nos caminhos, OSRM falhando sem derrubar.
- [x] T206 Fila de revisão (`move`/`swap`, spec 148) recalcula origem e destino com `cheapest`
      (RF12) — contratos nos dois lados, OSRM falhando sem derrubar a movimentação.

## Fase 3 — Dinheiro só para o financeiro (API)

> 🤖 Modelo: `sonnet`

- [x] T301 Serviço de redação monetária + aplicação em route-geometry ×2, detalhe da viagem e NF-e
      (listagem e leitura) — contrato HTTP sem `trip.financials` (aceite 3).

## Fase 4 — Frontend da rota e dos valores

> 🤖 Modelo: `sonnet`

- [x] T401 Validação de respostas com campos novos e monetários opcionais.
- [x] T402 `TripAssemblyMap`: seletor com "Sem pedágio", switch **mais rápida ↔ mais barata** sobre
      as opções já em mãos (sem nova ida ao OSRM), abre na mais barata, `onRouteChoiceChange`,
      `canReadFinancials` no mapa e no `RouteTollSummary`. Trocar **regrava** a escolha (RF13); opção
      única avisa em tela em vez de oferecer switch inerte.
- [x] T403 Criação manual envia a escolha; ordem reorder → plan corrigida.
- [x] T404 Proposta: escolha por veículo no aceite e na prévia da conta.
- [x] T405 Detalhe: rota gravada, km/volta/tempo, critério, avisos, custos e valor da NF só com
      permissão.

## Fase 5 — Um mapa só

> 🤖 Modelo: `sonnet`

- [x] T501 Aba Regiões em MapLibre (polígonos por zona, clique, legenda, cidades fora da malha).
- [x] T502 Remoção de `VectorMap` e do resto do mapa antigo (RF11) + contrato de fonte (aceite 4).

## Fase 6 — Documentação e revisão

> 🤖 Modelo: `haiku` (docs) · `opus` (revisão)

- [x] T601 `apps/api-transportada/CLAUDE.md`, `apps/frontend-transportada/CLAUDE.md` e
      `docs/ai-context/*`: rota gravada, redação monetária, mapa único.
- [ ] T602 Revisão final com `code-reviewer` `model=opus`; `make check`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/153-rota-escolhida-e-mapa-unico/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0–5 → executor model=sonnet · T102 🧠 → opus · Fase 6 docs → writer model=haiku ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + lint + testes da app (API com --env-file=../../.env.test) + commit
isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, T001 negativo (OSRM sem
exclude=toll), qualquer [NEEDS CLARIFICATION].
```

## Fase 7 — Correções da revisão final (T602)

> 🤖 Modelo: `sonnet`

Cada task fecha como as demais: contrato vermelho → correção → gates → evidência → commit isolado.

- [x] T701 **C1** Redação da NF-e quebra o frontend sem `trip.financials`: `totalAmount` e
      `freightAmount` opcionais em `nfeWorkspaceClient.service.ts` e `tripResponse.validation.ts`,
      célula oculta quando ausentes (nunca traço nem zero), bipe e busca por faixa funcionando para
      `fiscal`, `viewer` e `separator`. Contrato com payload redigido.
- [x] T702 **H1** "Mais barata" nunca é eleita: `fuelBaseline` no congelador e na prévia; frontend
      emite a escolha quando a resposta chega (montagem, criação e proposta — M7 junto); critério
      resolvido sem assinatura grava `choiceReproduced: true` (só a assinatura que não reproduz é
      `false`).
- [x] T703 **H2** Aceite por viagem não pode lançar por nota sem parada nem promover status: usar o
      congelador tolerante no lugar de `planTripRoute`. Contrato com nota sem endereço.
- [x] T704 **M1–M4 + L7** Limpeza de `planned_*` dentro da transação de reorder/link/release/
      move/swap; `releaseUnplaced` e `overrideDeliveryAddress` recalculam (M2); guarda de status e
      concorrência na escrita da rota (M3); parada sem coordenada grava rota nula, nunca parcial
      (M4); `logger.warn` nos `catch` do congelamento (L7).
- [x] T705 **M5 + L6** Aba Regiões: erro de basemap não pode apagar as zonas; copyright e `useMemo`
      no `selectedCodes`.
- [x] T706 **M6** Teste de comportamento do switch do detalhe (T405): observer sobre a query real
      prova que a troca regrava e que a busca não se repete nem após o `invalidate`.
- [x] T707 **H3** `GET /trips` redige `amounts` sem `trip.financials` (D10) + registro em
      `docs/SECURITY.md`. Anterior à 153.
- [ ] T708 **H4** Aceite multi-veículo retomável: falha num veículo não deixa viagem órfã nem entra
      em laço no reaceite. Anterior à 153.
- [x] T709a **L1–L2** (frontend) Opção marcada por assinatura em `TripRouteChoiceSwitch` (D2) —
      `resolveSelectedOptionIndex` casa `selectedSignature` entre as `options` antes de cair no
      critério; `choiceReproduced` não booleano vira omitido, nunca `false` (D3), em
      `routeGeometryFromApi`. Contratos em `test/trip/assembly-route-options.contract.ts`,
      `test/trip/route-choice-detail.contract.ts` e `test/trip/route-geometry-money-optional.contract.ts`.
- [ ] T709b **L3–L5** (API, sessão separada) `signature` com formato no schema, redação por lista de
      permissão, praça da rota congelada com `isNoToll`/`legIndex` reais.

- [x] T710 **Ponta solta da T707** `isAbsentOrTripAmounts` exige as três chaves (`hasExactKeys` sobre
      `TRIP_AMOUNTS_KEYS`): a listagem redigida reprova e a tela quebra, como no C1. Tornar
      `documentsTotal` e `revenueTotal` opcionais em `tripResponse.validation.ts`, `trip.types.ts` e
      `trip.constant.ts`, com a linha sumindo na tela.
