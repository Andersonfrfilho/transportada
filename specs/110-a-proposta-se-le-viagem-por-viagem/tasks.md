# Tasks — Feature 110

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

---

## Fase 0 — Limpeza que não depende de nada

> 🤖 Modelo: `haiku`

- [ ] **T001** [P] Contrato `test/design-system/css-tokens.contract.ts`: varre `src/**/*.css` e falha
      para todo `var(--x)` sem definição em `:root`. Deve **reprovar hoje**, nomeando
      `--color-border`, `--radius-md` e `--color-text-muted` — frontend — teste vermelho registrado
- [ ] **T002** Troca os três tokens inexistentes em `trip.module.css` pelos reais
      (`rgba` de `--color-slate` 18%, sem raio, `--color-slate` 90% + branco 10%) — `trip.module.css`
      — T001 verde

## Fase 1 — Backend: o que a API precisa mandar e aceitar

> 🤖 Modelo: `sonnet` (T004 é 🧠 — validar o desenho com `opus` antes)

- [ ] **T003** [P] Contrato: a leitura da proposta publica `estimatedArrivalAt`,
      `distanceFromPreviousMeters`, `durationFromPreviousSeconds` e `geocodingPrecision` por parada —
      `api-transportada/test/routing/` — contrato vermelho
- [ ] **T004** 🧠 Contrato `test/routing/partial-accept.contract.ts`: `vehicleIds` cria só o
      subconjunto, o resto não é criado, veículo de fora responde `400`, repetir responde `409` —
      API — contrato vermelho
- [ ] **T005** Publica os quatro campos da T003 na rota da proposta — `routing/presentation/` — T003
      verde
- [ ] **T006** `vehicleIds` no schema e no caso de uso do aceite, **sem tocar** na reivindicação
      atômica da 107 D2 — `accept-multi-vehicle-suggestion.use-case.ts` — T004 verde
- [ ] **T007** Integração contra Postgres: aceite parcial de 2 de 4 veículos, com as notas dos outros
      dois livres ao fim — `test/integration/` — evidência com contagem

## Fase 2 — O razão compartilhado

> 🤖 Modelo: `sonnet`

- [ ] **T008** [P] Contrato `test/trip-financials/valuation-ledger.contract.ts`: ordem por maior
      parcela, parcela com lacuna **presente** com o motivo, soma batendo com o total da API,
      derivação de combustível e de agregado — frontend — contrato vermelho
- [ ] **T009** `shared/valuationLedger.service.ts` — puro: ordena, monta as linhas de derivação e
      separa operação de imposto (ADR-0049 §4) — T008 verde
- [ ] **T010** `components/ValuationLedger.component.tsx` — uma coluna, `width: min(100%, 46rem)`,
      despesas em `--color-alert` — T008 verde
- [ ] **T011** Troca `TripValuationPreview` pelo razão na **criação manual** e apaga o antigo —
      `TripQuickCreateDialog.component.tsx` — smoke da criação manual

## Fase 3 — A linha do tempo

> 🤖 Modelo: `sonnet`

- [ ] **T012** [P] Contrato `test/trip/route-timeline.contract.ts`: base, paradas, praça na perna
      certa, as três `end_policy` (`depot`, `address`, `last_stop`) e o agregado no fecho, fora das
      pernas — contrato vermelho
- [ ] **T013** `shared/routeTimeline.service.ts` — puro, recebe paradas + praças + política e devolve
      os eventos do dia — T012 verde
- [ ] **T014** `components/TripRouteTimeline.component.tsx` — trilho, marcas de parada, praça e
      pagamento — T012 verde

## Fase 4 — A lista, a seleção e as ações

> 🤖 Modelo: `sonnet`

- [ ] **T015** [P] Contrato `test/trip/proposal-selection.contract.ts`: marcar, desmarcar,
      indeterminado, totais derivados da seleção, rótulo do botão e a frase do que volta ao maço —
      contrato vermelho
- [ ] **T016** [P] Contrato `test/trip/proposal-actions.contract.ts`: reserva de largura das ações
      com dois e com três botões, `aria-label` em todo botão de ícone, dica em todos — vermelho
- [ ] **T017** `shared/proposalSelection.service.ts` — puro — T015 verde
- [ ] **T018** `components/TripProposalRow.component.tsx` — marca (cor + `VEHICLE_TYPE_ICONS`),
      título, cidades e as seis colunas **de largura fixa** — T015/T016 verdes
