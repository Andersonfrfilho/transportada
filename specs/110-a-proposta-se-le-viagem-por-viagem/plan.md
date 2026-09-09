# Plano técnico — Feature 110

## Contexto e premissas

A spec 108 fez a proposta existir sem criar viagem. A 110 a torna **revisável**: ela sai da tela de
viagens, ganha uma linha por caminhão, e cada linha abre a tela de criar viagem inteira.

Três premissas medidas, todas confirmadas em leitura de código:

1. `useTripCargoPreview` e `TripAssemblyMap` recebem **notas + veículo** — nenhum dos dois precisa de
   viagem criada. `POST /trips/cargo-preview` idem.
2. `GET /route-suggestions/:id/valuation` (spec 101) já devolve receita, custo, margem, distância e
   duração **por veículo**, com as lacunas por extenso.
3. `route_suggestion_stops` já guarda ETA, km e duração por perna, e precisão de geocodificação. O
   que falta é o adaptador do módulo `trip` deixar de descartá-los.

Consequência: **a maior parte desta feature é frontend**. O backend entra em dois pontos — o aceite
parcial (RF6) e o adaptador da proposta (RF10).

## Arquitetura e arquivos afetados

### api-transportada

- `src/routing/presentation/*.routes.ts` · `*.schema.ts` — `vehicleIds` opcional no corpo do aceite.
- `src/routing/application/accept-multi-vehicle-suggestion.use-case.ts` — filtra os veículos aceitos
  antes de criar; a reivindicação atômica da 107 D2 **não muda**.
- `src/routing/presentation/` — a leitura da proposta publica os campos da RF10 por parada.

### frontend-transportada

Novos, em `modules/trip/`:

- `components/TripProposalList.component.tsx` — a lista e a seleção.
- `components/TripProposalRow.component.tsx` — a linha recolhida e o gatilho.
- `components/TripProposalDetail.component.tsx` — os sete blocos da D3.
- `components/TripRouteTimeline.component.tsx` — a linha do tempo da D4.
- `components/VehicleIdentityBand.component.tsx` — a faixa do veículo (compartilhada).
- `shared/proposalSelection.service.ts` — seleção e totais derivados, **serviço puro**.
- `shared/routeTimeline.service.ts` — monta os eventos do dia a partir de paradas + praças + política
  de fim, **serviço puro**.

Novo, em `modules/trip-financials/`:

- `components/ValuationLedger.component.tsx` — o razão da D7, consumido pela proposta **e** pela
  criação manual.
- `shared/valuationLedger.service.ts` — ordena as parcelas e monta as linhas de derivação.

Alterados:

- `pages/TripWorkspace.page.tsx` — remove o painel de proposta e a consulta de avaliação que só ele
  usava.
- `components/TripRouteAssemblyDialog.component.tsx` — hospeda a proposta; deixa de fechar ao propor.
- `components/TripRouteAssemblyPanel.component.tsx` — recolhe em faixa quando há proposta.
- `components/TripQuickCreateDialog.component.tsx` — troca `TripValuationPreview` pelo razão e ganha
  a faixa do veículo (D8).
- `hooks/useTripRouteAssembly.hook.ts` — seleção, edição e o corpo do aceite parcial.
- `styles/trip.module.css` — **remove os três tokens inexistentes**; acrescenta o que a lista pede.

## Contratos/API/eventos

```
POST /route-suggestions/:id/accept
  body: { vehicleIds?: string[] }   // ausente = todos, comportamento de hoje
  200:  { trips, leftoverStops, skippedDocuments, suggestion }
  409:  ROUTE_SUGGESTION_NOT_READY   (reivindicação da 107 D2)
  400:  ROUTE_SUGGESTION_VEHICLE_NOT_IN_PROPOSAL
```

`GET /route-suggestions/:id/proposal` passa a devolver, por parada:
`estimatedArrivalAt`, `distanceFromPreviousMeters`, `durationFromPreviousSeconds`,
`geocodingPrecision`. ⚠️ O guard do frontend é `hasExactKeys`: **a API sobe primeiro**, senão a
proposta é recusada na validação e o painel some com 200 na rede e nada no console — o mesmo defeito
de `VEHICLE_DETAIL_KEYS`.

## Dados, migration e rollback

**Nenhuma migration.** A feature não cria coluna nem tabela: tudo que ela mostra já está gravado.

## Segurança e tenant

- Ler a proposta e aceitar continuam sob `trip.manage`, escopo `company`.
- A conta continua sob `trip.financials` — sem ela o painel fica inteiro e some só o dinheiro
  (incluindo o razão, as despesas do título e os totais da barra).
- `vehicleIds` é validado contra os veículos **da própria sugestão**; id de fora responde `400`,
  nunca cria nada.

## Idempotência e concorrência

A reivindicação atômica da spec 107 D2 é preservada palavra por palavra. Aceite parcial **consome** a
sugestão: repetir o pedido responde `409`, e é isso que impede a segunda leva de nascer de uma
distribuição que não existe mais.

## Observabilidade

Nada novo. O aceite já loga por `suggestionId`, e o corpo carrega referência, nunca nota.

## Estratégia de testes

Contratos primeiro, todos em `test/` e **declarados no `package.json`** de cada app:

| Contrato                                            | O que trava                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `test/trip/proposal-placement.contract.ts`          | `TripRouteAssemblyProposal` não é importada na página de viagens |
| `test/design-system/css-tokens.contract.ts`         | todo `var(--…)` em `src/**/*.css` tem definição                  |
| `test/trip/proposal-selection.contract.ts`          | seleção, indeterminado, totais derivados, frase do resto         |
| `test/trip/route-timeline.contract.ts`              | praça na perna certa, as três `end_policy`, agregado no fecho    |
| `test/trip-financials/valuation-ledger.contract.ts` | ordem, lacuna presente, soma batendo                             |
| `test/trip/proposal-actions.contract.ts`            | reserva do terceiro botão, `aria-label` em todo ícone            |
| `test/trip/valuation-ledger-shared.contract.ts`     | criação manual e proposta importam o mesmo razão                 |
| `test/routing/partial-accept.contract.ts` (API)     | subconjunto criado, resto não criado, `409` no repeat            |

## Riscos

- **A API sobe antes do frontend** — o guard `hasExactKeys` derruba a proposta inteira com o bundle
  antigo. Mitigação: publicar API primeiro, como em `VEHICLE_DETAIL_KEYS`.
- **Duas implementações do razão** — o risco real da D8. Mitigação: o contrato de convergência falha
  se as duas telas não importarem o mesmo componente.
- **Edição sem recálculo** — números velhos apresentados como novos. Mitigação: o aceite é recusado
  enquanto a etiqueta `roteiro alterado` existir.
