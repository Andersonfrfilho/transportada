# Feature 202 — A sugestão parte de onde o caminhão está

Veio da spec 192 depois da crítica de 2026-09-25. O desenho está na **ADR-0084**. **Depende da 192
publicada em staging**: a sugestão é um rascunho que só grava pelo `PUT /me/trips/current/stop-order`.

## Problema e resultado

Medido no código em 25/09/2026:

1. **O roteirizador só atende o escritório, e só antes do despacho.**
   - `POST /trips/:id/route-suggestions` usa `trip.manage` e responde `202`; o cálculo roda no worker,
     com orçamento padrão de 30 s (`drizzle-route-suggestion.repository.ts:41`).
   - O corpo não aceita origem (`route-suggestion-request.schema.ts:19-29`).
   - Viagem despachada é recusada (`drizzle-trip-route-gate.adapter.ts:18-31`).
2. **Origem, fim e relógio presos ao depósito e ao dia.**
   - `depot = readPoint(originAddressKey)` é a origem e também o fim com `endPolicy='depot'` (worker
     `drizzle-route-optimization.repository.ts:190-195`, :230-235).
   - As janelas contam da partida do dia: início do dia, mais hora de saída, mais fuso (:142-145,
     :216-222).
   - Entram as paradas já entregues (:488-503).
3. **Não há controle de sugestão em voo nem expiração.** Os status são
   `queued|running|ready|accepted|rejected|failed|stale` (`route-suggestion.schema.ts:44-52`).
4. **Coordenada pode vazar.**
   - O OSRM leva as coordenadas no caminho da URL (`osrm-routing-matrix.gateway.ts:45-46`).
   - Nenhum app tem `beforeBreadcrumb` no Sentry (worker/cron `sentry.service.ts:62-64`).

**Resultado:** no modo de ordem da 192, "Sugerir ordem" calcula a ordem das paradas que faltam a
partir de onde o motorista está. A posição é lida uma vez, com a finalidade na tela, e some quando o
cálculo termina. A proposta aparece como rascunho, com a diferença de distância e os bloqueios de
carga já marcados.

## Fora do escopo

- Rastreamento contínuo (o consentimento do Perfil continua separado).
- Sugestão para o escritório depois do despacho.
- Pedágio na sugestão.
- Mudar o solver.

## Histórias priorizadas

### P1 — Sugerir a partir de onde estou

**Given** a viagem `in_transit` com 5 paradas não concluídas **When** o motorista toca "Sugerir
ordem" e depois "Usar minha posição" **Then**:

- em até 30 s o editor mostra a ordem proposta, com "−12 km" e os bloqueios de carga marcados;
- ele pode mexer e salvar pelo fluxo da 192.

### P2 — Sem posição

**Given** o GPS negado **When** ele pede a sugestão **Then** o cálculo parte da última parada concluída
(ou do depósito), e a tela diz de onde partiu.

## Requisitos funcionais

- **RF1 — `POST /me/trips/current/stop-order-suggestions`.**
  - Exige `trip.report`, `Idempotency-Key` e `rateLimit` por usuário.
  - Corpo `.strict()`: `{ stopIds: uuid[2..200], origin: { latitude: -90..90, longitude: -180..180 } | null }`.
  - Resposta `202 { data: { suggestionId } }`.
  - Erros: posse `404`, estado `409`, conjunto `422` (as regras da 192) e
    `409 STOP_ORDER_SUGGESTION_IN_PROGRESS`.
- **RF2 — `GET /me/trips/current/stop-order-suggestions/:suggestionId`.**
  - Resposta
    `{ status, originKind: driver_position|last_stop|depot, stopIds?, distanceMeters?, previousDistanceMeters?, blockedStops? }`.
  - `blockedStops` vem da matriz da 192 (só o que a ordem proposta acrescenta).
  - Sugestão de outra viagem ou de outro usuário: `404`.
- **RF3 — Worker, pedido `driver_app`.**
  - Só as paradas não concluídas.
  - `origin` separado de `depot` (posição → última concluída → depósito).
  - O fim segue o `endPolicy`.
  - `departureEpochSeconds` = agora.
  - Orçamento ≤ 5 s.
  - Zera a coordenada na transação do resultado, com sucesso ou com falha.
- **RF4 — Rotina `stop-order-suggestion.expire`** (worker, 60 s).
  - Marca `failed` o pedido `driver_app` em voo há mais de 2 min.
  - Zera coordenada de toda sugestão fora de voo.
  - Entra nos quatro catálogos, com contrato de paridade.
- **RF5 — Redação.**
  - O gateway do OSRM loga só o host.
  - `beforeBreadcrumb` no Sentry do worker redige o caminho de `/table` e `/route`.
- **RF6 — App.**
  - No editor da 192, "Sugerir ordem" abre a folha de finalidade:

    > Para sugerir a ordem, a app lê onde você está agora, uma vez. A posição serve só para este
    > cálculo e é apagada quando a sugestão fica pronta.

  - Botões: "Usar minha posição" / "Sem minha posição".
  - A leitura só acontece depois do toque. Posição negada vira `origin: null`.
  - A app consulta o resultado a cada 1 s, até 30 s.
  - Quando fica pronta, a proposta preenche o rascunho com a diferença e os bloqueios.
  - O salvamento leva `suggestionId`.
  - Falha ou tempo esgotado: mensagem, e o rascunho fica como estava.

- **RF7 — O evento da 192** grava `source = order_suggestion`, `suggestion_id` e `origin_kind`, sem
  coordenada. Isso exige a coluna `origin_kind` em `trip_stop_order_events`: a migration desta spec
  a acrescenta, se a 192 ainda não a tiver.

## Requisitos não funcionais

- A coordenada vive em `route_suggestions` por poucos minutos no máximo (rotina de 60 s).
- Nada de coordenada em log, fila ou evento.
- O teste com banco do worker roda por `make worker-integration`, com a contagem de executados no
  `evidence.md`.

## Casos extremos e falhas

- **Worker cai no meio.** A rotina marca `failed` aos 2 min e zera a coordenada.
- **Parada concluída entre o pedido e o resultado.** O `PUT` da 192 recusa com `422`, e a app pede
  para sugerir de novo.
- **Duas paradas no mesmo endereço** (197) e pernas de 0 m: o solver precisa aceitar.
- **Viagem sem geocodificação** na última concluída: o cálculo cai no depósito, com `originKind`
  dizendo isso.

## Critérios de aceite

- **CA01** — Com posição: o worker parte dela, usa só as não concluídas, usa `departureEpochSeconds` =
  agora, e o fim é o depósito com `endPolicy='depot'`. Contrato do worker nos três pontos.
- **CA02** — Sem posição: `last_stop`; sem nenhuma parada concluída, `depot`.
- **CA03** — Ao gravar o resultado (sucesso **e** falha), a coordenada é nula.
- **CA04** — Pedido em voo por mais de 2 min: `failed`, com a coordenada nula.
- **CA05** — Segundo pedido em voo: `409`. Outra viagem: `404`.
- **CA06** — Nenhum log e nenhum breadcrumb com coordenada. O contrato do `beforeBreadcrumb` e o do
  gateway usam uma URL de exemplo.
- **CA07** — Paridade dos quatro catálogos.
- **CA08** — App: sem toque, não há leitura de posição; posição negada manda `origin: null`; tempo
  esgotado mantém o rascunho.
- **CA09** — Salvar a partir da sugestão grava `order_suggestion` e `origin_kind` no evento.
- **CA10** — Prints 375 e 768 da folha e da sugestão pronta, vistos pelo usuário no preview.

## Dúvidas

Nenhuma bloqueante.