- [ ] **T019** `components/TripProposalList.component.tsx` — "selecionar todas", barra de totais e
      rodapé — T015 verde

## Fase 5 — O expandido

> 🤖 Modelo: `sonnet`

- [ ] **T020** `components/VehicleIdentityBand.component.tsx` — faixa do veículo, compartilhada com a
      criação manual — contrato de convergência
- [ ] **T021** `components/TripProposalDetail.component.tsx` — monta os sete blocos reusando
      `TripAssemblyMap`, `useTripCargoPreview`, `CargoVehicle` e `TripCargoLayers` — smoke
- [ ] **T022** [P] Contrato `test/trip/valuation-ledger-shared.contract.ts`: criação manual e
      proposta importam **o mesmo** razão e a mesma faixa — verde

## Fase 6 — A mudança de lugar

> 🤖 Modelo: `sonnet`

- [ ] **T023** [P] Contrato `test/trip/proposal-placement.contract.ts`: `TripRouteAssemblyProposal`
      **não** é importada em `TripWorkspace.page.tsx` — vermelho
- [ ] **T024** Move a proposta para `TripRouteAssemblyDialog`; o diálogo deixa de fechar ao propor —
      T023 verde
- [ ] **T025** O painel de pedido recolhe em faixa com "Alterar o pedido" quando há proposta —
      `TripRouteAssemblyPanel.component.tsx` — smoke
- [ ] **T026** Remove da página de viagens o painel e a consulta de avaliação órfã — smoke

## Fase 7 — Edição de destino

> 🤖 Modelo: `sonnet` (T027 é 🧠 — a dúvida aberta da spec decide o comportamento)

- [ ] **T027** 🧠 Fecha a `[NEEDS CLARIFICATION]` da spec: mover destino recalcula os dois caminhões
      ou marca os dois como alterados — decisão registrada na spec antes de codar
- [ ] **T028** Ações por destino (mover, remover com desfazer) e adicionar destino, com o seletor das
      sobras — contrato
- [ ] **T029** Faixa "roteiro alterado" + etiqueta na linha; **o aceite é recusado** enquanto ela
      existir — contrato

## Fase 7b — A criação manual herda o que a proposta ganhou

> 🤖 Modelo: `sonnet`

⚠️ Esta fase é a D8 por extenso. Sem ela a feature entrega **duas telas que montam viagem com caras
diferentes**, que é o defeito que o `web.md` §14 chama de divergência — pior que as duas artesanais.

- [ ] **T029b** [P] Contrato `test/trip/manual-creation-convergence.contract.ts`: a criação manual
      importa `ValuationLedger`, `VehicleIdentityBand` e `TripRouteTimeline` — os **mesmos** da
      proposta — e não tem componente próprio de conta, faixa ou sequência — vermelho
- [ ] **T029c** `TripQuickCreateDialog` ganha a faixa do veículo acima do mapa, alimentada pelo
      veículo do `Select` e pela prévia de carga que a tela já consulta — smoke da criação manual
- [ ] **T029d** As praças do extrato de `TripAssemblyMap` passam a aparecer **no trecho delas**, na
      sequência de paradas, reusando `routeTimeline.service`. ⚠️ O extrato separado sai: uma praça em
      dois lugares é onde os dois começam a discordar — `TripAssemblyMap.component.tsx` — T029b verde
- [ ] **T029e** O rótulo "Custo" vira **"Despesas"** em `--color-alert` nas duas telas e na barra de
      totais da proposta; `valuation.cost` do locale acompanha — contrato de locale

## Fase 8 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T030** Responsivo: 375px, 768px e 1280px; alvo de toque de 44px nas ações — evidência visual
- [ ] **T031** Esqueletos com a forma do conteúdo em todo carregamento novo
      (`docs/frontend/loading.md`) — contrato de skeleton
- [ ] **T032** `make check` + `bun run smoke` verdes — evidência colada em `evidence.md`
- [ ] **T033** Atualiza `CLAUDE.md` com o que mudou de lugar e por quê (regra inquebrável §14 do
      `code-standart.md`)

---

## Ordem e paralelismo

A Fase 0 é independente e pode sair primeiro. A Fase 1 (API) **precisa subir antes** do frontend que
a consome — o guard é `hasExactKeys`. Fases 2 e 3 são independentes entre si. A Fase 7b depende da 2, 3 e 5. A Fase 6 depende de 4 e
5 estarem prontas, senão a tela fica sem a lista que ela vai hospedar.
