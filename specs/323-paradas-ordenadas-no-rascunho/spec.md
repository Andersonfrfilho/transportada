# Feature 323 — Paradas ordenadas já no rascunho da viagem

## Problema e resultado

Hoje a parada nasce no vínculo da nota e `nextStopSequence` (`reconcile-trip-stops.use-case.ts`) a põe **no fim da
lista**. A ordem do rascunho é, portanto, a ordem em que as notas foram bipadas, e não a da rota. Caso real: a viagem
`d5fe956c` saiu com Matão, Monte Alto e Jaboticabal intercaladas. A única ordenação "automática" de hoje é a do
painel (`assemblyOrder.service.ts`, linha reta por cidade), que a ADR-0044 §1 chama de errada por construção, e o
roteirizador de verdade (058, OSRM) só roda quando o despachante clica em sugerir.

Resultado: **ao criar o rascunho, e a cada nota nova que entra nele, as paradas ficam na ordem de uma rota por estrada**
(OSRM, a partir do barracão), sem clique. O despachante continua podendo arrastar.

## Decisões (Anderson, 11/11/2026: "na criação do rascunho; entrando nota nova, reordena")

1. **Aplicada sozinha.** O vínculo (lote e nota avulsa) em viagem ainda não despachada chama o ordenador no fim da
   mesma requisição. Despachada ou fechada, nada muda (porta de não-retorno da ADR-0043, a mesma
   `checkTripAcceptsLinkage` do reordenar).
2. **Nota nova reordena, sem apagar o que o despachante fez.** Origem da ordem `suggested` (ou nunca ordenada): reordena
   tudo. Origem `manual`: a parada nova entra na **melhor posição de inserção** (menor custo por estrada) e as demais
   mantêm a ordem relativa que o despachante deu. Assim valem as duas frases de Anderson: nota nova reordena, e o ajuste
   manual não é desfeito.
3. **OSRM fora do ar não vira linha reta** (ADR-0044 §1 e §5). O vínculo **não falha**: a nota entra, a parada nasce no
   fim como hoje, a origem fica `unordered` com o código estável `ROUTING_MATRIX_UNAVAILABLE`, e o rascunho mostra o
   aviso "Não foi possível ordenar agora" com o botão **Ordenar paradas** (mesma operação, sob demanda). Sem tentativa
   automática em segundo plano: o próximo vínculo ou o botão tentam de novo.
4. **A origem da ordem é registrada.** `trips.stop_order_source` ∈ `unordered | suggested | manual` e
   `trips.stop_order_error_code` (nulo quando não houve falha). O reordenar manual (`PUT .../stops/order`) grava
   `manual`; o ordenador grava `suggested`; o aceite de uma sugestão da 058 grava `suggested`. Aparece no detalhe
   ("Ordem sugerida pela rota" / "Ordem ajustada por você").

## Fora do escopo

- Janelas de tempo, capacidade, frota e multiveículo: seguem na 058. Aqui é só a **sequência** das paradas de uma viagem.
- Reordenar quando a geocodificação de uma parada terminar depois do vínculo (ver Casos extremos).
- Viagem despachada (vale o snapshot).
- Trocar o solver da 058; o ordenador do rascunho é um módulo pequeno, puro e próprio da API (nenhuma app importa código
  de outra).

## Como ordena

Pontos: barracão da empresa (origem, `readDepot`) + uma coordenada por parada vinda de `geocoded_addresses` pela
`address_key`. Uma chamada `GET /table/v1/driving` do OSRM (matriz completa, já existe `osrm-route-distance-table.gateway.ts`
para origem→paradas; esta feature precisa da matriz N×N, ver T3). Caminho aberto (sem volta ao barracão, a política
`endPolicy` da empresa fica para a 058): vizinho mais próximo a partir do barracão e refinamento 2-opt, tudo função pura
com desempate estável (menor `sequence` atual), para o mesmo conjunto dar sempre a mesma ordem. Limite de tamanho: acima
de `DRAFT_STOP_ORDER_MAX_STOPS` (100) a matriz não é pedida e o caso é tratado como falha `ROUTING_TOO_MANY_STOPS`.

## Histórias priorizadas

### P1 — Rascunho nasce ordenado

**Given** um rascunho vazio e notas de Matão, Monte Alto e Jaboticabal bipadas intercaladas **When** o lote é vinculado
**Then** as paradas ficam na ordem da rota por estrada, `stop_order_source = suggested`, e a rota congelada é recalculada.

### P1 — Nota nova reordena

**Given** um rascunho com origem `suggested` **When** entra uma nota de outra cidade **Then** todas as paradas são
reordenadas. **Given** origem `manual` **Then** só a parada nova é encaixada, e as demais mantêm a ordem do despachante.

