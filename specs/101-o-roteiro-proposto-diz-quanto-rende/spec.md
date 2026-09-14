# Feature 101 — O roteiro proposto diz quanto rende

> Registrada em 2026-09-08, a pedido do usuário, depois da correção do preço de combustível da
> spec 100. O painel de resultado existe e está preso na viagem de um veículo só.

## Problema e resultado

O painel de receita, custo, margem e lacunas é montado **num lugar só**: o diálogo "Nova viagem"
(`TripQuickCreateDialog.component.tsx:348`), que monta **uma** viagem, com **um** veículo.

A distribuição multi-veículo — a que nasce da busca de notas, seleciona N notas e N veículos e
devolve **várias** viagens propostas — mostra hoje, por veículo, apenas: a placa, a contagem de
paradas e o rótulo de cada parada (`MultiVehicleSuggestionDialog.component.tsx:169-200`). **Nenhum
número financeiro.**

Ou seja: a tela em que o operador escolhe entre distribuir a carga de um jeito ou de outro é
exatamente a tela que não diz qual dos jeitos paga. Quem decide aceitar a distribuição decide no
escuro, e depois descobre o resultado viagem por viagem, já aceita.

**Resultado esperado:** a sugestão multi-veículo mostra, por viagem proposta, receita · custo ·
margem com as mesmas lacunas nomeadas de hoje; e um **relatório do conjunto** com tempo total,
gasto total, lucro total e quais entregas couberam em qual veículo.

## O que já existe, e não se refaz

| fato                                                  | onde                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| a conta por veículo (receita, custo, margem, lacunas) | `readTripValuation` / `previewTripValuation`, `read-trip-valuation.use-case.ts:218`                                        |
| a prévia sem viagem criada                            | `POST /trips/valuation-preview`, `trip.routes.ts:670` — `trip.financials`                                                  |
| distância e duração **por parada**, já com o veículo  | `RouteSuggestionStop.{distanceFromPreviousMeters,durationFromPreviousSeconds,vehicleId}`, `route-suggestion.port.ts:24-45` |
| qual nota cai em qual parada proposta                 | `route_suggestion_stop_documents`                                                                                          |
| o desenho do painel                                   | `TripValuationPreview.component.tsx`, `buildValuationSteps`                                                                |

## D1 — A distância vem da sugestão, nunca de uma segunda consulta ao roteirizador

A prévia de hoje chama o OSRM (`osrm-route-geometry.gateway.ts:31`) para obter distância **e**
pedágio na mesma resposta. Reusar essa rota N vezes, uma por viagem proposta, é o caminho curto e
está **errado**: o solver já escolheu um trajeto, e uma segunda consulta pode devolver outro. A tela
desenharia um roteiro e cobraria outro, os dois plausíveis.

É a mesma regra que a spec 090 D4 já fixou para o pedágio — _"o pedágio viaja na resposta da rota,
nunca numa chamada própria"_ — aplicada um nível acima.

**Decisão:** a distância e a duração de cada viagem proposta são a **soma das paradas daquele
veículo**, lidas da sugestão que está na tela. Zero chamadas ao OSRM, e o número casa com o desenho
por construção.

## D2 — O pedágio fica de fora, e diz que ficou

O pedágio precisa dos `nodeIds` que o OSRM devolve em `annotations=nodes` (spec 090). A sugestão
**não os persiste**. Sem eles não há como saber que praças o trajeto atravessa.

**Decisão:** a parcela de pedágio da viagem proposta sai como lacuna própria
(`TOLL_NOT_AVAILABLE_IN_SUGGESTION`), nunca zero. Zero diria que o trajeto não tem pedágio, e numa
distribuição pelo interior de SP ele costuma ser a segunda maior parcela — um total sem ele parece
uma margem melhor do que é.

⚠️ Persistir os `nodeIds` por veículo na sugestão é o caminho que fecha isso, e é spec própria: mexe
na escrita do solver, não na leitura.

## D3 — Uma chamada, não N

A rota nova é `GET /route-suggestions/:id/valuation`, `trip.financials`, escopo `company`. Ela
devolve uma entrada por veículo proposto **mais** o total do conjunto.

N chamadas a `/trips/valuation-preview` seriam N idas ao OSRM (D1 já as proíbe) e N resoluções da
mesma tabela de frete, do mesmo preço de combustível e do mesmo regime federal — tudo por empresa,
não por veículo.

## D4 — O total do conjunto herda a pior origem, e soma as lacunas

Segue a regra que a ADR-0049 e a spec 075 já usam: **uma parcela ausente torna o total incompleto**.
O relatório do conjunto imprime `hasGaps` e a lista de lacunas por extenso, e é proibido mostrar
lucro total sem essa marca ao lado.

Tempo total é a **soma** das durações, não o máximo: são caminhões distintos rodando em paralelo, e
o que o operador quer saber é o custo de operação do conjunto, não quando o último chega.
⚠️ Se depois quisermos "quando termina o último", é um segundo campo, não uma troca deste.

## D5 — As entregas distribuídas saem por veículo, nomeadas

"Quais entregas foram distribuídas" é a lista de notas por viagem proposta, com a parada em que cada
uma caiu. Sai de `route_suggestion_stop_documents` — nunca de um reagrupamento por endereço feito de
novo no cliente, que poderia discordar do agrupamento que o solver usou (mesma razão da spec 058 P2).

## Fora de escopo

- Persistir `nodeIds` na sugestão para habilitar pedágio (spec própria).
- Congelar o resultado da sugestão: o congelado nasce quando a viagem fecha (ADR-0049 §5), e aqui
  nenhuma viagem existe ainda.
- Mudar o diálogo "Nova viagem", que já tem o painel.

## Aceite

1. Sugestão multi-veículo pronta mostra, por veículo, receita · custo · margem, com as lacunas
   nomeadas do vocabulário atual.
2. O relatório do conjunto mostra tempo, distância, gasto, lucro e a contagem de entregas por
   veículo — com a marca de incompleto quando houver lacuna.
3. Nenhuma chamada ao OSRM é feita para montar esses números: contrato que falha se a porta de
   geometria for tocada no caminho da sugestão.
4. A distância por veículo é igual à soma das paradas daquele veículo na sugestão exibida.
5. Pedágio aparece como lacuna declarada, nunca como zero.
6. Sem `trip.financials`, a seção financeira não existe — não é bloco vazio nem "—", pela mesma
   regra do painel de hoje.

## 🤖 Modelo recomendado

| etapa                                          | modelo    |
| ---------------------------------------------- | --------- |
| Desenhar a rota e o contrato do relatório      | `opus` 🧠 |
| Implementar rota, use case, repositório e tela | `sonnet`  |
| Rótulos, locales e passes mecânicos            | `haiku`   |
