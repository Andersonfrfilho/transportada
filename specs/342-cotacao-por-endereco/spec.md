# Spec 342 — Cotação de frete por endereço

**Origem:** Anderson, 2026-11-15: "cotação não fica em km, você tem que relacionar tudo que temos hoje para fazer ela completa, não pode dar cotação incorreta". Revoga a D7 da spec 341 (distância informada pelo parceiro).

Specs do mesmo assunto lidas: 326 (cotação por custo, o cálculo), 338 (cotação pública), 341 (API de integração), 090 e 153 (estrada, pedágio por eixo), 084 e ADR-0044 (geocodificação).

## Decisões

- **D1. Uma conta só.** O preço continua saindo de `createCalculateFreightQuoteUseCase` (custo por km da empresa, diesel efetivo, piso ANTT, ad valorem, GRIS, margem). Esta spec só troca **de onde vêm a distância e o pedágio**: da estrada medida, nunca do chamador. `distanceKm` e `tollAmount` no corpo são `400` (`.strict()`).
- **D2. Endereço só com precisão de rua ou CEP.** Localiza por `geocoded_addresses` (chave `cidade|CEP|número`), depois Google (só com chave), e guarda o que comprou. Precisão `city` (centroide do município) erra quilômetros e pode trocar de praça: recusa com `422 FREIGHT_QUOTE_ADDRESS_NOT_LOCATED` e `details` com o lado.
- **D3. A estrada é a da viagem.** `readRouteGeometry` (OSRM, praças por nó OSM, tarifa por eixo com o ajuste da empresa). Estrada indisponível é `503 FREIGHT_QUOTE_ROUTE_UNAVAILABLE`; nunca reta, nunca palpite.
- **D4. Pedágio só entra inteiro.** Catálogo vazio ou com mais de 365 dias, praça da rota sem tarifa, ou leitura ausente: `422 FREIGHT_QUOTE_TOLL_UNKNOWN`. Queda para a tarifa manual de quem paga com tag superestima de propósito e é aceita, como na viagem.
- **D5. Eixos e tipo do veículo.** `axles` (2–9) e `vehicleType` (padrão `truck`) definem o multiplicador da tarifa (`resolveTollMultiplier`). A ocupação esperada da empresa já cobre a volta vazia, tanto em km quanto em pedágio.
- **D6. Superfícies.** `POST /integration/freight-quotes` (parceiro, só total e validade) e `POST /freight-quotes/by-address` (escritório, `freight.simulate`, resposta completa com composição). A rota por km (`POST /freight-quotes`) segue para o escritório simular.

## Fora de escopo desta entrega

Tela `/orcamento` por endereço (T5), cotação pública (338), barracão como ponto de partida (deadhead), escolha de rota mais barata.

## Riscos medidos a conferir em staging (T6)

Catálogo de praças carregado e em dia; OSRM acessível da API anônima; ao menos uma cotação real conferida contra uma viagem congelada da mesma rota.
