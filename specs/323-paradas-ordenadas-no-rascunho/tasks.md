# Tasks — 323

Modelo por etapa (regra do projeto): decisão e ordenador `opus`, plumbing `sonnet`, fecho `haiku`.

## Fase A — Ordenador puro e contrato

> 🤖 Modelo: `opus`

- [x] T1 Contrato antes do código: `orderStopsByRoad` (permutação, determinismo, não-pior, desempate, sem coordenada ao fim, inserção barata para origem `manual`), proibição de `haversine` no módulo.
- [x] T2 Implementar o ordenador (vizinho mais próximo + 2-opt, caminho aberto) em `trips/domain`.
- [x] T3 Porta `RoadMatrixPort` (N×N) + gateway OSRM `/table` com schema, timeout 5 s, falha = `null`; contrato do gateway.

## Fase B — API

> 🤖 Modelo: `sonnet`

- [x] T4 Migration aditiva + rollback: `trips.stop_order_source`, `trips.stop_order_error_code`.
- [x] T5 Serviço `orderDraftTripStops` (lê coordenadas por `address_key`, barracão, escreve via `reorderTripStops`) e ligação em `linkDocument`/`linkDocumentsBatch`, sem derrubar o vínculo.
- [x] T6 `POST /trips/:id/stops/auto-order`; reordenar manual grava `manual`; aceite da 058 grava `suggested`; DTO do detalhe expõe origem e código.
- [x] T7 Integração com Postgres (CA1–CA5), incluída na lista do `package.json` e rodada com `--env-file`.

## Fase C — Painel

> 🤖 Modelo: `sonnet`

- [x] T8 `quickCreateTrip`: tira a ordem em linha reta (RF7); detalhe da viagem com rótulo de origem, aviso e botão Ordenar paradas (componentes padrão).
- [x] T9 Prints claro/escuro × desktop/celular comparados com outra tela; textos em `.locale.json`.

## Fase D — Fecho

> 🤖 Modelo: `haiku`

- [ ] T10 `make check` verde; evidência em `evidence.md`; runbook e `apps/api-transportada/CLAUDE.md` atualizados.
- [ ] T11 Staging: reproduzir Matão/Monte Alto/Jaboticabal pela tela (CA6).
- [ ] T12 (074) Fechar T010/T011 da spec 074 com a mesma ida a staging.
