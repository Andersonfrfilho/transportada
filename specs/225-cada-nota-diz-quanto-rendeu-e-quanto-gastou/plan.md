# Plano — 225 Cada nota diz quanto rendeu e quanto gastou

## Contexto e premissas

Nada do cálculo do custo da viagem muda. Esta spec **reparte** um total que já existe, e o faz na
leitura, sem migration e sem coluna nova.

O que já está de pé e é premissa:

| peça                                    | onde                                                                                                    | uso aqui                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| trechos da rota com distância e duração | `trips.planned_route` (jsonb), lido por `parse-planned-route.policy.ts:10-70`                           | a base de distância e tempo por nota                             |
| chegada, entrega e saída da parada      | `trip_stop_events` (`TRIP_STOP_EVENT_KINDS`: `arrived`, `delivered`, `departed`, …)                     | a espera no cliente, `departed − arrived` (D9)                   |
| retorno                                 | `trips.planned_return_distance_meters` (`trip.schema.ts:270`)                                           | o trecho sem nota a bordo (D3)                                   |
| pedágio por trecho                      | `parseFrozenBoothLegIndexes`, `toll-route-cost-snapshot.policy.ts`                                      | pedágio já é por índice de trecho                                |
| nota → parada                           | `trip_documents.stop_id` (`trip.schema.ts:773`), índice `trip_documents_company_stop_idx`               | quem está a bordo em cada trecho                                 |
| conta da viagem (ao vivo)               | `read-trip-valuation.use-case.ts:218`, `trip-valuation.policy.ts:346`                                   | `totalRevenue`, `totalCost`, `costParcels`                       |
| receita por nota                        | `revenueLines` (`tripValuation.service.ts:71-84`)                                                       | o frete por nota, já no payload                                  |
| parcelas de custo                       | `trip-valuation.policy.ts:224-235` (`driver`, `fuel`, `helper`, `icms`, `manual`, `pis_cofins`, `toll`) | o que se reparte por distância, por tempo e o que não se reparte |
| congelado por viagem                    | `GET /trips/:id/financial-result` (`trip.routes.ts:351`), `FrozenResultTable`                           | o lado "fechado" do D6                                           |
| porta do dinheiro                       | `trip.financials` (`trip.routes.ts:742-751`, `:2250`, `:2261`)                                          | D7                                                               |
| razão na tela                           | `ValuationLedger.component.tsx`, `TripFinancialPanel.component.tsx:85-193`                              | onde o lado a lado entra                                         |
| linha da nota na parada                 | `TripStopList.component.tsx:596-624` (já mostra "Mercadoria" e "Frete")                                 | onde gasto e lucro por nota entram                               |

## Arquitetura e arquivos afetados

### Domínio (API)

- `trips/domain/document-cost-apportionment.policy.ts` **(novo, entregue na T1.2)** — o coração. Recebe
  os trechos, as paradas **na ordem da rota e com a espera de cada uma**, as notas com sua parada, o
  retorno e as parcelas de custo; devolve, por nota, `legCostAmount`, `tripShareCostAmount`,
  `taxAmount`, `marginAmount`, `marginPercentage`, `costBasis` e `timeBasis`. Função pura, sem I/O, sem
  Drizzle.
  - Classifica cada parcela em **distância**, **tempo**, **imposto** ou **viagem** — tabela explícita
    (`COST_KIND_APPORTIONMENT`, tipada `Record<TripCostKind, …>`), nunca `default: distância`, porque
    parcela nova entrando em silêncio no rateio errado é o defeito mais provável desta spec.
  - Toda divisão acontece em **dois níveis**: o balde se reparte entre os trechos — e, no tempo, também
    entre as paradas —, e o valor de cada trecho se reparte entre as notas a bordo. É isso que faz a
    soma fechar sem ajuste final.
  - `Decimal`/`numeric` em tudo. O resto de arredondamento vai para a nota de maior gasto,
    deterministicamente (D4).
- `trips/domain/document-cost-apportionment.types.ts` **(novo)** — `Params`/`Result` da política.

### API — leitura

- `trips/application/read-trip-valuation.use-case.ts` — chama a política nova depois de montar a
  avaliação e **anexa** os campos a `revenueLines`. Nenhum endpoint novo (D8).
- `trips/application/trip-valuation.port.ts` / o mapper da resposta — os campos novos do RF1.
- A mesma porta de permissão: sem `trip.financials`, os campos não entram na resposta.

### Painel (`apps/frontend-transportada`)

- `modules/trip/shared/trip.types.ts` e `tripResponse.validation.ts` — os campos novos, validados por
  **guarda de tipo escrita à mão** (esta app não usa zod).
- `modules/trip/components/TripStopList.component.tsx` — a linha da nota ganha gasto e lucro, com "do
  trecho" e "rateio da viagem" separados e o critério nomeado.
- `modules/trip-financials/components/TripFinancialPanel.component.tsx` — previsto e fechado lado a
  lado (D6), com a diferença.
- `modules/trip/locales/trip.locale.json` e `trip.en.locale.json`; `tripFinancials.locale.json`.
- CSS por módulo (`.module.css`), sem estilo inline — a app **não** usa Tailwind.

### Documentação

- `docs/ai-context/api-transportada.md` e `.../frontend-transportada.md`: a regra de rateio em uma
  linha cada, apontando para a política.
- ADR **não** é necessário: nenhuma decisão estrutural nova, só uma política de domínio.

## Riscos

1. **O casamento trecho↔parada.** É a única suposição estrutural, e a spec 206 mexeu em onde a rota
   começa. Mitigação: contrato que prende `legs[i]` → parada `i+1`, e divergência de contagem tratada
   como ausência (D5), nunca como aproximação.
2. **Parcela de custo nova entrando no rateio errado.** Mitigação: a classificação é tabela exaustiva,
   e um contrato reprova parcela conhecida pelo domínio que não esteja classificada.
3. **Soma que não fecha por arredondamento.** Mitigação: `Decimal`, resto determinístico e o contrato
   do D4 com viagem de cinco notas e três paradas.
4. **Número divergente entre a nota e o painel.** Mitigação: uma fonte só (D8); o painel não recalcula
   nada.
5. **Tela mais cheia do que útil.** Mitigação: a revisão de design da T4.1 com prints nos dois
   tamanhos e o ok do usuário — e a disposição a esconder "rateio da viagem" atrás do detalhe
   expandido se a linha ficar ilegível em 375 px.

## Estratégia de testes

- **Contrato de domínio primeiro**: a política com trechos sintéticos, cobrindo CA01-CA06 e os casos
  extremos (uma nota, trecho de duração zero, nota sem parada, duas notas na mesma parada).
- **Contrato da resposta**: os campos novos presentes com a permissão e **ausentes** sem ela, e
  ausentes no portal da contratante.
- **Integração**: uma viagem de verdade, com rota congelada, conferindo a invariante do D4 contra o
  `totalCost` que a avaliação já devolve.
- **Painel**: contrato da guarda de tipo e do serviço de formatação; a tela fecha com prints.