### P1 — OSRM fora do ar

**Given** o OSRM sem resposta **When** o lote é vinculado **Then** 201, notas vinculadas, ordem de chegada,
`unordered` + código estável, aviso na tela e botão **Ordenar paradas**; nenhuma distância em linha reta é usada.

### P2 — Ajuste manual vence

**Given** um rascunho ordenado **When** o despachante arrasta uma parada **Then** a origem vira `manual` e não volta a
`suggested` sem ação explícita (botão Ordenar paradas, que reordena tudo).

## Requisitos funcionais

- RF1 Ordenador puro `orderStopsByRoad` (matriz, origem, atuais) → ids na ordem; teste de propriedade: permutação do
  conjunto, determinístico, nunca pior que a ordem de entrada.
- RF2 Serviço `orderDraftTripStops` chamado por `linkDocument` e `linkDocumentsBatch`, depois da transação do vínculo,
  **nunca derruba o vínculo** (mesma regra de `freezeRouteGracefully`).
- RF3 Paradas sem coordenada (geocodificação pendente ou imprecisa) vão **para o fim**, em ordem relativa atual — o
  mesmo tratamento do `excludedFromOptimization` da ADR-0044 §5 — e a resposta diz quantas ficaram de fora.
- RF4 `POST /trips/:id/stops/auto-order` (`trip.manage`): mesma operação, para o botão; 409 em viagem despachada.
- RF5 Escrita pelo caso de uso `reorderTripStops` (nunca pelo repositório), como o aceite da 058.
- RF6 Migration aditiva (`stop_order_source` default `unordered`, `stop_order_error_code` nulo) com rollback; viagem
  antiga fica `unordered` e **não** é reordenada retroativamente.
- RF7 Painel: criação rápida (`quickCreateTrip.service.ts`) deixa de aplicar a ordem em linha reta por cidade, salvo se o
  operador mexeu na ordem das cidades no mapa (aí é ajuste manual e grava `manual`). Texto da tela deixa de dizer que a
  ordem do mapa é "a proposta".
- RF8 Padrão visual: aviso, botão e rótulo de origem com os componentes do design system; prints claro/escuro,
  desktop/celular, comparados com outra tela do painel.

## Requisitos não funcionais

- RNF1 Latência: matriz única, timeout de 5 s; vínculo de 300 notas continua uma requisição.
- RNF2 Segurança: `companyId` do contexto; coordenadas e endereço não vão a log; corpo da resposta do OSRM validado por schema.
- RNF3 Observabilidade: log estruturado com `tripId`, nº de paradas, resultado (`suggested`/`unordered`) e código.

## Casos extremos e falhas

- Parada sem coordenada: RF3. A geocodificação que termina depois não reordena sozinha (botão Ordenar paradas).
- Uma só parada, ou zero: nada a ordenar, origem não muda.
- Barracão sem geocodificação (`not_geocoded`): falha `ROUTING_DEPOT_NOT_GEOCODED`, tratada como OSRM fora do ar.
- Corrida: duas requisições de vínculo juntas — o ordenador relê as paradas sob o lock da viagem; a última vence.
- Viagem despachada entre o vínculo e a ordenação: 409 engolido no serviço, sem efeito.

## Critérios de aceite

- CA1 Contrato de integração com Postgres: lote intercalado sai na ordem esperada com matriz falsa determinística.
- CA2 Origem `manual` + nota nova: ordem relativa das antigas preservada.
- CA3 OSRM falhando: 201, `unordered`, código gravado, **zero** chamadas a cálculo de linha reta (teste estático proíbe `haversine` no módulo).
- CA4 Reordenar manual grava `manual`; aceite da 058 grava `suggested`.
- CA5 Despachada: nada muda.
- CA6 Staging: reproduzir o caso Matão/Monte Alto/Jaboticabal pela tela e conferir a ordem e o selo de origem.

## Spec 074 (erro 500 da sugestão multiveículo): conferido

O defeito (releitura por outra conexão) **está corrigido no código** de `staging`: `drizzle-multi-vehicle-suggestion.repository.ts`
relê pelo `transaction` e lança `MultiVehicleSuggestionWriteFailedError`, com o contrato de 409 (T009) e a mensagem no log (T006–T008) feitos.
Falta o que a própria 074 deixou aberto: **T010** (`make check` + integração) e **T011** (verificar em staging pela tela).
Esta spec não depende disso, mas a verificação de T011 em staging é barata e fica registrada como pendência da 074.

## Dúvidas

- [NEEDS CLARIFICATION: o aviso "mudou a ordem" deve ser mostrado quando uma nota nova reordena tudo (origem `suggested`)? Proposta: um toast discreto, sem confirmação.]
