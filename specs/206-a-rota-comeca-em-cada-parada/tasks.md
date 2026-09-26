# Tasks — 206 A rota começa em cada parada

> **Revisão 2, 2026-09-26.** A troca de parada saiu (spec.md § "Revisão 2", D4). As tasks que existiam
> para ela mudaram de conteúdo: a T2.1/T2.2 trocam "a troca" pela recusa `409 TRIP_HAS_STOP_EN_ROUTE`, a
> T2.3 perde a escrita em duas paradas, a T4.1/T4.3 trocam o diálogo de confirmação pelo botão
> bloqueado com motivo e atalho, e a T0.1 passa a emendar a ADR-0088.
>
> **Revisão 3, 2026-09-26 — a Q4 foi respondida ("Desfazer sempre, com registro") e nasceu o "Cancelar
> rota"** (spec D18/D19). Entra trabalho em quase toda fase: o kind `departure_cancelled` na **mesma**
> migration da Fase 1, a rota `cancel-departure` na Fase 2 (T2.1a/T2.2a/T2.3), o descarte da saída
> cancelada na amostra (Fase 3), o botão com confirmação na Fase 4, o segundo rótulo na linha do tempo
> (Fases 0/5) e o aviso de cancelamento na Fase 7 (T7.2–T7.4).
>
> **Revisão 4, 2026-09-26 — cada Iniciar rota avisa o cliente** (decisão do usuário). Muda só a Fase 7: a
> unicidade do aviso ganha o `departure_event_id` (T7.2), a reserva de vaga virou `sent + outstanding <
cap`, e a **Q5** ficou aberta (teto de avisos por parada e endereço). As Fases 0–6 não mudaram com esta
> revisão.
>
> **Revisão 5, 2026-09-26 — a Fase 7 nasce desligada, por configuração de empresa** (decisão do usuário),
> e o aviso passa a ser um evento com destinos (spec D20). A fase é implementada e sobe **sem efeito**; a
> **Q5 deixa de bloquear** (desligado, o pior caso é zero e-mail) e vai ao usuário quando a primeira
> transportadora for ligar; o env `RECIPIENT_NOTICE_ENABLED` **não nasce**; entram
> `company_recipient_notice_settings` (dois interruptores, `default false`), a `RecipientNoticePort` com
> um único adaptador de e-mail, `channel` na outbox e no registro, e o teto por `(company_id, channel)`.
> Mexe em T7.0–T7.7; as Fases 0–6 seguem intactas.

## Regras que valem para todas as tasks

- **Uma task por vez, na ordem.**
- **Contrato antes da implementação.** O `evidence.md` guarda a saída vermelha e depois a verde.
- **API: os dois comandos, de dentro de `apps/api-transportada`.** Nenhum cobre o outro:

  ```bash
  bun --env-file=../../.env.test test --timeout 120000   # contratos
  bun --env-file=../../.env.test run test:integration    # integração, exercita o banco
  ```

  - Suíte nova de contrato entra num **entrypoint nomeado** listado no `test` do `package.json`
    (`test/driver-trip.contract.test.ts`, `test/trip-application.contract.test.ts` ou o de
    `trip-schema`).
  - Suíte nova de integração é **acrescentada à mão** à lista de `test:integration`. Sem isso, ela
    não roda.

- **Typecheck:** `bun run typecheck` na raiz, em toda task.
- **Task com migration** fecha também com `make migration-test`, com `rollback.sql` à mão e
  `db:generate` = no_changes.
- **Commit isolado por task**, com caminhos explícitos e `--no-verify`: o hook de pre-commit varre a
  árvore, que tem trabalho de outras sessões.
- **Publicação:** `fetch → rebase origin/staging → bun install --frozen-lockfile → gates → push`,
  encadeados com `&&`. Rodar o prettier nos `.md` antes do push.
- **Ordem de deploy e reversão (D16):**
  - subida: painel tolerante → banco e API → app;
  - reversão: app → API → banco.

## Fase 0 — ADR, premissas e tolerância do painel

> 🤖 Modelo: `opus` (T0.3 é `sonnet`)

