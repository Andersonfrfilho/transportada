# ADR 0097 — A viagem na rua troca de motorista e de ajudante

- **Status:** aceita
- **Data:** 2026-10-07
- **Nasce da spec 249**
- **Citações:** spec 249, spec 217, spec 216, ADR-0043, ADR-0049 §5, ADR-0065, ADR-0067

## Contexto

A tripulação só se trocava até `route_planned` (spec 217), por um motivo que não vale para uma
viagem que já saiu: o separador não tem papel na mão. Motorista que passa mal, caminhão que quebra e
ajudante que falta precisam de troca com a viagem na rua, sem refazer a viagem e sem mexer em valor.

## Decisão

1. **Ação própria, janela própria.** `transferCrew` em `dispatched`, `in_transit` e
   `on_delivery_route`; `defineCrew` e a janela da 217 ficam como estavam. A viagem continua onde
   estava: status, veículo, rota, pedágio e ETA não mudam (ADR-0043: `dispatched` segue sendo a porta
   de não-retorno).
2. **Permissão `trip.report-on-behalf`** (a da baixa em nome do motorista, ADR-0067). O separador não
   a tem.
3. **Valor: recalcular e registrar a diferença, não congelar.** Frete e receita não dependem do
   motorista e não são tocados. O custo de motorista e de ajudante é recalculado com a tripulação
   nova, e o evento guarda o valor anterior, o novo e a diferença. A conta é a mesma da avaliação da
   viagem (ADR-0049 §5, viagem aberta calcula ao vivo), extraída para uma função pura e executada
   dentro da transação, sob lock.
4. **MDF-e: permitir, avisar e registrar.** O MDF-e carrega o condutor e o sistema não tem evento de
   inclusão de condutor. A troca é liberada, o evento marca a divergência e o painel avisa. Incluir o
   condutor é spec futura.
5. **Histórico append-only** em `trip_crew_events`, com autor, motivo obrigatório, tripulação anterior
   e nova.

## Consequências

- O resumo financeiro por motorista (`financial-summary.query.ts`) une o resultado congelado ao
  `trip_drivers` atual: depois de uma transferência o total da viagem migra para o motorista novo.
  Risco conhecido, fora desta ADR.
- Ações offline pendentes do motorista que saiu são recusadas (403/404); o escritório dá baixa em
  nome de quem está na tripulação.
- Sem push nem sino de atribuição (spec 217 D9).