- [x] **T0.1** 🧠 Conferir a ADR-0088 contra o código e passá-la a `aceita`. **Feita em 2026-09-26** —
      evidência em `evidence.md` § "T0.1". O rebase pedido aqui **não** foi possível (árvore com WIP de
      outras sessões): as onze premissas foram conferidas contra `origin/staging` por `git grep <ref>`,
      e a divergência da árvore ficou registrada em `evidence.md` § "Base da árvore".
  - **Antes de tudo, alinhar a ADR-0088 com a Revisão 2** (é a única mudança de decisão permitida
    aqui): o `docs/adr/0088-a-rota-comeca-em-cada-parada.md` ainda diz "esta ADR decide o desenho:
    evento, estado, fila, **troca**, travas…" (`:10`) e "**Tocar noutra parada troca, sem recusar.** A
    tela pede confirmação…" (`:58`). As duas linhas passam a descrever o bloqueio na tela, a recusa
    `409 TRIP_HAS_STOP_EN_ROUTE` e a trava com a justificativa nova (serializar a leitura de "alguma a
    caminho?"), citando o pedido do usuário de 2026-09-26 e o desenho anterior.
  - **A ADR-0088 também recebe o cancelamento** (Revisão 3, resposta da Q4): a §2 ganha o "Cancelar
    rota" como terceiro caminho de saída, com o evento `departure_cancelled`, o
    `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` e o fato de que cancelar não inicia outra parada; a §7
    ganha o aviso de cancelamento com a supressão dentro dos 2 min e a vaga reservada no teto; os
    decisores ganham a resposta da Q4 de 2026-09-26. **Conferir também a linha "Recusar a segunda parada
    a caminho" nas alternativas descartadas**, que ficou desatualizada.
  - As **Revisões 4 e 5** (cada Iniciar rota avisa; o aviso nasce desligado e é um evento com destinos)
    já estão escritas na ADR — aqui é só conferir que a §7 e os decisores batem com as D19/D20 da spec.
  - Rebase sobre `origin/staging` antes; a branch estava 106 commits atrás.
  - Conferir as onze premissas de `plan.md`, com arquivo:linha.
  - Conferir o estado da 192 (T0.2), 193 (T6.5), 196, 197, 205, 207 e de `3e3730732`.
  - Rodar `git diff --name-only origin/staging...HEAD` contra a tabela de conflito.
  - Emendar a ADR-0081 na tabela "Finalidade": a linha "Iniciar rota" passa a ser "base do tempo de
    trajeto da parada".
  - Avisar na 196 (`tasks.md`, T5.3) que a app nova não chama mais o `start-route` e que o teste de
    3,2 s do toque direto perde o alvo.
  - Emendar as duas ADR-0058 com "Emendada por ADR-0088":
    `docs/adr/0058-a-viagem-comeca-e-termina-por-toque-do-motorista.md` e
    `docs/adr/0058-o-motorista-abre-a-porta-do-despacho.md`.
  - Premissa que divergir: pare e pergunte.

  **Aceite:** ADR-0088 `aceita` **e sem nenhuma menção a troca de parada**, as emendas commitadas e o
  `evidence.md` com cada premissa e o arquivo:linha conferido.

- [x] **T0.2** 🧠 Escrever no `evidence.md` o roteiro de publicação e de reversão da D16. **Feita em
      2026-09-26**, com o parecer do `architect` colado. ⚠️ A sonda da T2.6 como estava escrita **não
      provava o que dizia** (o `401` sem token é anterior ao `matchRoute`): ela ganhou uma quinta
      requisição de controle, UUID canônico, token nomeado e a exigência de corpo `.strict()`, que virou
      **obrigação da T2.1**.
  - O que sobe em cada etapa.
  - A sonda da T2.6.
  - O critério para reverter cada peça.

  **Aceite:** o roteiro revisado pelo `architect` (opus), e o parecer colado no `evidence.md`.

- [x] **T0.3** Painel tolerante (D12). **Feita em 2026-09-26**, pelo caminho longo ("Senão") — a 192
      T0.2 não está em `origin/staging`. Evidência em `evidence.md` § "T0.3". ⚠️ Precisou também dos dois
      kinds e da prioridade 0 em `apps/api-transportada/src/trips/application/trip-timeline.types.ts`: o
      contrato de **paridade exata** entre a lista do painel e a da API
      (`test/trip/timeline.contract.ts:233-243`) não deixa publicar um lado sem o outro. O mapeamento de
      `listStopEventRows` **segue na Fase 2**.
  - **Se a 192 T0.2 já estiver em `origin/staging`,** basta acrescentar `stop.departed` e
    `stop.departure_cancelled` a `TRIP_TIMELINE_KINDS` (`trip.types.ts:267-277`), com os rótulos.
  - **Senão:**
    1. contrato em `test/trip/timeline.contract.ts`: a página com um item de kind desconhecido entre
       dois conhecidos passa, e o desconhecido é descartado; as páginas com `stop.departed` e com
       `stop.departure_cancelled` passam;
    2. implementar em `tripResponse.validation.ts:901-911` e `:1299-1325`, no molde de `694de05b5`;
    3. os rótulos "A caminho da parada {{sequence}}" e "Cancelou a rota da parada {{sequence}}" em
       pt/en, em `tripTimeline.service.ts` e em `TripTimeline.component.tsx`.

  **Aceite:** `test`, `typecheck` e `lint` do painel verdes, e **publicado antes da Fase 2**.

## Fase 1 — Banco

> 🤖 Modelo: `opus` 🧠 (constraint, índice e rollback destrutivo)

- [ ] **T1.1** 🧠 Contratos antes (CA1).
  - Em `test/database-migration/trip-constraints.assertion.ts` (hoje `:486-492`):
    - `departed` e `departure_cancelled` aceitos, `chegou` e `cancelado` recusados;
    - `trip_stops_en_route_open_check` recusa `en_route_since` com `arrived_at` e com `completed_at`;
    - `trip_stops_en_route_tapped_check`;
    - o índice único parcial recusa duas paradas a caminho.
  - `test/database-migration/stop-departure-rollback.assertion.ts` (novo): semeia um `departed` **e um
    `departure_cancelled`**, roda o rollback, prova o `DELETE` dos dois, o CHECK antigo e a linha do
    journal removida.

  **Aceite:** os casos rodam e falham.

- [ ] **T1.2** 🧠 `trip.schema.ts` e `drizzle/<ts>_stop_departure/{migration.sql, rollback.sql,
snapshot.json}` conforme o plano, e a cópia do schema no worker (`tapped_at`).
  - **Os dois kinds na mesma migration** (`departed` e `departure_cancelled`): recriar o CHECK duas
    vezes seria trabalho e risco de graça.
  - Conferir antes o número da migration em `origin/staging`: outras sessões geram migrations, e a
    205 é `20260926003822_late_registration`.

  **Aceite:** T1.1 verde, os dois comandos da API, `make migration-test` e `db:generate` =
  no_changes.

- [ ] **T1.3** Medir em produção, no banco `Postgres-Hqfu` e só com `count(*)`, as tabelas
      `trip_stops` e `trip_stop_events`. Confirmar ou trocar o `VALIDATE` imediato e o índice sem
      `concurrently`. **Aceite:** números e decisão no `evidence.md`.

## Fase 2 — API do motorista

> 🤖 Modelo: `sonnet` (T2.2, T2.2a e T2.3 🧠 — validar a transação e as travas com `architect` opus
> antes)

- [ ] **T2.1** Contratos antes (CA2), em `test/driver-trip/stop-departure.contract.ts`, importado em
      `test/driver-trip.contract.test.ts`.
  - A rota exige `Idempotency-Key` e `tappedAt`, aceita `location` e recusa chave extra.
  - Respostas `201` e `200` com `changed`.
  - **`409 TRIP_HAS_STOP_EN_ROUTE`** com outra parada a caminho, com `enRouteStopId` e
    `enRouteStopSequence` no corpo do erro, e **nada gravado**.
  - **A ordem das decisões da D2:** com outra parada a caminho **e** `tappedAt` velho, a resposta é
    `changed: false` (no-op), não `409`.
  - O `recall` de um no-op devolve `changed: false`.
  - O contrato da ADR-0081 §7 recebe o `depart` **só se já existir** (196).
  - `test/trip-application/departure-order.contract.ts`: a comparação do `tappedAt` com a tolerância
    e a janela.
  - `test/trip-schema/stop-en-route-writers.contract.ts` (estático): todo `update(tripStops)` que
    grava `arrivedAt` ou `completedAt` zera `enRouteSince` e `enRouteTappedAt`.

  **Aceite:** os casos rodam e falham.

- [ ] **T2.1a** Contratos antes do cancelamento (CA2), na mesma suíte
      `test/driver-trip/stop-departure.contract.ts`.
  - `cancel-departure` exige `Idempotency-Key` e `tappedAt`, aceita `location` e recusa chave extra (o
    corpo é o mesmo do `depart`, e o parser é reusado).
  - `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` com `reason: 'arrived'` e com `reason: 'completed'`.
  - Parada sem "a caminho" → `200 changed: false`, e o replay repete.
  - `tappedAt` velho → no-op **antes** da recusa.

  **Aceite:** os casos rodam e falham.

- [ ] **T2.2** 🧠 Integração antes (CA3, CA4), em `test/integration/me-trip-departure.integration.ts`,
      acrescentada à mão a `test:integration`.
  - `dispatched` → `on_delivery_route`, com `trip_status_events` no canal `driver_app` e ponto nulo.
  - O segundo `depart` na mesma parada responde `changed: false`, sem evento.
  - **O replay do no-op repete `changed: false`.**
  - **O `depart` numa segunda parada com outra a caminho responde `409 TRIP_HAS_STOP_EN_ROUTE`**, sem
    evento novo, **sem tocar a parada aberta** e sem deixar a chave liquidada (o mesmo item pode ser
    reenviado depois).
  - **Fechar a parada aberta libera, pelos três caminhos:** (i) chegada + entrega registrada,
    (ii) "Registrar entrega depois" (205, `lateRegistration: true`) e (iii) **`cancel-departure`**.
    Depois de cada um, o `depart` da segunda parada responde `201`.
  - Chegada `driver_app` zera a viagem; chegada `office` zera só a própria parada (M4).
  - O `tappedAt` anterior ao último `arrived` vira no-op, **inclusive com outra parada a caminho**
    (ordem das decisões da D2).
  - `depart` em parada chegada ou concluída responde `changed: false`.
  - Viagem cancelada responde `404`.
  - **C1:**
    - (a) o escritório dá baixa na última nota de uma parada a caminho (`fillMissingArrival`);
    - (b) o motorista com `lateRegistration` dá baixa na última nota sem chegada;
    - (c) Iniciar rota e depois "Registrar entrega depois".
  - **CA4:**
    - mesma parada em dois celulares gera um `departed` só;
    - duas paradas concorrentes deixam uma só a caminho, e o perdedor recebe **`409`, nunca `500`**
      (a trava responde antes do índice único);
    - `depart` × baixa do escritório nunca viola o CHECK.

  **Aceite:** os casos rodam e falham. O caso (b) pode falhar pelo `completed_requires_arrived` da 205. Isso fica anotado, e o defeito é da 205.

- [ ] **T2.2a** 🧠 Integração antes do cancelamento (CA3, CA4), na mesma
      `test/integration/me-trip-departure.integration.ts`.
  - O cancelamento grava `departure_cancelled` com `tapped_at` e carimbo, zera `en_route_*` **só da
    própria parada** e **não** gera `trip_status_events` — a viagem segue `on_delivery_route`.
  - O `departed` continua na tabela depois do cancelamento.
  - Cancelar, iniciar outra parada e cancelar de novo: um evento por toque, nunca duas paradas a
    caminho.
  - Cancelar e iniciar a **mesma** parada de novo: dois `departed` e um `departure_cancelled` entre
    eles.
  - Parada chegada → `409 reason: 'arrived'`; parada concluída sem chegada (205) → `409 reason:
'completed'`.
  - Parada sem "a caminho" → `changed: false`; o replay repete.
  - Concorrência: `cancel-departure` e `depart` da mesma parada ao mesmo tempo se serializam pela trava,
    e o estado final é um só.

  **Aceite:** os casos rodam e falham.

- [ ] **T2.3** 🧠 Implementar:
  - `report-stop-departure.use-case.ts`, com as decisões na ordem da D2 e **escrevendo numa parada
    só** — não existe caminho que atualize duas linhas de `trip_stops`;
  - `cancel-stop-departure.use-case.ts`, com as mesmas travas, `clearStopEnRoute` da própria parada e
    **sem** transição de status;
  - em `trips/domain/trip.error.ts`: `TripHasStopEnRouteError` (`TRIP_HAS_STOP_EN_ROUTE`, `409`, com
    `{ enRouteStopId, enRouteStopSequence }`) e `TripStopDepartureNotCancellableError`
    (`TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`, `409`, com `{ reason }`);
  - `departure-order.policy.ts`, compartilhada pelas duas rotas;
  - na porta e no repositório: `lockTripStops`, `readDepartureDecision`, `markStopEnRoute`,
    `markTripOnDeliveryRoute` (molde `:310-343`), `markStopArrived` com alcance por canal e
    `completeStopIfSettled` zerando `en_route_*`;
  - `result_changed` no guard e no `recall`;
  - o schema, **as duas rotas** e a composição.
  - Sem extrair `applyFieldStep` e sem `catch` de `23505`.
  - **Nenhum caminho atualiza duas linhas de `trip_stops`** — cancelar não inicia parada nenhuma.

  **Aceite:** T2.1, T2.1a, T2.2 e T2.2a verdes, exceto o caso (b) se a 205 ainda não estiver corrigida, e os dois
  comandos da API inteiros verdes.

- [ ] **T2.4** `enRouteSince` e `enRouteTappedAt` em `GET /me/trips/current`.
  - Primeiro o contrato de serialização em `test/driver-trip/`.
  - Contrato de isolamento em `tenant-safety`.

  **Aceite:** contrato e integração (caso em `me-trip.integration.ts`) verdes, e sem N+1: as colunas
  vêm na mesma consulta de `listStops`.

- [ ] **T2.5** Linha do tempo: `stop.departed` e `stop.departure_cancelled`, o mapeamento e a
      prioridade 0 nos dois.
  - Primeiro o contrato: prioridade inteira, e os dois abaixo de `trip.status_changed`.
  - Depois os casos em `test/integration/trip-timeline.integration.ts`: item com `stop { id,
sequence }`, e a página com `departed`, `departure_cancelled` e `arrived` paginada sem perder item.

  **Aceite:** os dois comandos da API verdes.

- [ ] **T2.6** Sonda de publicação (ADR-0081 §9), sem efeito nenhum.
  - Depois do deploy da API em staging, um `POST .../stops/<uuid>/depart` e um
    `POST .../stops/<uuid>/cancel-departure`:
    - sem token respondem `401`;
    - com token de teste e uma chave extra no corpo respondem `400` (não `404`), o que prova que as
      rotas existem e passam do roteamento.

  **Aceite:** as quatro respostas no `evidence.md`, antes da Fase 4 subir.

## Fase 3 — A duração do trajeto

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Contratos antes (CA5), em `test/trip-application/stop-travel-sample.contract.ts`,
      importado em `test/trip-application.contract.test.ts`.
  - Entram: relógio do aparelho e relógio do servidor.
  - Ficam fora: misto, `expired`, `office`, interrompido, irmã sem `departed`, piso e teto, sem
    `departed`.
  - Parada com mais de um `departed` no histórico: vale o **último** antes do primeiro `arrived`.
  - **`departed` com `departure_cancelled` depois dele fica fora** (D11): saída cancelada não é trajeto.
  - Cancelou e iniciou de novo: entra, contando do `departed` mais novo.
- [ ] **T3.2** Implementar a política, a porta e a consulta, mais o contrato de que nada fora do
      teste e do `debug` importa a porta.
  - Integração em `test/integration/stop-travel-samples.integration.ts`, à mão em
    `test:integration`.

  **Aceite:** T3.1 verde, a integração verde e os dois comandos da API inteiros verdes.

## Fase 4 — App do motorista

> 🤖 Modelo: `sonnet`

- [ ] **T4.0** Pré-requisito: `3e3730732` ("Cheguei libera a entrega") e a 205 em `origin/staging`.
      Sem eles, pare e pergunte.
  - A **Q4 já está respondida** (usuário, 2026-09-26: "Desfazer sempre, com registro"): nada a
    perguntar. O "Cancelar rota" é escopo, com o desenho da D18/D19.
- [ ] **T4.1** Contratos antes (CA6, CA7), importados em `test/driver-trip.contract.test.ts`.
  - `test/driver-trip/en-route-stop.contract.ts` (novo), para `resolveEnRouteStopId`,
    `canReportArrival` e `canStartRouteAtStop`:
    - snapshot;
    - fila;
    - **com outra parada a caminho (snapshot ou fila), `canStartRouteAtStop` devolve
      `{ enabled: false, reason: 'other_stop_en_route', blockingStopId }`**, e a parada aberta segue
      `enabled: true` para o Cheguei;
    - `arrive` na fila zera e **libera as outras**;
    - **`cancelDeparture` na fila zera e libera as outras**, sem sinal;
    - itens `deliver`/`return` na fila cobrindo **todas** as notas pendentes da parada a caminho
      liberam as outras (205, sem sinal); cobertura **parcial não** libera;
    - **item recusado ignorado (M5)**;
    - **`enRouteSince` ausente libera o Cheguei e esconde o Iniciar rota (M6)**;
    - `null` explícito exige Iniciar rota;
    - irmã com chegada (se a 197 já estiver lá);
    - `route_planned` esconde.
  - `test/driver-trip/stop-departure.contract.ts` (novo): os itens `depart` e `cancelDeparture` levam
    `tappedAt` igual ao `createdAt`, o corpo é `{ tappedAt, location }`, e o caminho do
    `cancelDeparture` é `.../stops/:stopId/cancel-departure`.
  - **"Cancelar rota" só existe na parada a caminho e sem Cheguei**: contrato de `canCancelDeparture`
    (ou do cartão) cobrindo parada a caminho, parada chegada, parada concluída e parada fora de rota.
  - `event-queue.contract.ts`: `depart` com `stopId` e o rótulo com o N do snapshot (RF8), sem
    número quando a parada sumiu, e o item recusado por `TRIP_HAS_STOP_EN_ROUTE` com o motivo
    ("Outra parada está a caminho — feche a parada N") e o atalho (RF8b).
  - `dispatch.contract.ts:168-200` reescrito: não existe botão de viagem, e o selo "Em rota de
    entrega" continua.
  - `findCurrentStop` com parada a caminho.

  **Aceite:** os casos rodam e falham.

- [ ] **T4.2** Implementar:
  - tipos, validador (ausente ≠ `null`), cliente e fila, com o `rejectionCause` de
    `TRIP_HAS_STOP_EN_ROUTE` (o item **fica** na fila, como no `404`);
  - `enRouteStop.service.ts` (com `canStartRouteAtStop` devolvendo `blockingStopId`) e
    `driverTripView.service.ts`;
  - a página: `onDepart` e `onCancelDeparture` com `tappedAt`, sem o botão de viagem, mais
    `onFocusStop(stopId)` (`scrollTo` + `focus()`), usado pelo atalho do cartão e pelo da fila;
  - os locales pt/en, com `departBlocked.*` e `cancelDeparture.*`, e **sem** chaves de troca.

  **Aceite:** T4.1 verde e `bun run --cwd apps/frontend-driver check` verde.

- [ ] **T4.3** O cartão nos três estados **e o botão bloqueado**, conforme o `## Preview` da spec,
      com alvo de toque ≥ 44 px e ícones pela regra de `web.md` §9.
  - O botão fica `disabled` com `aria-disabled`, **visível**, nunca escondido.
  - O motivo vai em **texto no cartão**, não só em `title`, nomeia os **três** caminhos de saída, e o
    atalho "Ir para a parada N" rola até o cartão da parada aberta e põe o foco nele, sem iniciar nada
    (`web.md` §11.3).
  - **"Cancelar rota"** como ação secundária (ghost) na parada a caminho, com a confirmação do `##
Preview` — ela diz o efeito no cliente, e o botão desaparece depois do Cheguei.

  **Aceite:** `check` verde e `touch-target.contract.ts` verde.

- [ ] **T4.4** Smoke (CA9): `test/driver-app.smoke.spec.ts` toca Iniciar rota → Cheguei → Entreguei
      e espera três confirmações na fila. Mais um caso: com a parada 1 a caminho, o "Iniciar rota" da 2
      está desabilitado e o atalho leva ao cartão da 1; depois de fechar a 1, ele libera. E mais um:
      Iniciar rota → Cancelar rota (com a confirmação), com o cartão voltando ao estado 1 e o "Iniciar
      rota" das outras liberado.
      **Aceite:** `make smoke` (motorista) verde.
- [ ] **T4.5** Preview local (CA10).
  - A API de demonstração **versionada** em `apps/frontend-driver/scripts/driver-preview-api.ts`, na
    **53901**:
    - se a 196 T5.0 ainda não a criou, criar aqui a partir da cópia do scratchpad e apontar o
      `motorista-api-demo` do `.claude/launch.json` para ela;
    - ela ganha `depart` (com o `409 TRIP_HAS_STOP_EN_ROUTE`), `cancel-departure` (com o
      `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`), `enRouteSince` e `enRouteTappedAt`.
  - A app em `motorista-local`, na **53200**.
  - Prints em **375 px e 768 px** dos três estados, do **botão bloqueado com o motivo e o atalho**, do
    **"Cancelar rota" e da sua confirmação** e da fila com o item recusado, enviados ao usuário.

  **Aceite:** o **"pode subir"** do usuário, anotado no `evidence.md`. Sem ele, não há push da app.

## Fase 5 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Se a T0.3 publicou só a tolerância, entram agora os rótulos e os ícones do
      `stop.departed` e do `stop.departure_cancelled`, com contrato em `timeline-view.contract.ts`, e o
      print no `painel-local`.
      **Aceite:** `test` verde e os prints.

## Fase 6 — Revisão de design, documentação viva e publicação

> 🤖 Modelo: `sonnet` (revisão final → `code-reviewer` com `opus`)

- [ ] **T6.1** Revisão de design e usabilidade (`web.md` §15).
  - O cartão contra os vizinhos.
  - O contraste nos dois temas.
  - O texto que diz o próximo passo.

  **Aceite:** prints, com as divergências consertadas ou listadas.

- [ ] **T6.2** Documentação viva.
  - `apps/api-transportada/CLAUDE.md` § "Viagem": a rota `depart`, `en_route_*`, `stop.depart`,
    `result_changed`, o `409 TRIP_HAS_STOP_EN_ROUTE` (uma parada a caminho por vez, sem troca), a rota
    `cancel-departure` com o `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` e o kind
    `departure_cancelled`, e a regra dos escritores de `arrived_at`/`completed_at`.
  - `apps/frontend-driver/CLAUDE.md`: a fila com `depart`, `cancelDeparture` e `tappedAt`, o fluxo de
    três toques e o bloqueio das outras paradas com os três caminhos de saída.
  - `docs/ai-context/*.md`.

  **Aceite:** diff revisado.

- [ ] **T6.3** Auditoria final (code-standart §15 e `security.md`).
  - N+1 no snapshot.
  - PII em log.
  - `tenant-safety`.
  - A revisão do `code-reviewer` (opus).

  **Aceite:** o parecer no `evidence.md`, sem achado alto aberto.

- [ ] **T6.4** Publicação na ordem da D16, com a sonda da T2.6 entre a API e a app. Staging com os
      gates verdes; produção só com aprovação humana.

## Fase 7 — Aviso ao destinatário, sem custo, **nascendo desligado** (separada)

> 🤖 Modelo: `opus` 🧠 em T7.0–T7.2; `sonnet` em T7.3–T7.7
>
> **Decisão do usuário, 2026-09-26** (spec D20): esta fase é **implementada e sobe sem efeito**. O
> interruptor é **configuração de empresa**, desligado de fábrica — nada de variável de ambiente para
> ligar. Desligado significa **nada enviado e nada gravado**. O aviso é um evento publicado numa
> `RecipientNoticePort`, com o e-mail como **único** adaptador; WhatsApp e webhook de parceiro ficam
> previstos e **não** são implementados aqui.
>
> Consequência prática para quem executa: **nenhuma task desta fase manda e-mail em produção**, e o
> "ligar" é uma conversa com a transportadora, depois. A T7.0 continua medindo antes de fixar o teto.
>
> Depende da **193 T6.5** (`nfe_participants.email`) em `origin/staging`. As Fases 0–6 não dependem
> desta.

- [ ] **T7.0** 🧠 Medir e conferir antes de fixar (D13).
  - O volume diário e mensal dos e-mails que a conta do `RESEND_API_KEY` já manda.
  - **Pelo nome**, que o worker de produção tem `RESEND_API_KEY` e `EMAIL_FROM`, com
    `railway variables --json | jq 'keys'`, nunca o valor.
  - A cota e o limite de domínios do plano gratuito, e o campo que separa o `429` de taxa do de cota,
    na documentação do Resend.
  - Fixar `RECIPIENT_NOTICE_DAILY_CAP` e `RECIPIENT_NOTICE_MONTHLY_CAP` (proposta: 30 e 900), com a
    soma abaixo de 100 e de 3 000. **São tetos do canal de e-mail**, contados por
    `(company_id, channel)` (D20).
  - **Sem `RESEND_API_KEY` em produção a fase não para mais** (Revisão 5): ela sobe desligada, e o que
    fica impedido é **ligar o canal de e-mail** (`422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE`). O
    `evidence.md` anota o que falta para ligar.

  **Aceite:** números, fonte e decisão no `evidence.md`.

- [ ] **T7.1** 🧠 Registrar a decisão em `docs/SECURITY.md`:
  - legítimo interesse (art. 7º IX), com a finalidade de avisar a chegada da própria entrega **e o
    cancelamento dela** — o segundo e-mail serve ao mesmo titular e à mesma finalidade, e não amplia a
    base legal;
  - **a base legal é do evento, não do provedor** (D20): ligar outro canal (WhatsApp, webhook de
    parceiro) não amplia o que se compartilha, o conteúdo é o mesmo da D15 em qualquer destino, e um
    canal que exigisse dado a mais é **decisão nova, com ADR própria**;
  - **o aviso nasce desligado, por configuração de empresa** — e desligado não guarda dado nenhum;
  - opt-out por link;
  - supressão de bounce;
  - nada do motorista;
  - o teto abaixo da cota.

  Emendar a ADR-0079 B3 com o ponteiro para a ADR-0088 §7.

  **Aceite:** o ok do usuário ao texto antes do commit.

- [ ] **T7.2** 🧠 Contratos antes (CA11–CA13), com a migration e o `rollback.sql`.
  - `company_recipient_notice_settings`.
  - `contractors.recipient_en_route_notice_enabled`.
  - **A Q5 não é mais pré-requisito desta task** (Revisão 5): o aviso nasce desligado, então o pior caso
    de fábrica é zero e-mail. Ela vai ao usuário **quando a primeira transportadora for ligar o aviso**,
    e a T7.2 só deixa o gancho: o teto por parada, se vier, é uma coluna a mais nesta mesma tabela de
    configuração. O pior caso com a chave ligada está nos casos extremos da spec — **até 30 e-mails no
    mesmo endereço num dia, gastando a fatia diária inteira da instalação**.
  - **`company_recipient_notice_settings`** (novo), PK `company_id`, no molde de
    `company-delivery-proof-settings.schema.ts:59`:
    - `en_route_notice_enabled boolean not null default false` — o aviso;
    - `email_channel_enabled boolean not null default false` — o canal;
    - a migration **não liga ninguém**, e empresa existente nasce desligada pelo default;
    - **sem coluna para canal que não tem adaptador.**
  - **Sai o env `RECIPIENT_NOTICE_ENABLED`** (não nasce): o interruptor é de empresa. O que fica no
    ambiente é `RESEND_API_KEY` como pré-condição de custo do canal de e-mail.
  - **`channel`** na outbox e no registro do aviso, com o catálogo
    `RECIPIENT_NOTICE_CHANNELS = ['email','whatsapp','partner_webhook']` e
    `RECIPIENT_NOTICE_IMPLEMENTED_CHANNELS = ['email']` em `*.constant.ts`.
  - O registro do aviso: `status`
    `queued|sent|skipped_limit|skipped_opt_out|skipped_stale|skipped_arrived|skipped_cancelled|failed`,
    `kind` em `en_route|cancelled` e **`departure_event_id`** (o `trip_stop_events.id` do `departed` que
    originou o par) (D19).
  - A unicidade `(company_id, stop_id, email_hash, kind, departure_event_id)` — **cada Iniciar rota é um
    par novo de avisos**, e o replay do `depart` ou a drenagem dobrada não repetem nada.
  - A contagem diária e mensal por instalação e por empresa, com a reserva **por obrigação em aberto**:
    `sent + outstanding < cap` para o "a caminho", uma vaga para o cancelamento, e o cancelamento
    liquidando a obrigação que reservou a dele. **Não** usar `sent < cap - 1`: reserva uma vaga só para a
    instalação inteira e quebra com várias paradas a caminho ao mesmo tempo.
  - A supressão por `(company_id, email_hash)` com motivo.
  - A outbox, com o atraso de 2 min.
  - O schema de env recusa teto acima da cota. **Sem interruptor global**, os segredos passam a ser
    pré-condição do canal: `RECIPIENT_NOTICE_HASH_SECRET` e o segredo do webhook do Resend são exigidos
    **junto de `RESEND_API_KEY`** — com a chave presente e um segredo faltando, o boot falha; sem a chave,
    o canal de e-mail simplesmente não pode ser ligado (`422`).

  **Aceite:** os casos rodam e falham, e `make migration-test` verde.

- [ ] **T7.3** API.
  - `GET`/`PUT /company-settings/recipient-notices` (`settings.manage`), com os **dois** interruptores
    (`enRouteNoticeEnabled`, `emailChannelEnabled`) e
    `422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE` quando falta `RESEND_API_KEY` ou quando o canal pedido não
    tem adaptador. Ligar o aviso sem canal é aceito.
  - **A porta e o adaptador** (D20): `recipient-notice.port.ts`, `recipient-notice-email.gateway.ts`, o
    catálogo em `*.constant.ts` e o mapa canal → adaptador no `main.ts`. O caso de uso recebe a porta por
    construtor e não conhece provedor.
  - **Contrato do desligado, com dublê da porta:** aviso desligado → o `depart` e o `cancel-departure`
    **não** chamam a porta, **não** gravam aviso nem outbox e **não** tocam o contador. O dublê falha o
    teste se for chamado.
  - **Contrato do ligado:** aviso e canal ligados → a porta é chamada **uma** vez, com o
    `RecipientNoticeEvent` completo. Sem isso a chave viraria código morto.
  - O opt-in do contratante no cadastro.
  - O `depart` publicando o evento na porta, que grava o aviso e a outbox (`channel = 'email'`) na mesma
    transação, **quando os três interruptores estão ligados** — o aviso e o canal na configuração da
    empresa, e o opt-in do contratante.
  - O `cancel-departure`, na mesma transação: se a linha do aviso de "a caminho" **daquela saída** ainda
    está `queued`, ela vira `skipped_cancelled` e **nenhum** aviso de cancelamento nasce; se já está
    `sent`, nasce a linha do aviso de cancelamento, com o mesmo `departure_event_id` (D19).
  - O `depart` seguinte na **mesma** parada grava um aviso novo, porque o `departure_event_id` é outro —
    e um contrato prova isso, não o contrário.
  - As rotas `depart` **e `cancel-departure`** declaram `rateLimit` e entram em
    `test/rate-limited-routes.contract.test.ts`.

  **Aceite:** os dois comandos da API verdes.

- [ ] **T7.4** Worker.
  - O relay.
  - O relay lê a outbox **por canal** (`channel = 'email'`) e ignora canal sem adaptador.
  - As checagens: opt-out, supressão, chegada, toque velho **e cancelamento** — todas do **evento**,
    rodando antes de chamar o provedor (D20), nunca duplicadas dentro do adaptador.
  - O contador atômico, com a reserva por obrigação em aberto (`sent + outstanding < cap`) e a
    liquidação da obrigação quando o cancelamento sai.
  - O template do "não vou mais": as mesmas notas, sem previsão nova, sem nada do motorista, com o link
    de descadastro.
  - `429` de cota vira `skipped_limit` sem retry, e `429` de taxa tem backoff.
  - O template sem dado do motorista.
  - A retenção (registro em 90 dias, outbox em 7 dias depois de publicada).

  **Aceite:** `make worker-integration` verde e o e-mail conferido no Mailpit local.

- [ ] **T7.5** Rotas públicas.
  - Descadastro: token HMAC, limite por IP, página simples.
  - Webhook do Resend: Svix com `svix-signature.policy.ts`, eventos `email.bounced` e
    `email.complained`.
  - Contratos negativos: token adulterado, assinatura inválida, replay e evento desconhecido
    ignorado.

  **Aceite:** os dois comandos da API verdes, e as duas rotas no contrato de rotas públicas com
  limite.

- [ ] **T7.6** Painel: os interruptores da empresa (o aviso e o canal, os dois **desligados** na tela de
      uma empresa nova) e o do contratante, mais "não enviado — limite" no detalhe da parada.
  - A tela diz o que "desligado" significa, em uma frase: nada é enviado e nada é gravado.
  - Canal sem adaptador aparece **desabilitado**, com o motivo ("ainda não disponível"), em vez de sumir —
    é o que deixa visível o que está preparado (D20).
  - **Não confundir com o sino:** esta tela não mexe nas notificações internas nem nos avisos de
    ocorrência (D13).

  **Aceite:** prints e o ok do usuário.

- [ ] **T7.7** Revisão de segurança (`security-reviewer`, opus) e publicação, com aprovação humana
      para produção.
  - A publicação sobe a fase **desligada**, sem efeito nenhum em produção (plan.md § "Fase 7: sobe por
    último e sobe sem efeito"). Ligar é conversa posterior com a transportadora, e é o momento da Q5.
  - O parecer confere explicitamente que **desligado não grava nada** e que canal novo não amplia dado.

  **Aceite:** o parecer sem achado alto aberto.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/206-a-rota-comeca-em-cada-parada/ (leia spec.md,
plan.md, tasks.md e docs/adr/0088-a-rota-comeca-em-cada-parada.md antes de começar). Uma task por
vez, na ordem do tasks.md, Fases 0 a 6. A Fase 7 só começa com a 193 T6.5 em origin/staging e com a
T7.0 medida.
Modelos: Fase 0 → opus (T0.3 → executor model=sonnet) · Fase 1 → opus 🧠 · Fase 2 → executor
model=sonnet (T2.2, T2.2a e T2.3 🧠 → validar travas e transação com architect opus antes) · Fase 3 →
executor model=sonnet · Fase 4 → executor model=sonnet · Fase 5 → executor model=sonnet · Fase 6 →
sonnet, revisão final → code-reviewer model=opus · Fase 7 → T7.0–T7.2 opus 🧠, T7.3–T7.7 executor
model=sonnet, security-reviewer model=opus.
Cada task: contrato antes, typecheck, os dois comandos da API (contrato e test:integration com
--env-file=../../.env.test; suíte nova em entrypoint nomeado e test:integration editado à mão),
make migration-test onde houver migration, commit isolado com caminhos explícitos, evidência em
evidence.md.
A Fase 4 só começa com 3e3730732 e a 205 em origin/staging (T4.0). Preview na 53200 com a API de
demonstração versionada na 53901, prints em 375 e 768 px e o "pode subir" do usuário antes do push
da app.
Deploy: painel tolerante → banco/API (sonda T2.6) → app. Reversão: app → API → banco.
Atenção às Revisões 2 e 3 da spec: não existe troca de parada. A parada aberta bloqueia as outras na
tela, e a API recusa com 409 TRIP_HAS_STOP_EN_ROUTE; as saídas são três — confirmar, "Registrar entrega
depois" (205) e "Cancelar rota" (D18), que grava departure_cancelled e avisa o cliente (D19). Cancelar
não inicia outra parada, e nenhum caminho escreve em duas paradas. A T0.1 alinha a ADR-0088 antes de
qualquer código.
Pare e pergunte antes de: deploy em produção, rollback (destrutivo), qualquer premissa da T0.1 que
divirja, o texto do SECURITY.md (T7.1) e qualquer [NEEDS CLARIFICATION].
A Fase 7 nasce desligada por configuração de empresa e sobe sem efeito: nenhuma task dela manda e-mail em
produção. A Q5 (teto de avisos por parada) fica registrada para quando a primeira transportadora ligar o
aviso, e não bloqueia a execução.
```
