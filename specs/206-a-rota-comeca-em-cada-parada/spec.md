# Feature 206 — A rota começa em cada parada

> Registrada em 2026-09-25 a partir do pedido do usuário na app do motorista (`apps/frontend-driver`):
> "o iniciar rota é em cada item da viagem".
>
> - **São do usuário:** o fluxo por parada, o fim do botão de viagem e o que o toque faz. Sobre o
>   aviso ao cliente, ele disse no mesmo dia: "pode mandar e-mail se for sem custo".
> - **É desta spec e da ADR-0088** (`docs/adr/0088-a-rota-comeca-em-cada-parada.md`): o desenho.
>
> **Numeração.** Conferida em 2026-09-25, logo antes de criar a pasta, com
> `git fetch && git log --all -- 'specs/206*'` e `ls specs docs/adr`.
>
> - A 205 é o registro tardio.
> - A ADR-0085 está reservada para a 203, e a 0086 já existe.
> - A 0087 foi tomada pela spec 207 durante a escrita, por isso esta ADR é a **0088**
>   (`evidence.md`).
>
> **Revisão 1**, no mesmo dia, depois da crítica (opus): C1, M1–M8 e os menores. O registro está em
> `evidence.md`.
>
> **Revisão 2, 2026-09-26 — a parada aberta bloqueia as outras.** Pedido do usuário vendo a tela: "o
> botão de iniciar rota deveria ficar dentro de cada item da rota e se houver uma nao pode iniciar a
> outra" e, sobre o segundo toque, "bloqueia com um link para fechar a outra com o botão de confirmar
> ou fechar depois".
>
> - **Desenho anterior (Revisão 1):** tocar noutra parada **trocava** — a tela pedia "Você está a
>   caminho da parada 1. Ir para a parada 2?" e o servidor zerava a anterior e marcava a nova na mesma
>   transação.
> - **Desenho atual:** não existe troca. O "Iniciar rota" das outras paradas fica **bloqueado e
>   visível**, com o motivo e um atalho para a parada aberta; a API **recusa** o segundo `depart`
>   (D4). A parada aberta se fecha confirmando (Cheguei → comprovante) ou por "Registrar entrega
>   depois" (205), e são os dois que liberam as outras.
> - Isso **simplifica o servidor**: cai a transação de troca. A trava das paradas fica, com outra
>   justificativa (D4).
>
> **Revisão 3, 2026-09-26 — nasce o "Cancelar rota".** Resposta do usuário à Q4 ("Desfazer sempre, com
> registro"): cancelar a qualquer momento antes do Cheguei, sem janela de tempo, com o cancelamento no
> histórico e o cliente avisado de que o motorista não vem mais. Antes disso o default era **não haver
> saída** além de entregar ou "Registrar entrega depois". Viram a **D18** e a **D19**, e o cancelamento é
> o **terceiro** caminho de saída do bloqueio da Revisão 2. **Não é a troca de volta:** cancelar não
> inicia parada nenhuma, e ir para outra são dois toques.
>
> **Revisão 4, 2026-09-26 — cada Iniciar rota avisa o cliente.** Decisão do usuário sobre o ponto que a
> Revisão 3 deixou em aberto: _"Cada Iniciar rota manda o aviso, inclusive depois de um cancelamento. O
> cliente sempre sabe quando o caminhão está vindo; em troca, um motorista indeciso pode render três ou
> quatro e-mails na mesma parada."_ A unicidade do aviso passa a incluir o `departure_event_id` (D19), e
> a reserva de vaga no teto mudou de forma para continuar correta com uma **sequência** de ciclos. A **Q5
> ficou aberta**: um teto de avisos por parada e endereço — o pior caso está nos casos extremos.
>
> **Revisão 5, 2026-09-26 — o aviso nasce desligado, e é um evento com destinos.** Decisão do usuário:
> "nao enviar isso ainda implementar mas, deixa desligado por configuração" e "tbm deixe preparado para
> integrações com outros parceiros". A Fase 7 é implementada e sobe **sem efeito**: o interruptor é
> **configuração de empresa** (não variável de ambiente), desligado de fábrica para empresa nova e
> existente, e desligado quer dizer que **nada sai e nada é gravado**. O aviso passa a ser um
> `RecipientNoticeEvent` publicado numa `RecipientNoticePort`, com o e-mail como **primeiro** adaptador e
> WhatsApp/webhook de parceiro apenas previstos (**D20**). A **Q5 deixa de ser bloqueante**: com o aviso
> desligado, o pior caso é zero e-mail.
>
> **Isto não é o sino nem a notificação de ocorrência** (D13): aquilo fala com usuário interno e não é
> tocado por esta spec.

## Problema e resultado

Hoje "Iniciar rota" é **um toque por viagem**. Ele não diz para onde o motorista está indo, e nada
acontece entre esse toque e o "Cheguei" de cada parada. Medido no código em 2026-09-25 (premissas com
arquivo:linha em `plan.md`):

1. **O botão é da viagem.**
   - `DriverTripWorkspace.page.tsx:575` mostra "Iniciar rota" enquanto `canStartRoute`
     (`driverTripView.service.ts:41-43`) vale `dispatched` ou `in_transit`.
   - O toque é um `POST .../start-route` **direto e sem corpo** (`driverTripClient.service.ts:260-262`):
     fora da fila, sem chave de idempotência e sem posição.
   - Commits `8bb0a6fdc` e `38ad4446a`, só no frontend.
2. **Na API, o toque só troca o status.**
   - A rota `me-trip.routes.ts:299-326` tem `parse: () => undefined` e chama `startFieldTrip`
     (`start-field-trip.use-case.ts:87-163`).
   - Esse caso de uso abre a própria transação (`drizzle-current-driver-trip.repository.ts:166-203`) e
     grava só `trip_status_events`.
3. **O evento da parada não conhece a saída.**
   - `TRIP_STOP_EVENT_KINDS` é `arrived | delivered | returned | occurrence` (`trip.schema.ts:986-987`),
     com CHECK em `:1104-1107`.
   - Não existe `departed_at` nem "a caminho" na API.
4. **"Cheguei" libera a entrega, mas não depende de nada.**
   - O commit `3e3730732` trava Entreguei e Não entreguei atrás do Cheguei
     (`DriverStopCard.component.tsx:235-241`; `documentActivity.service.ts:70-78`) e cria o escape
     "Registrar entrega depois" (`:472`).
   - O "Cheguei" em si aparece em toda parada sem chegada (`:369-375`).
5. **O tempo de estrada real não é medido.**
   - A 198 tira a estrada da rota congelada e proíbe recalcular na leitura (198 D1).
   - Ela mede só o tempo **na** parada (198 D14, `specs/198-.../spec.md:194-224`).
6. **O destinatário não fica sabendo de nada** (D13).

**Resultado.** Cada parada tem o fluxo **Iniciar rota → Cheguei → Entreguei**.

- O botão de viagem some. O primeiro "Iniciar rota" de parada põe a viagem em rota.
- Cada toque grava um evento `departed`, com hora do toque e posição, pela mesma fila offline do
  "Cheguei".
- O toque marca a parada como **a caminho**, e só uma fica a caminho por vez.
- Com uma parada a caminho, o "Iniciar rota" das outras fica **bloqueado**, dizendo de qual parada o
  motorista está a caminho e levando até ela. Fechar a parada aberta — confirmando ou por "Registrar
  entrega depois" — libera as outras.
- O tempo "Iniciar rota → Cheguei" vira amostra de trajeto, com a regra de relógio da 198 D14.
- O painel mostra "A caminho da parada N".
- O destinatário recebe um e-mail "a caminho" **sem custo**, numa fase separada (Fase 7). O resto da
  spec executa sem ela.

## Fora do escopo

- **Consumir a amostra de trajeto** no ETA, no solver ou no quadro da 198. A 198 D1 não muda, e o
  consumo fica para a 058 T014 ou para uma emenda posterior (D11).
- **Recalcular a previsão pela posição do toque.** Seria finalidade nova para o ponto (ADR-0081,
  tabela "Finalidade"; ADR-0045 §3).
- **"Iniciar rota" pelo escritório em nome do motorista.**
  - `POST /trips/:id/start-route` (`trip-field-office-trip.routes.ts:113`) fica como está.
  - Não nasce `depart` de escritório: iniciar rota depois do fato não descreve nada e não pode
    avisar cliente.
- WhatsApp do motorista (`driverWhatsAppFlowActions`) sem "Iniciar rota" de parada.
- Aviso ao destinatário por WhatsApp ou SMS.
  - Não há driver (`notification-catalog.constant.ts:22-29`).
  - A 062 exige template aprovado na Meta e opt-out próprio (`specs/062-.../spec.md:156-157`, `:202`).
- Portal do contratante. Ele já mostra "A caminho" e o ETA (`contractor-delivery.query.ts:38`).
- Remover o `/start-route` da API (D10).
- **Trocar a parada a caminho por toque** (Revisão 2). Não há troca nem na tela nem no servidor: a
  parada aberta se fecha por um dos dois caminhos da D4, e só então outra pode começar.
- ~~**Desfazer o "a caminho" sem fechar a parada.**~~ **Passou a ser escopo** na resposta do usuário à
  Q4, em 2026-09-26: nasce o "Cancelar rota" (D18), com registro no histórico e aviso ao cliente (D19).
  O default anterior era não ter saída nenhuma além de entregar ou "Registrar entrega depois".

## Histórias priorizadas

### P1 — Iniciar rota na parada libera o Cheguei

**Given** a viagem `dispatched`, com três paradas e nenhuma a caminho, **when** o motorista abre a
parada 1 e toca "Iniciar rota", **then**:

- o cartão passa a "A caminho desde HH:MM" e mostra "Cheguei", na hora e mesmo sem sinal;
- quando a fila drena, a viagem vai para `on_delivery_route`;
- a linha do tempo do painel mostra "A caminho da parada 1".

### P1 — Só uma a caminho, e a parada aberta bloqueia as outras

**Given** a parada 1 a caminho, **when** o motorista abre a parada 2, **then** o "Iniciar rota" dela
aparece **desabilitado** (visível, nunca escondido), com "Você está a caminho da parada 1" e o atalho
"Ir para a parada 1", que rola até o cartão dela e põe o foco nele (`web.md` §11.3).

- **When** o motorista fecha a parada 1 — confirmando (Cheguei → comprovante → entrega registrada), por
  "Registrar entrega depois" (205) ou **cancelando a rota dela** (D18) —, **then** o "Iniciar rota" da 2
  e das outras libera na hora, ainda sem sinal.
- **When** um `depart` da parada 2 chega ao servidor com a 1 ainda a caminho — fila offline, outro
  aparelho —, **then** a API responde `409 TRIP_HAS_STOP_EN_ROUTE` nomeando a parada 1, nenhum evento
  é gravado, e o item **fica recusado e visível na fila**, com o mesmo motivo e o mesmo atalho
  (nunca descartado em silêncio).

### P1 — O botão da viagem sumiu, e nada fica preso

- **Given** uma viagem já `on_delivery_route` pelo botão antigo, **when** a app nova abre, **then**
  cada parada mostra "Iniciar rota", e o primeiro toque não muda o status.
- **Given** um aparelho com a versão antiga, **when** ele toca o botão de viagem, **then**
  `/start-route` continua respondendo `200`, idempotente.
- **Given** a app nova falando com a API antiga (snapshot sem `enRouteSince`), **then** o Cheguei
  aparece sem Iniciar rota, como antes (D17).

### P1 — Cancelar rota desfaz o toque errado, e o cliente sabe

**Given** a parada 1 a caminho e sem Cheguei, **when** o motorista toca "Cancelar rota" e confirma,
**then**:

- a parada volta ao estado anterior ao Iniciar rota, e o "Iniciar rota" dela reaparece;
- as outras paradas liberam na hora, mesmo sem sinal;
- o histórico da parada guarda o cancelamento (`departure_cancelled`), e o `departed` fica lá.

**Given** o aviso de "a caminho" já enviado ao destinatário (Fase 7), **when** o motorista cancela,
**then** sai um segundo e último e-mail dizendo que o motorista não vem mais.

**Given** o cancelamento **dentro** dos 2 min de atraso do aviso, **then** nada sai — nem "estou a
caminho" nem "não vou mais" — e nenhuma vaga da cota é gasta.

**Given** a parada já com Cheguei, **then** não existe "Cancelar rota": o caminho é entregar ou
"Registrar entrega depois". Um `cancel-departure` que chegue assim responde
`409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`.

### P2 — Sem ter tocado Iniciar rota, o motorista ainda registra

**Given** uma parada sem Iniciar rota e sem Cheguei, **when** o motorista usa "Registrar entrega
depois" (205), **then** Entreguei e Não entreguei liberam sem os dois toques.

- A foto obrigatória conta como atrasada e **abaixa a nota do motorista** (205 D2).
- A parada não gera amostra de trajeto.

### P2 — O tempo de trajeto vira amostra

**Given** a parada com `departed` e `arrived` do `driver_app`, os dois no mesmo relógio, **when** a
política de amostra lê a viagem, **then** devolve uma amostra `arrived − departed`, desde que dentro
do piso e do teto.

### P3 — O destinatário sabe que o motorista está a caminho (Fase 7, de fábrica desligado)

**Given** a instalação recém-subida, com a Fase 7 no ar e **nada configurado**, **when** o motorista
inicia rota e não chega nunca, **then** o destinatário **não recebe nada**, e nenhuma linha de aviso ou
de outbox é gravada (D20). É o estado de fábrica, inclusive para empresa que já existia.

**Given** os três interruptores ligados — o aviso e o canal de e-mail na configuração da empresa, e o
opt-in do contratante — e a nota com e-mail do destinatário, **when** a parada fica a caminho pela
primeira vez e ele ainda não chegou dois minutos depois, **then** o destinatário recebe um e-mail com a
previsão e um link de descadastro.

- O e-mail não traz nome, telefone nem placa do motorista.
- Nunca sai mais de um aviso por **saída** e por endereço: replay e drenagem dobrada não repetem. Um
  Iniciar rota novo, depois de um cancelamento, é outra saída e avisa de novo (D19, Revisão 4).

**Given** o teto do dia ou do mês atingido, **then** o aviso não sai e fica "não enviado — limite".
O toque do motorista responde igual, e a entrega segue.

## Decisões

Detalhe e alternativas na ADR-0088.

### D1 — Evento `departed` em `trip_stop_events`

- `TRIP_STOP_EVENT_KINDS` ganha **`departed` e `departure_cancelled`** (`trip.schema.ts:986`; o
  segundo é da D18). O CHECK `trip_stop_events_kind_check` (`:1104-1107`) é recriado com `NOT VALID` e
  depois `VALIDATE`, na migration aditiva, e a T1.3 mede a tabela. **Os dois entram na mesma
  migration**, senão o cancelamento pediria uma segunda recriação do CHECK.
- **A linha é da parada:** `trip_document_id` nulo, como no `arrived` (`:996`).
- **Carimbo:** as colunas de posição que já existem (`:998-1006`).
  - Com a 196 em `origin/staging` antes da Fase 1, grava também `location_state` (ADR-0081 §2).
  - Sem ela, a migration da 196 cobre depois.
- **Hora:** `created_at = occurredAt = input.now`, a hora do servidor, como o `arrived` do
  motorista.
- **Coluna nova `trip_stop_events.tapped_at`:** hora do aparelho no toque, só no `departed` (D3).
- **O ponto é do toque.** A troca de status que ele provoca (D5) é derivada e não leva ponto
  (ADR-0081 §4).
- **Parada apagada:** leva junto os eventos dela. A FK `trip_stop_events_company_stop_fk` é
  `on delete cascade` (`trip.schema.ts:1044-1050`), como já acontece com o `arrived`.

### D2 — Idempotência pelo `trip_field_reports`, e o no-op também liquida a chave

- **Rota:** `POST /me/trips/current/stops/:stopId/depart`.
  - Exige `Idempotency-Key` (`me-trip.schema.ts:16-17`, `:75-84`).
  - Roda em `withFieldReport` com `operation = 'stop.depart'`, no molde de `stop.arrive`
    (`report-stop-arrival.use-case.ts:24`, `:57-66`).
- **Toque sem efeito não grava evento** (ADR-0081 §4). É o caso de:
  - parada já a caminho;
  - parada com `arrived_at` ou `completed_at`;
  - `tappedAt` anterior ao último `departed`/`arrived` da viagem (D3).

  A resposta é `200 { id: null, changed: false }`.

- **Ordem das decisões, depois da trava (D4).** Ela importa, porque só a última recusa:
  1. parada fora de alcance → `404 TRIP_STOP_NOT_REACHABLE`;
  2. parada já a caminho, chegada ou concluída → no-op;
  3. `tappedAt` velho (D3) → no-op;
  4. **outra parada da viagem a caminho → `409 TRIP_HAS_STOP_EN_ROUTE`** (D4).

  O toque velho vem **antes** do bloqueio de propósito: um item de fila que descreve intenção passada
  viraria recusa eterna, reenviada para sempre sem nunca ser aceita. Como no-op, ele liquida a chave e
  sai da fila.

- **O no-op também liquida a chave.** Sem isso, o reenvio refaria a decisão e poderia dar
  `changed: true` com o estado já mudado.
  - `trip_field_reports` ganha a coluna aditiva `result_changed boolean` (nula no histórico).
  - O `recall` devolve `{ id: result_id, changed: result_changed ?? true }`.
  - **Replay de no-op repete `changed: false`** (CA3).
- **Erros:**
  - a mesma chave noutra operação → `409 TRIP_FIELD_REPORT_KEY_REUSED`;
  - **outra parada a caminho → `409 TRIP_HAS_STOP_EN_ROUTE`** (D4);
  - chave extra no corpo → `400` (`.strict()`).
- **A recusa não liquida a chave.** A transação aborta, a reserva da chave cai com ela, e o mesmo
  item pode ser reenviado com a mesma `Idempotency-Key` depois de a parada aberta fechar. É o mesmo
  desfecho do `404`.
- **Corpo:** `{ location?, tappedAt }`.
  - `location` é o mesmo do "Cheguei" (`me-trip.schema.ts:24-31`).
  - `tappedAt` é ISO, obrigatório. A rota é nova e não tem cliente antigo.

### D3 — O toque entra na fila, e o servidor respeita a ordem do toque

Emenda à ADR-0081 §5 e à 196 D5, que tratavam "Iniciar rota" como toque direto. Agora o toque é de
parada, na rua, com o sinal do "Cheguei".

- **O item da fila.** `DriverFieldReport` (`driverTrip.types.ts:153-203`) ganha
  `kind: 'depart'`, com `stopId` e `tappedAt`, que é o `createdAt` do item. Ele entra também em:
  - `reportPath`/`reportBody` (`driverTripClient.service.ts:169-218`);
  - `KIND_LABEL_KEYS` (`DriverEventQueue.page.tsx:21-30`);
  - `EventQueueItemView` com `stopId` (`eventQueueView.service.ts:29-32`, `:65`).
- **Gravação:** a mesma do Cheguei. O item nasce com `location: null`, e a leitura completa pela
  chave (`useDriverTrip.hook.ts:439-466`; `offlineQueue.service.ts:209-220`).
- **A drenagem real não garante ordem.** `drainQueueWithAttachments`
  (`offlineAttachments.service.ts:261-330`):
  - mantém o item recusado na fila (`:302-306`, `:318-326`);
  - pula recusado na drenagem automática (`:285`);
  - permite reenvio manual depois (`only`).

  Um `depart` recusado e reenviado horas depois chegaria fora de ordem.

- **Por isso o servidor compara `tappedAt`:**
  - com o último `departed.tapped_at` da viagem;
  - com o último `arrived` da viagem, por `coalesce(captured_at, recorded_at)`;
  - com tolerância de 2 min (`DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS`,
    `field-delivery-timing.policy.ts:16-17`).

  Se o `tappedAt` for anterior, a resposta é `changed: false`: o toque descreve intenção passada e
  não põe a viagem a caminho de uma parada que o motorista já deixou para trás. Sem troca (D4) ele
  não desfaz mais nada; o que a comparação evita é **marcar a parada errada agora**, depois de uma
  chegada noutra.

- **`tappedAt` fora da janela** (mais de 2 min no futuro, ou antes do despacho congelado) grava
  `tapped_at = null` e dispensa a comparação. Relógio errado do aparelho não recusa nem trava a
  fila.

### D4 — A parada a caminho é uma coluna, e o banco garante uma só

- **`trip_stops` ganha:**
  - `en_route_since timestamptz null`, a hora do servidor;
  - `en_route_tapped_at timestamptz null`, a hora do toque no aparelho:
    `coalesce(tapped_at, captured_at)` do `departed`, ou nulo.
- **Constraints:**
  - `trip_stops_en_route_open_check`:
    `en_route_since is null or (arrived_at is null and completed_at is null)`;
  - `trip_stops_en_route_tapped_check`: `en_route_tapped_at is null or en_route_since is not null`;
  - **índice único parcial** `trip_stops_one_en_route_per_trip_idx` em `(company_id, trip_id)`
    `where en_route_since is not null`.
- **Toda escrita de `arrived_at` ou `completed_at` zera as duas colunas no mesmo `UPDATE`** (C1).
  Hoje só há dois escritores:
  - `markStopArrived` (`drizzle-driver-field-report.repository.ts:257-272`);
  - `completeStopIfSettled` (`:386-431`), inclusive com `fillMissingArrival` (escritório,
    `:420-424`; chamado de `document-outcome-steps.service.ts:165`).

  Um contrato estático reprova `update(tripStops)` que grave uma das duas sem zerar as colunas, no
  molde de `test/trip-schema/trip-status-writers.contract.ts`.

  **O contrato vale ainda mais sem a troca** (Revisão 2): fechar a parada passou a ser o **único** jeito
  de liberar as outras, então um escritor que esquecesse de zerar não deixaria mais um estado estranho —
  deixaria o motorista **preso**, sem conseguir iniciar nenhuma parada até o fim da viagem. O texto do
  contrato não muda; a consequência de ele falhar, sim.

- **Tocar noutra parada é recusado, não troca** (Revisão 2, pedido do usuário de 2026-09-26). A
  decisão anterior era o contrário: a tela confirmava e o servidor trocava numa transação.
  - **Não existe troca em lugar nenhum.** Não há `UPDATE` que zere a parada anterior para marcar
    outra, e o caso de uso nunca escreve em duas paradas.
  - **Na tela:** o "Iniciar rota" das outras paradas fica desabilitado, com o motivo e o atalho (D6).
  - **No servidor:** `409 TRIP_HAS_STOP_EN_ROUTE`, com `enRouteStopId` e `enRouteStopSequence` no
    contexto tipado do erro, no molde de `TripDocumentNotReachableError`
    (`trips/domain/trip.error.ts:376`). O código segue o padrão `TRIP_HAS_*` dos invariantes de viagem
    (`TRIP_HAS_UNLOADED_DOCUMENTS` `:264`, `TRIP_HAS_UNSCHEDULED_STOPS` `:288`), porque o invariante é
    da viagem: uma parada a caminho por vez.
  - **A ordem das paradas segue livre (192).** O que fica travado é começar duas ao mesmo tempo, não a
    sequência: o motorista escolhe qualquer parada — depois de fechar a que está aberta.
  - **Os três caminhos de saída, e são eles que liberam as outras:**
    1. **confirmar** — Cheguei → comprovante → entrega registrada, que grava `arrived_at`/`completed_at`
       e zera `en_route_*` no mesmo `UPDATE`;
    2. **"Registrar entrega depois"** (205, `lateRegistration: true` atrás de
       `LATE_REGISTRATION_FIELD_ENABLED`), que conclui a parada sem chegada e zera `en_route_*` pelo
       mesmo escritor (D8). A foto conta como atrasada e abaixa a nota do motorista (205 D2);
    3. **"Cancelar rota"** (D18, resposta do usuário à Q4 em 2026-09-26), que zera `en_route_*` da
       própria parada, grava `departure_cancelled` na história e avisa o cliente se ele já tinha sido
       avisado (D19). **Não inicia parada nenhuma** — ir para outra são dois toques.

    Não nasce um quarto caminho.

- **Travas, ADR-0068 §2 e o mesmo desenho da 192 D5:**
  1. `select ... from trip_stops where trip_id = ... for no key update order by id` (todas as paradas
     da viagem);
  2. **só depois** ler a decisão (a parada, a atual a caminho, o último evento);
  3. depois `trips for no key update`, se houver transição (D5).

  **A justificativa mudou com a Revisão 2, e a trava fica.** Ela não serve mais para uma escrita em
  duas paradas: serve para **ler "alguma parada desta viagem está a caminho?" de forma serializada**.
  Sem ela, dois `depart` concorrentes em paradas diferentes leriam "nenhuma a caminho" ao mesmo tempo,
  e o perdedor bateria no índice único — `500` em vez do `409`. Com as paradas travadas, o segundo lê o
  resultado do primeiro e recebe a recusa; dois `depart` na **mesma** parada continuam gerando um
  evento só.

- **O índice único é rede de segurança, não fluxo.** Não há `catch` de `23505`: numa transação
  abortada ele não teria o que executar. Violação é defeito e vira `500` com log.

### D5 — O primeiro Iniciar rota põe a viagem em rota

- Com a viagem em `dispatched` ou `in_transit`, o caso de uso chama o método novo
  **`markTripOnDeliveryRoute`** na `DriverFieldReportTransactionPort`, dentro da transação do evento.
- É o molde de `markTripInTransit` (`drizzle-driver-field-report.repository.ts:310-343`):
  - `trips for no key update`;
  - reconferência por `checkTripTransition({ action: startRoute })` (`trip-state.policy.ts:255`,
    `:282-298`);
  - compare-and-set em `trips.status`;
  - `recordTripStatusChange` com canal `driver_app`.
- **Não se extrai `applyFieldStep`:** ele roda na transação que o `updateStatus` abre
  (`drizzle-current-driver-trip.repository.ts:166-203`), e não dentro de uma existente.
- Em `on_delivery_route`, o status não muda.
- Fora de `TRIP_ON_ROAD_STATUSES` (`trip-state.policy.ts:114-118`), a parada não é alcançável:
  `404 TRIP_STOP_NOT_REACHABLE`, o mesmo portão do Cheguei
  (`drizzle-driver-field-report.repository.ts:59`, `:163-192`).
- O ETA **não** é deslocado na saída. Ele continua sendo deslocado:
  - no despacho (`drizzle-trip-route.repository.ts:717-750`);
  - na chegada (`report-stop-arrival.use-case.ts:147-166`).

### D6 — Iniciar rota libera o Cheguei, como regra de tela

- **"Cheguei" aparece quando a parada é a que está a caminho** para `resolveEnRouteStopId` (D9).
- **A API não exige a saída para aceitar a chegada.** Continuam chegando sem ela:
  - o escritório em nome do motorista;
  - o WhatsApp;
  - o aparelho com a versão antiga.

  É a mesma escolha do "Cheguei libera a entrega", que também é regra de tela.

- **"Iniciar rota" fica escondido em `route_planned`,** junto com o Cheguei (`isFieldWorkBlocked`,
  `DriverStopCard.component.tsx:369`).
- **Com outra parada a caminho, o "Iniciar rota" fica bloqueado — não escondido** (Revisão 2).
  - `disabled`, com `aria-disabled` e o motivo em texto no cartão, não só em `title`: "Você está a
    caminho da parada {{sequence}}".
  - **O motivo carrega o atalho** "Ir para a parada {{sequence}}", que rola até o cartão da parada
    aberta e põe o foco nele — `scrollTo` da referência + `focus()`, a mesma mecânica do campo recusado
    em `web.md` §11.3. O atalho **não** inicia nada: ele só leva até lá.
  - Esconder o botão faria o motorista procurar o que desapareceu. Bloquear com o motivo diz o que
    fazer: fechar a parada aberta — confirmando, por "Registrar entrega depois" ou cancelando a rota
    dela (D18).
  - **O bloqueio é sempre local e imediato** — sai de `canStartRouteAtStop` sobre
    `resolveEnRouteStopId` (D9), que já conta a fila —, então funciona sem sinal e não espera o `409`.
    O `409` existe para o que a tela não viu: outro aparelho e o item de fila antigo.
- **Irmãs (197, com `sameAddressStopIds`, `specs/197-.../spec.md:204`):**
  - Enquanto nenhuma irmã chegou, cada uma mostra "Iniciar rota", e tocar numa marca só ela.
  - Depois que uma irmã chegou, as outras **não** mostram "Iniciar rota": mostram direto o
    "Cheguei", porque a perna entre elas é de 0 m.
  - Sem a 197 não há irmãs.

### D7 — A chegada zera o "a caminho", e o alcance depende do canal (M4)

- **`driver_app` e `whatsapp`:** a chegada zera `en_route_*` de **todas** as paradas da viagem, no
  mesmo `UPDATE` do `markStopArrived`. Quem chegou numa parada não está mais a caminho de outra.
- **`office`:** zera só a própria parada.
  - A baixa em nome do motorista é retroativa, e não diz onde ele está agora.
  - Ela não pode apagar o "a caminho" que o motorista acabou de tocar noutra parada.
- Só a primeira chegada zera, no mesmo `arrivedAt === null` que já protege o deslocamento do ETA
  (`report-stop-arrival.use-case.ts:77-89`).
- A conclusão pela baixa (`completeStopIfSettled`) zera só a própria parada (D4).

### D8 — "Registrar entrega depois" (205) dispensa Iniciar rota e Cheguei

- O link segue a mesma regra de oferta (`lateRegistration.service.ts:11-16`), atrás de
  `LATE_REGISTRATION_FIELD_ENABLED`.
- Pedir Iniciar rota antes seria obrigar o motorista a inventar uma saída que não aconteceu.
- Iniciar rota e depois "Registrar entrega depois" também vale. A baixa conclui a parada e zera o
  "a caminho" no mesmo `UPDATE` (D4, caso (c) da T2.2).
- Sem par `departed`/`arrived` não há amostra (D11).

### D9 — Um nome e um dono para "a caminho", e a parada atual (M7, junto com a 207)

- **API:** `trip_stops.en_route_since` e `en_route_tapped_at`. O snapshot devolve os dois por
  parada, como `enRouteSince` e `enRouteTappedAt`.
  - `enRouteTappedAt` é a hora do toque no aparelho.
  - `enRouteSince` é a hora em que o servidor processou.
  - A 207 usa `enRouteTappedAt` como âncora, e `enRouteSince` quando ele for nulo.
- **App:** `resolveEnRouteStopId({ stops, queueView })` em `shared/enRouteStop.service.ts`, função
  pura:
  - parte do snapshot (a parada com `enRouteSince`);
  - aplica por cima os itens **não recusados** da fila, na ordem de `createdAt`:
    - `depart` marca a parada;
    - `arrive` de qualquer parada zera, como o `driver_app` na D7;
    - **`cancelDeparture` da parada a caminho zera** (D18), e é o que faz o bloqueio das outras cair na
      hora, sem sinal;
    - **a parada a caminho cujas notas pendentes estão todas resolvidas na fila também zera**
      (Revisão 2): itens `deliver`/`return` cobrindo **todas** as notas pendentes dela no snapshot — é
      o "Registrar entrega depois" (205) sem sinal. Cobertura parcial **não** zera, senão a tela
      liberaria a outra parada e o servidor recusaria depois (`409`). O servidor chega ao mesmo
      resultado pelo `completeStopIfSettled` (D8). Sem essa regra, um dos dois caminhos de saída da D4
      só valeria depois de a fila drenar.
  - Itens com `rejectionCause` não contam (M5).
- **`canStartRouteAtStop` devolve o bloqueio, não um booleano** (Revisão 2):
  `{ enabled: true } | { enabled: false, reason: 'field_work_blocked' } | { enabled: false, reason:
'other_stop_en_route', blockingStopId }`. O cartão tira do `blockingStopId` o número e o destino do
  atalho (D6). Sem o id, a tela saberia que está bloqueada e não saberia para onde mandar o motorista.
- **A 207 consome essas funções e não cria outra.** Não existe `resolveApproachStop`.
- **`findCurrentStop` é da 206** (`driverTripView.service.ts:27`): a parada a caminho, senão a
  primeira pendente.
- A reordenação da 192 não toca o "a caminho", que é por id de parada.

### D10 — O botão da viagem sai, e a rota fica

- **Saem:**
  - `DriverTripWorkspace.page.tsx:493-510` (função) e `:575-591` (botão, aviso e falha);
  - `canStartRoute` (`driverTripView.service.ts:40-43`);
  - `startRoute` do cliente;
  - as chaves `startRoute.start`, `startRoute.done` e `startRoute.failed`.
- **Fica** o selo "Em rota de entrega" (`:531`), que lê o status.
- **`POST /me/trips/current/start-route` fica**, aceito e idempotente, para o PWA ainda na versão
  antiga até o service worker atualizar. É o precedente do `confirm-load` (ADR-0074 §5).
- **Viagens abertas no deploy**, sem backfill:
  - `dispatched`/`in_transit`: o primeiro `depart` promove;
  - `on_delivery_route`: nenhuma parada está a caminho, e cada uma mostra Iniciar rota.

### D11 — A duração do trajeto é derivada, com a regra da 198 D14, e ninguém a consome ainda

- Função pura nova `stop-travel-sample.policy.ts`, mais uma porta de leitura `StopTravelSamplePort`.
- **A amostra é derivada, nunca coluna.** Se a regra do relógio mudar, as amostras velhas mudam
  junto.
- **Extremos:**
  - início: o último `departed` da parada antes do primeiro `arrived` dela, **descartando todo
    `departed` que tenha um `departure_cancelled` depois dele** (D18) — saída cancelada não é trajeto,
    e contá-la mediria o tempo que o motorista passou parado depois de desistir;
  - fim: o primeiro `arrived` da parada.
- **Canal:** `driver_app` nos dois extremos (`TRIP_FIELD_CHANNELS`, `trip.schema.ts:50-56`).
- **Relógio:** os dois extremos no mesmo relógio, como na 198 D14.
  - **Aparelho:** `coalesce(captured_at, tapped_at)` no `departed` e `captured_at` no `arrived`.
  - **Servidor:** `recorded_at` nos dois (`drizzle-driver-field-report.repository.ts:576`).
  - Relógio misto fica fora.
- **Também fica fora:**
  - `location_state = 'expired'` em qualquer extremo, porque o expurgo zerou o `captured_at` e
    misturaria o relógio;
  - evento de outra parada da mesma viagem entre os dois extremos (trajeto interrompido);
  - irmã sem `departed` próprio (D6);
  - duração abaixo do piso ou acima do teto: `STOP_TRAVEL_SAMPLE_BOUNDS`, 60 s e 4 h, a calibrar (Q3).
- **Não é consumida nesta spec.** Nada no ETA, no solver nem no quadro da 198 lê a porta. Um contrato
  prova que só o teste e o `debug` a importam.
- **Tempo de operação, nunca de motorista:** não seleciona ator e não entra na nota (198 D17,
  ADR-0070).

### D12 — Painel: "A caminho da parada N", com tolerância antes

- **API:** os kinds `stop.departed` e **`stop.departure_cancelled`** (D18) entram em
  `TRIP_TIMELINE_KINDS` (`trip-timeline.types.ts:19-29`) e no mapeamento de `listStopEventRows`
  (`trip-timeline-stop.query.ts:38-57`).
  - Isso emenda a 158 D6 **só na lista de `kind`**: as chaves do item não mudam.
- **Prioridade:** `TRIP_TIMELINE_KIND_PRIORITY` dá **0** aos dois, o mesmo número de
  `stop.arrived` (`trip-timeline.types.ts:41-51`).
  - O cursor compara a prioridade como `::int` (`trip-timeline-condition.helper.ts:43`), então não
    cabe fração.
  - Renumerar a tabela quebraria cursor em voo.
  - Com 0, a saída fica abaixo da troca de status que ela provoca (7), com o efeito acima da causa
    (158 D8).
  - Empate só acontece no mesmo microssegundo, e o `departed` e o `arrived` de uma viagem nunca
    dividem transação: a trava das paradas os serializa. Se acontecesse, o `id` desempata com cursor
    estável.
- **O painel hoje recusa a página inteira** diante de um kind desconhecido:
  `isOneOf(value.kind, TRIP_TIMELINE_KINDS)` (`tripResponse.validation.ts:1299-1325`, `:901-911`).
- **Por isso a tolerância publica antes da API:**
  - com a 192 T0.2 em `origin/staging` (`specs/192-.../tasks.md:41-52`, "o tipo desconhecido é
    descartado"), a 206 só acrescenta o kind e o rótulo;
  - senão, a T0.3 faz a tolerância no mesmo molde (precedente: `694de05b5`).
- **Rótulos:** "A caminho da parada {{sequence}}" e "Cancelou a rota da parada {{sequence}}", com o
  ator e a hora como os outros itens.

### D13 — Aviso ao destinatário: e-mail autorizado, desde que sem custo

Decisão do usuário, 2026-09-25: "pode mandar e-mail se for sem custo".

- **Hoje não existe canal para o destinatário.**
  - O `notification` atende só usuários internos (`identity-recipient.resolver.ts:28-59`; 034 exclui o
    cliente final, `specs/034-.../spec.md:102`).
  - O `contractor-mail` fala só com `contractor_contacts` (`contractor-mail.schema.ts:96-158`).
  - O portal não tem push.
  - O telefone "não sai do detalhe da viagem para nenhum canal automático"
    (`delivery-contact.policy.ts:10-12`).
- **O e-mail do destinatário ainda não é gravado.** `nfe_participants` não tem a coluna
  (`nfe.schema.ts:356-370`). A coluna vem da 193 T6.5 (`specs/193-.../tasks.md:256-266`), e **a Fase 7
  começa depois dela.**
- **Base legal:** legítimo interesse (LGPD art. 7º, IX), com a finalidade única de avisar a chegada
  da própria entrega do titular.
  - Estende o teste da ADR-0079 Parte B (`docs/adr/0079-...md:73-89`).
  - **Emenda a B3** (`:101`) só para este aviso (ADR-0088 §7).
- **Provedor, conferido pelo nome das variáveis, nunca pelo valor:**
  - O worker exige `EMAIL_FROM` junto de `RESEND_API_KEY` ou `SMTP_URL`
    (`apps/worker-transportada/src/config/environment.schema.ts:22`, `:69-71`, `:140`, `:157-162`).
    Com a chave, vai pela API do Resend (`:423-435`).
  - Produção declara `RESEND_API_KEY` e `EMAIL_FROM` (`.railway/railway.ts:151`, `:175-179`).
  - Local usa o Mailpit.
  - O `contractor-mail` usa a chave Resend **da transportadora** (`contractor-mail.schema.ts:32-41`).
    O plano dessa conta o produto não enxerga, então ela não serve para "sem custo".
- **Cota gratuita** (Resend Free, `resend.com/pricing`, 2026-09-25): 3 000 por mês e 100 por dia,
  sem excedente cobrado.
  - A cota é **por conta**, não por chave.
  - Sem `RESEND_API_KEY` no worker, o aviso fica desligado: com SMTP não dá para provar custo zero.
- **A cota é dividida.** A mesma conta já manda convite, recuperação de senha e as notificações por
  e-mail (`EMAIL_CHANNEL_ENABLED`). O aviso fica com uma **fatia**:
  - `RECIPIENT_NOTICE_DAILY_CAP` e `RECIPIENT_NOTICE_MONTHLY_CAP` por instalação (proposta: 30 e
    900, fixados na T7.0 depois de medir os outros e-mails);
  - um teto opcional por empresa, menor ou igual a esse;
  - o schema de env recusa teto acima de 100/dia ou 3 000/mês.
- **Remetente separado do e-mail de sistema.** Usa o subdomínio `EMAIL_FROM_RECIPIENT_NOTICE`
  (ex.: `avisos.<domínio>`), verificado na mesma conta.
  - Uma chave separada não daria cota separada.
  - O subdomínio isola a **reputação**: bounce e reclamação de destinatário não derrubam a entrega do
    convite e da recuperação de senha.
  - A T7.0 confere o limite de domínios do plano gratuito. Sem vaga, o aviso usa o `EMAIL_FROM`, e a
    justificativa fica escrita no `evidence.md`.
- **Canal:** e-mail ao `nfe_participants.email` do papel `recipient`, pelo driver de e-mail do
  worker (`notification/infrastructure/email-driver.factory.ts:13-18`).
  - Usa uma outbox própria com relay, no molde de `contractor_mail_outbox`
    (`contractor-mail.schema.ts:500-540`).
  - É o **primeiro** canal, não o único previsto (D20).
- **Isto não é o sino, e não é notificação de ocorrência.** O `notification` (o sino do painel, os
  e-mails de convite e de senha, os avisos de ocorrência para quem trabalha na transportadora) fala com
  **usuário interno** e continua exatamente como está: esta spec não acrescenta, remove nem religa nada
  lá, e o aviso ao destinatário **não entra no catálogo do `notification`**. São duas coisas com públicos
  diferentes: o sino avisa a operação; o aviso da D13 fala com o cliente do contratante. Ligar ou
  desligar um não mexe no outro.

### D14 — A previsão enviada é o `estimated_arrival_at` da parada, nunca um recálculo

- É o mesmo número do portal (`contractor-delivery.query.ts:38`). Ele já foi deslocado pelo
  despacho e pelas chegadas atrasadas.
- ETA nulo ou no passado: a mensagem sai **sem hora** ("está a caminho").
- Recalcular pelo ponto do toque seria finalidade nova para a coordenada.

### D15 — Mensagem, teto, supressão e configuração (Fase 7)

- **Mensagem:**
  - nome fantasia da transportadora;
  - número e série das notas do destinatário nessa parada;
  - "previsão por volta de HH:MM", no fuso da empresa;
  - link de descadastro.
  - **Nunca** vão nome, telefone ou placa do motorista, coordenada, link de rastreamento ou valor.
- **Quem recebe:** só a parada do `departed`. As irmãs, que são outros destinatários no mesmo lugar,
  não recebem, porque não houve toque para elas (D6).
- **Um por parada, por endereço e por tipo:** unicidade `(company_id, stop_id, email_hash, kind)`, com
  `kind` em `en_route | cancelled` (D19). Sem troca (D4) não há ida e volta entre paradas, e a
  unicidade fica como rede: um `depart` aceito duas vezes na mesma parada nunca manda dois avisos, e
  iniciar rota de novo depois de um cancelamento também não.
- **`email_hash` é HMAC-SHA-256** com `RECIPIENT_NOTICE_HASH_SECRET`, exigido no boot **junto de
  `RESEND_API_KEY`** — sem interruptor global, o segredo é pré-condição do canal, não do produto. Sem o
  segredo, o hash de um e-mail seria reversível por dicionário.
- **Atraso de cerca de 2 min.** A outbox nasce com `next_attempt_at = now() + 2 min`, e o worker
  confere antes de enviar:
  - a parada ainda sem chegada e ainda a caminho — **o cancelamento (D18) derruba as duas condições, e
    o aviso nem sai** (D19);
  - o toque não velho: `coalesce(captured_at, tapped_at)` a menos de 15 min de `recorded_at`, com
    `recorded_at` quando os dois faltarem.

  O atraso evita avisar quem já chegou e o toque desfeito em seguida por uma chegada.

- **Teto, contado no worker antes de chamar o provedor:**
  - contador por instalação e por empresa, por dia e por mês no fuso da empresa;
  - `UPDATE ... set sent = sent + 1 where sent < cap returning`, atômico;
  - **o "a caminho" exige uma vaga livre por obrigação em aberto** — `sent + outstanding < cap`, e não
    `sent < cap - 1` (D19, Revisão 4); o aviso de cancelamento exige uma vaga e liquida a obrigação
    dele;
  - **o contador é por instalação e por empresa, por dia e por mês. Não existe teto por viagem nem por
    parada** — ver a Q5 e o pior caso nos casos extremos.
  - **Teto atingido:** o registro grava `status = 'skipped_limit'`, que o painel mostra como "não
    enviado — limite". Nada volta ao motorista, e o `depart` já respondeu.
- **Dois `429` diferentes do provedor:**
  - **de taxa** (requisições por segundo): retry com backoff exponencial, até três tentativas;
  - **de cota** (dia ou mês esgotado): `skipped_limit`, sem retry.

  A T7.0 confere na documentação do Resend o campo que distingue os dois.

- **Supressão por bounce e reclamação.**
  - Webhook do Resend (`email.bounced`, `email.complained`), assinado pelo Svix, em rota pública
    própria.
  - Reusa `svix-signature.policy.ts` com o segredo `RESEND_WEBHOOK_SECRET_RECIPIENT_NOTICE`, e
    alimenta a mesma tabela do opt-out, com o motivo.
- **Opt-out:**
  - link com token assinado (HMAC, sem login), em rota pública com limite por IP;
  - vale por `(company_id, email_hash)`;
  - o worker confere antes de enviar;
  - é o direito de oposição (art. 18 §2).
- **O aviso nasce desligado, e quem liga é a transportadora** (decisão do usuário, 2026-09-26: "nao
  enviar isso ainda implementar mas, deixa desligado por configuração"). O "sem custo" (D13) foi a
  **condição de existir** o aviso; nascer ligado numa instalação nova seria assumir, em nome da
  transportadora, um custo e um envio a cliente que ninguém pediu. Detalhe do desligamento e da porta de
  saída na **D20**.
- **Três interruptores, todos desligados por padrão, e nenhum deles é variável de ambiente:**
  1. **empresa — o aviso:** `company_recipient_notice_settings.en_route_notice_enabled`;
  2. **empresa — o canal:** `company_recipient_notice_settings.email_channel_enabled` (D20);
  3. **contratante:** `contractors.recipient_en_route_notice_enabled`. O aviso só sai se o
     contratante do frete (emitente da nota) optou, porque o destinatário é cliente dele.

  Os dois primeiros ficam em `GET`/`PUT /company-settings/recipient-notices` (`settings.manage`), no
  molde de `canhoto_ocr_enabled` (`company-delivery-proof-settings.schema.ts:59`): tabela de settings com
  PK `company_id` e `boolean not null default false`, como as outras configurações de empresa. **Empresa
  que já existe nasce desligada pelo default da coluna** — a migration não liga ninguém.
  - **`RECIPIENT_NOTICE_ENABLED` (env da instalação) deixa de existir.** Ele seria um quarto interruptor
    que só um deploy mexe, e a decisão foi por configuração. O que resta no ambiente é a **pré-condição
    de custo do canal de e-mail**, não uma preferência: sem `RESEND_API_KEY`, o canal de e-mail não pode
    ser ligado (`422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE`), porque com SMTP não se prova custo zero.
  - Ligar o aviso com **nenhum** canal ligado é estado válido e não manda nada. É o caminho de quem quer
    só o webhook do parceiro, quando ele existir (D20).

- **Retenção:**
  - o registro do aviso guarda só ids, hash, status e horas, e é apagado em 90 dias (o prazo do
    ponto);
  - a linha da outbox é apagada 7 dias depois de publicada;
  - a supressão fica enquanto a empresa existir.
- **Limite de requisição:** a rota `depart` passa a poder disparar um aviso, então declara `rateLimit` no
  Postgres (120/300 s por usuário) e entra em `test/rate-limited-routes.contract.test.ts`. Hoje as
  rotas `/me` de parada não têm teto nenhum.
- **Nada de dado pessoal fora do lugar:** o payload da outbox carrega só ids, e o endereço é lido na
  hora do envio. Nada disso vai para log.

### D16 — Ordem de publicação e reversão (ADR-0081 §9)

- **Subida:**
  1. painel tolerante (T0.3);
  2. banco e API;
  3. a app.
- **Reversão, na ordem inversa:**
  1. app;
  2. API;
  3. banco.
- **A API não é revertida com a app nova no ar** (ADR-0081 §9). Contra uma API sem a rota, o
  `depart` responde `404`. **A fila não descarta:** o item fica recusado e visível
  (`offlineAttachments.service.ts:302-306`, `:318-326`), e pode ser reenviado depois. O `tappedAt`
  (D3) impede que o reenvio tardio marque a parada errada.
- **O `409 TRIP_HAS_STOP_EN_ROUTE` tem o mesmo desfecho de fila** (Revisão 2), no molde do `depart`
  velho e do `404`:
  - o item **fica recusado na fila**, com `rejectionCause`, e é pulado na drenagem automática
    (`offlineAttachments.service.ts:285`);
  - o motorista vê o motivo e o atalho (RF8b);
  - depois de fechar a parada aberta, o reenvio manual (`only`) é aceito — ou vira no-op pelo
    `tappedAt` (D2, ordem das decisões), se nesse meio-tempo houve uma chegada. Nos dois casos o item
    sai da fila **tendo dito o que aconteceu**, e nunca desaparece calado.

### D17 — App nova contra API antiga (M6)

- Chave `enRouteSince` **ausente** no snapshot significa API antiga ou snapshot anterior ao deploy.
- Nesse caso `resolveEnRouteStopId` não trava nada, e o Cheguei aparece sem Iniciar rota, como
  antes. O botão Iniciar rota de parada não aparece.
- **`null` explícito é a API nova**, com a parada fora de rota.

### D18 — "Cancelar rota" desfaz a saída a qualquer momento, e o cancelamento fica na história

Resposta do usuário à **Q4**, em 2026-09-26, entre as três saídas oferecidas: _"Cancelar rota" a
qualquer momento antes de Cheguei, sem janela de tempo, gravando o cancelamento no histórico e
avisando o cliente que o motorista não vem mais._ O default anterior era a saída 1 — **nada**: o
motorista que abrisse a parada errada só sairia dela entregando ou por "Registrar entrega depois", que
abaixa a nota dele (205 D2). Isso deixa de valer.

**Isto não é a troca que saiu na Revisão 2.** Cancelar **não inicia** parada nenhuma. Quem quer ir para
a parada 2 dá dois toques: cancela aqui, inicia lá. Não existe transação que escreva em duas paradas, e
não volta o diálogo "Ir para a parada 2?".

- **Quando aparece:** na parada **a caminho**, a qualquer momento **antes do Cheguei**, sem janela de
  tempo. Sumiu o "a caminho" (chegou, foi concluída), sumiu o botão.
- **O que faz:** zera `en_route_since` e `en_route_tapped_at` **da própria parada**, que volta ao
  estado anterior ao Iniciar rota. O `departed` **fica na história** — como já ficava o da parada
  anterior no desenho antigo.
- **Evento próprio, nada é apagado:** `trip_stop_events` ganha
  **`kind = 'departure_cancelled'`** (grafia `cancelled`, a do repositório — `trip.schema.ts:81`,
  `:135`). Mesma linha da parada (`trip_document_id` nulo), mesmo carimbo da ADR-0081, `created_at =
occurredAt = input.now` (hora do servidor) e `tapped_at` (hora do toque), no molde exato do
  `departed` (D1).
- **Rota:** `POST /me/trips/current/stops/:stopId/cancel-departure`, com `Idempotency-Key` e
  `{ location?, tappedAt }`, em `withFieldReport` com `operation = 'stop.cancel-departure'` — o mesmo
  desenho de idempotência da D2, inclusive o `result_changed` do no-op.
- **As mesmas travas da D4**, na mesma ordem: as paradas da viagem `for no key update order by id`, só
  depois a decisão. Sem transição de status: cancelar **não** mexe em `trips.status` — a viagem segue
  `on_delivery_route` (D5), que descreve a viagem, não a parada.
- **Decisões, na ordem (e ela importa):**
  1. parada fora de alcance → `404 TRIP_STOP_NOT_REACHABLE`;
  2. `tappedAt` velho (D3) → no-op, **antes** da recusa: um item de fila antigo não pode virar recusa
     eterna;
  3. parada com `arrived_at` ou `completed_at` → **`409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`**, com
     `{ reason: 'arrived' | 'completed' }` no contexto tipado. Depois da chegada o caminho é entregar ou
     "Registrar entrega depois", não cancelar;
  4. parada sem `en_route_since` (e sem chegada) → no-op `200 { id: null, changed: false }`. Cancelar
     duas vezes é inofensivo, e o replay repete a resposta.
- **Libera as outras na hora:** é o **terceiro caminho de saída** do bloqueio da D4, ao lado de
  entregar e de "Registrar entrega depois". `canStartRouteAtStop` volta a `{ enabled: true }` para
  todas, e `blockingStopId` desaparece assim que o cancelamento entra na fila (D9) — sem sinal
  inclusive.
- **Confirmação na tela, e só na tela:** o toque abre "Cancelar a rota da parada N? O cliente será
  avisado de que você não vem mais." O servidor não pergunta, porque a fila drena sem ninguém olhando —
  é a mesma divisão que a D4 faz com o bloqueio.
- **O `departed` cancelado não vira amostra de trajeto** (D11).
- **O cliente é avisado, se já tinha sido avisado** (D19).
- **Painel:** kind `stop.departure_cancelled`, prioridade 0, rótulo "Cancelou a rota da parada
  {{sequence}}" (D12).

### D19 — O aviso de cancelamento só sai se o "a caminho" saiu (Fase 7)

- **Dentro do atraso de 2 min** (D15), o aviso de "a caminho" ainda não foi enviado: o cancelamento
  **suprime os dois**. A linha da outbox vira `status = 'skipped_cancelled'` e **nenhum** aviso de
  cancelamento é criado. É o caminho normal do dedo torto, e **não custa e-mail nenhum**.
  - **Vale em cada ciclo, não só no primeiro** (Revisão 4): cada Iniciar rota nasce com os seus 2 min, e
    cancelar dentro deles não manda nada — nem consome vaga do teto. Dez ciclos rápidos custam zero
    e-mail. É isso que faz o dedo torto ser de graça, e é o caso comum; a sequência caríssima dos casos
    extremos exige **esperar** os 2 min a cada volta.
- **Depois de enviado**, sai o segundo e último e-mail **daquele ciclo** para o mesmo endereço: "o
  motorista não vem mais", com as mesmas notas, sem previsão nova, sem nada do motorista e com o mesmo
  link de descadastro.
- **Unicidade por saída:** `(company_id, stop_id, email_hash, kind, departure_event_id)`, com `kind` em
  `en_route | cancelled` e `departure_event_id` apontando para o `departed` que originou o par.
  **Decisão do usuário, 2026-09-26:** _"Cada Iniciar rota manda o aviso, inclusive depois de um
  cancelamento. O cliente sempre sabe quando o caminhão está vindo; em troca, um motorista indeciso pode
  render três ou quatro e-mails na mesma parada."_
  - Cada ciclo Iniciar rota → cancelar é um **par novo** de avisos, atrelado ao seu `departed`.
  - O que a unicidade garante continua sendo o que importa contra duplicata: **um "a caminho" e um
    "não vou mais" por saída** — replay do `depart`, reenvio de fila e drenagem dobrada não repetem
    nada.
  - O que ela **não** limita mais é o número de ciclos. Quem limita é o teto (D15), e o **pior caso
    está escrito nos casos extremos**. A **Q5** registra o que ainda não foi decidido: um teto por
    parada e endereço.
- **O teto reserva a vaga do cancelamento, e a reserva mudou de forma** (Revisão 4). O objetivo é o
  mesmo — quem foi avisado sempre pode ser desavisado —, mas `sent < cap - 1` só reservava **uma** vaga
  para a instalação inteira, e o contador é por instalação e por empresa, não por parada:
  - com cinco viagens cada uma com uma parada a caminho e o aviso já enviado, são **cinco**
    cancelamentos possíveis e uma vaga reservada. O quinto "a caminho" passava, e quatro "não vou mais"
    ficariam sem vaga;
  - a forma correta é **reservar uma vaga por obrigação em aberto**:
    `sent + outstanding < cap`, com `outstanding` = avisos `en_route` com `status = 'sent'` cuja parada
    **ainda está a caminho** e que ainda não geraram cancelamento nem chegada;
  - o aviso de cancelamento continua exigindo uma vaga e **liquida** a obrigação que reservou a dele,
    então a conta não cresce sozinha;
  - com N ciclos na mesma parada a conta segue certa: a cada instante aquela parada tem **no máximo
    uma** obrigação em aberto, e o `departure_event_id` não muda isso.
- **Se ainda assim faltar vaga** (opt-out, bounce, `429` de cota), o registro grava o motivo como
  qualquer outro aviso. Nada volta ao motorista, e o cancelamento já respondeu.
- Opt-out, supressão por bounce, HMAC do endereço, retenção e os três interruptores são os da D15, sem
  exceção.

### D20 — Desligado é não existir, e o aviso é um evento com destinos (Fase 7)

Decisão do usuário, 2026-09-26: "nao enviar isso ainda implementar mas, deixa desligado por
configuração" e "tbm deixe preparado para integrações com outros parceiros".

**Desligado significa que nada acontece.** Com `en_route_notice_enabled = false` (ou o contratante sem
opt-in), o caso de uso da saída e o do cancelamento **não gravam linha de aviso, não gravam outbox, não
tocam contador de teto, não geram token de descadastro e não chamam provedor nenhum**.

- O `depart` e o `cancel-departure` respondem igual, na mesma latência, com as mesmas transações do
  resto da spec. O aviso é um efeito **a mais** quando ligado, nunca um passo do caminho principal.
- **Um "desligado" que ainda grava linha e conta no teto seria a pior versão**: custo zero mentiroso,
  retenção de dado que ninguém pediu e um teto que se esgota sem ninguém receber nada. Por isso a
  checagem é **antes** de criar qualquer linha, e é contrato (CA15), não confiança.
- Ligado **sem canal** também não manda nada — mas aí a linha do aviso nasce, com o motivo, porque o
  evento existiu e a transportadora quis registrá-lo.

**O aviso é um evento de negócio com um ou mais destinos**, não "um e-mail".

- **Porta:** `RecipientNoticePort` (`trips/application/recipient-notice.port.ts`), recebida por
  construtor (code-standart §6). O caso de uso entrega um `RecipientNoticeEvent` com os dados **já
  resolvidos** — `kind: 'en_route' | 'cancelled'`, empresa, parada, `departure_event_id`, notas,
  previsão, destinatário — e **não sabe de provedor nenhum**.
- **Adaptador:** `recipient-notice-email.gateway.ts` (sufixo `.gateway.ts`, o do repositório para saída
  externa), com a outbox e o relay do worker. **Um** adaptador de verdade nesta spec.
- **Catálogo de canais:** `RECIPIENT_NOTICE_CHANNELS = ['email', 'whatsapp', 'partner_webhook']`, em
  `*.constant.ts` (code-standart §16). É valor de configuração, não `if` espalhado: a linha da outbox e a
  do registro carregam `channel`, e a composição em `main.ts` mapeia canal → adaptador.
  - **Canal sem adaptador não pode ser ligado:** o `PUT` responde
    `422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE`. É o que impede o catálogo de virar configuração morta.
  - **WhatsApp** exigiria template aprovado na Meta, a janela de 24 h e opt-out próprio (062).
  - **Webhook de parceiro** exigiria assinatura HMAC na saída, retry com limite, chave de idempotência e
    o endpoint como configuração da empresa (`security.md` §3–§4).
  - Nenhum dos dois é implementado aqui.
- **A regra é do evento; o custo é do canal.** Essa divisão é a parte fácil de errar:
  - **do evento, antes de chegar a qualquer canal:** o atraso de 2 min, a supressão pelo cancelamento
    (D19), a conferência "ainda a caminho e sem chegada", o opt-out, a supressão por bounce e a
    unicidade por saída. Se isso morasse no canal, cada canal novo repetiria a regra e um deles a
    repetiria errado;
  - **do canal:** o teto de custo e o tratamento de `429`. O contador é
    `(company_id, channel, dia/mês)` — webhook para o sistema do parceiro não gasta e-mail, e o teto de
    3 000/mês do Resend não é teto de webhook. A **reserva de vaga da D19 também é por canal**, pelo
    mesmo motivo.
- **Canal novo não amplia o que se compartilha.** O conteúdo é o da D15 para qualquer destino: nada de
  nome, telefone ou placa do motorista, nada de corpo de mensagem de cliente, nada de coordenada, id
  opaco na integração e nada disso em log. A base legal (D13) é do **evento**, não de um provedor —
  ligar outro canal não amplia a finalidade, e um canal que exigisse dado a mais é **decisão nova**, com
  ADR própria.

**O que eu não fiz, de propósito:** não existe registro de plugins, fábrica genérica de canais, tabela
de canais nem coluna para canal que não tem adaptador. São uma porta, um adaptador, uma constante com o
catálogo e uma coluna `channel` nas duas tabelas. Canal novo custa uma coluna de interruptor, um
adaptador e uma linha no mapa da composição.

## Requisitos funcionais

- **RF1** — `POST /me/trips/current/stops/:stopId/depart`, com `Idempotency-Key` e
  `{ location?, tappedAt }`. Responde `201 { data: { id, changed: true } }` ou
  `200 { data: { id: null, changed: false } }`, e o replay repete a resposta (D2).
- **RF1b** — Com outra parada da viagem a caminho, o `depart` responde
  `409 TRIP_HAS_STOP_EN_ROUTE` com `enRouteStopId` e `enRouteStopSequence`, sem gravar nada (D4).
- **RF1c** — `POST /me/trips/current/stops/:stopId/cancel-departure`, com `Idempotency-Key` e
  `{ location?, tappedAt }`. Grava `departure_cancelled`, zera `en_route_*` da própria parada e não
  mexe no status da viagem. Parada chegada ou concluída →
  `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE { reason }`; parada sem "a caminho" → no-op (D18).
- **RF2** — O toque grava `trip_stop_events.kind = 'departed'` com carimbo e `tapped_at` e marca
  `en_route_*` da própria parada (D1, D3, D4). **Nunca escreve noutra parada.**
- **RF3** — O primeiro toque com a viagem em `dispatched`/`in_transit` a leva a `on_delivery_route`
  por `markTripOnDeliveryRoute` (D5).
- **RF4** — Chegada, conclusão e baixa zeram `en_route_*` no mesmo `UPDATE`, com o alcance por canal
  da D7. O cancelamento (RF1c) zera só a própria parada.
- **RF5** — `GET /me/trips/current` devolve `enRouteSince` e `enRouteTappedAt` por parada. Ausentes
  são lidos como "API antiga" (D17).
- **RF6** — O cartão tem três estados; a parada a caminho mostra "Cancelar rota" com confirmação
  (D18), e com outra parada a caminho o "Iniciar rota" fica bloqueado, com o motivo em texto e o atalho
  para a parada aberta (D6, Preview).
- **RF7** — O botão de viagem some, e `/start-route` continua aceito (D10).
- **RF8** — A fila mostra "Iniciar rota — parada N".
  - O **N** é a `sequence` da parada no snapshot atual, lida pelo `stopId` na hora de mostrar.
  - Parada que sumiu do snapshot mostra "Iniciar rota" sem número.
  - O item não guarda `sequence`, porque a ordem pode mudar (192).
- **RF8b** — O item de fila recusado por `409 TRIP_HAS_STOP_EN_ROUTE` fica na fila com
  `rejectionCause`, mostrando "Outra parada está a caminho — feche a parada N" e o mesmo atalho do
  cartão. **Não é descartado em silêncio** (D16).
- **RF9** — `stop-travel-sample.policy.ts` e `StopTravelSamplePort`, sem consumidor (D11).
- **RF10** — A linha do tempo do painel mostra "A caminho da parada N" e "Cancelou a rota da parada
  N", e o painel publica tolerante antes (D12).
- **RF11** — (Fase 7) e-mail ao destinatário sem custo, com teto, supressão, opt-out, atraso e três
  interruptores (D13–D15). **Nasce desligado**, e o que liga é configuração de empresa.
- **RF11b** — (Fase 7) com o aviso desligado, o `depart` e o `cancel-departure` **não gravam linha de
  aviso nem outbox, não tocam o contador e não chamam provedor** (D20).
- **RF11c** — (Fase 7) o caso de uso publica um `RecipientNoticeEvent` numa `RecipientNoticePort`; o
  e-mail é um adaptador. As regras do evento (atraso, supressão, opt-out, unicidade) rodam **antes** da
  porta; o teto e o `429` são **por canal** (D20).
- **RF12** — (Fase 7) o cancelamento suprime o aviso ainda não enviado e, se o aviso já saiu, manda o
  "não vou mais". A unicidade é por **saída** (`departure_event_id`), então cada Iniciar rota avisa de
  novo, e o teto reserva **uma vaga por obrigação em aberto** (D19).

## Requisitos não funcionais

- **Nenhum dado pessoal em log.** A coordenada do `departed` segue a ADR-0081 §6, e o expurgo de 90
  dias já varre `trip_stop_events`.
- **A tela responde sem esperar rede** (fila primeiro).
- **Toque com efeito é uma transação só:** reserva da chave, evento, `en_route_*` e status.
- **Alvo de toque ≥ 44 px** (`test/shared/touch-target.contract.ts`), e textos em `*.locale.json`
  pt-BR e en.

## Casos extremos e falhas

- **Dois celulares do mesmo motorista na mesma parada:** um `departed` só. O segundo espera a trava
  das paradas, lê "já a caminho" e responde `changed: false` (CA4).
- **Dois celulares em paradas diferentes:** as travas serializam. O primeiro marca a parada dele; o
  segundo recebe `409 TRIP_HAS_STOP_EN_ROUTE` nomeando a do primeiro — a não ser que o `tappedAt` dele
  seja anterior, e aí é no-op (D2, ordem das decisões).
- **`depart` × baixa do escritório na mesma parada:** as duas travam `trip_stops`.
  - Se a baixa conclui primeiro, o `depart` é no-op.
  - Se o `depart` vem primeiro, a conclusão zera o "a caminho" no mesmo `UPDATE`.
  - Nunca viola o CHECK (CA4).
- **Escritório dá baixa na última nota de uma parada a caminho**, com `fillMissingArrival`: grava
  `arrived_at` e `completed_at` e zera `en_route_*` no mesmo `UPDATE` (C1, T2.2 caso a).
- **Motorista com `lateRegistration` dá baixa na última nota sem chegada** (T2.2 caso b).
  - A conclusão zera `en_route_*`.
  - Se ela grava `completed_at` sem `arrived_at`, esbarra no `completed_requires_arrived` da 205.
    Esse é um defeito provável da 205, que o executor dela está conferindo. A 206 só mantém o teste.
- **Iniciar rota e depois "Registrar entrega depois"** (T2.2 caso c): a baixa conclui e zera.
- **Fila drena um `depart` velho**, recusado e reenviado depois de um Cheguei noutra parada:
  `tappedAt` anterior, `changed: false`.
- **Fila drena um `depart` com outra parada a caminho** (a tela não viu: item enfileirado por outro
  aparelho, ou antes do snapshot que trouxe o "a caminho"): `409 TRIP_HAS_STOP_EN_ROUTE`, item recusado
  e visível com o motivo e o atalho, nada gravado (RF8b).
- **Motorista tenta "Iniciar rota" com outra parada a caminho:** o botão já está bloqueado, e o toque
  não chega a entrar na fila. Nenhuma requisição sai.
- **Cancelar e iniciar noutra parada sem sinal:** dois itens na fila, `cancelDeparture` da 1 e `depart`
  da 2, nessa ordem de `createdAt`. O resolver zera e marca na mesma leitura, então a tela já mostra a 2
  a caminho; na drenagem, o cancelamento chega antes e o `depart` é aceito.
- **Fila drena o `depart` da 2 antes do cancelamento da 1** (o cancelamento ficou recusado por outro
  motivo e foi reenviado depois): o `depart` recebe `409 TRIP_HAS_STOP_EN_ROUTE` e fica recusado e
  visível; reenviado depois do cancelamento, é aceito — ou vira no-op pelo `tappedAt` (D2).
- **Cancelar uma parada que já chegou** (Cheguei drenou primeiro): `409
TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` com `reason: 'arrived'`, item recusado e visível. Se o `tappedAt`
  do cancelamento for anterior à chegada, é no-op (D18, ordem das decisões).
- **Cancelar uma parada que já não está a caminho:** no-op `changed: false`. Dois toques em "Cancelar
  rota" no mesmo cartão, ou o reenvio do mesmo item, não geram dois eventos.
- **Cancelar e iniciar a mesma parada de novo:** vale, e a amostra usa o `departed` mais novo, sem o
  cancelado (D11). O destinatário **recebe** um segundo "a caminho" (D19, decisão do usuário de
  2026-09-26): cada saída é um par de avisos próprio.
- **Motorista indeciso: cancela e reinicia a mesma parada N vezes** (Fase 7, o pior caso do custo).
  - **Ciclo rápido (cancelar dentro dos 2 min): zero e-mail, sempre.** Não importa quantas voltas.
  - **Ciclo lento (esperar os 2 min, deixar o "a caminho" sair, e só então cancelar): 2 e-mails por
    volta** — um "a caminho" e um "não vou mais".
  - **Nada nesta spec limita o número de voltas.** O único freio é o teto do dia (D15, proposta de
    `RECIPIENT_NOTICE_DAILY_CAP = 30`), que é **por instalação**, não por parada nem por viagem. Logo:
    - **até 15 voltas, 30 e-mails no mesmo endereço em um dia** — e esses 30 são **a fatia inteira do
      dia**, então nenhuma outra parada da transportadora avisa ninguém até a virada;
    - a cada volta o ciclo lento gasta ≥ 2 min, então 15 voltas levam ≥ 30 min de motorista fazendo só
      isso.
  - O par de e-mails é sempre **coerente** (quem soube que vinha soube que não vem mais), pela reserva
    da D19. O problema não é inconsistência, é **volume** — e o dano maior é a fatia do dia, não a caixa
    de entrada de uma pessoa.
  - **Tudo isso vale só com o aviso ligado.** Ele nasce desligado (D20), então o pior caso de fábrica é
    **zero e-mail**. A Q5 registra o teto por parada como decisão pendente para o momento de ligar.
- **Viagem cancelada com `depart` na fila:** `404 TRIP_STOP_NOT_REACHABLE`, e o item aparece
  recusado.
- **Motorista toca Cheguei pela versão antiga, sem ter saído:** a API aceita (D6), e a parada não
  gera amostra.
- **GPS negado:** `location: null`, e o toque vale (ADR-0045 §3.1).
- **Snapshot de 24 h sem rede:** mostra `enRouteSince` salvo mais a fila não recusada (D9).

## Critérios de aceite

- **CA1 — Migration.**
  - `departed` **e `departure_cancelled`** no CHECK (`NOT VALID` + `VALIDATE`), `en_route_*` com os dois
    CHECKs e o índice único parcial, `tapped_at` e `result_changed`.
  - `make migration-test` verde.
  - A asserção de rollback semeia um `departed` e um `departure_cancelled` e prova o `DELETE` dos dois.
- **CA2 — Contrato de rota:** `depart` exige `Idempotency-Key` e `tappedAt`, aceita `location`,
  recusa chave extra e, com outra parada a caminho, responde `409 TRIP_HAS_STOP_EN_ROUTE` com
  `enRouteStopId` e `enRouteStopSequence`. O `cancel-departure` tem o mesmo contrato de corpo e chave, e
  responde `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE { reason }` em parada chegada ou concluída.
- **CA3 — Integração:**
  - o primeiro `depart` leva `dispatched` a `on_delivery_route`, com `trip_status_events` no canal
    `driver_app`;
  - o segundo na mesma parada responde `changed: false`, sem evento;
  - o **replay do no-op repete `changed: false`**;
  - o `depart` numa segunda parada com outra a caminho responde `409 TRIP_HAS_STOP_EN_ROUTE`, sem
    evento novo e **sem tocar a parada aberta**, e nomeia a parada aberta no contexto do erro;
  - fechar a parada aberta pelos **três** caminhos — chegada com entrega registrada, "Registrar entrega
    depois" (205) e **"Cancelar rota"** — libera o `depart` da segunda, que passa a responder `201`;
  - o `cancel-departure` grava `departure_cancelled`, zera `en_route_*` só da própria parada, **não
    muda `trips.status`** e deixa o `departed` na tabela;
  - o `cancel-departure` numa parada chegada ou concluída responde
    `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` com o `reason` certo; numa parada sem "a caminho",
    `changed: false`, e o replay repete;
  - a chegada `driver_app` zera a viagem, e a `office` só a própria parada;
  - o `tappedAt` velho vira no-op **mesmo com outra parada a caminho** (a ordem das decisões da D2);
  - a mesma chave repete a resposta;
  - os casos (a), (b) e (c) de C1.
- **CA4 — Concorrência:** mesma parada em dois celulares gera um `departed` só; dois `depart`
  concorrentes em paradas diferentes deixam uma a caminho e o outro recebe `409`, **nunca `500`** (a
  trava da D4 responde antes do índice único); `depart` × baixa do escritório nunca viola o CHECK.
- **CA5 — Política de amostra:**
  - aparelho: entra;
  - servidor: entra;
  - misto: fora;
  - `expired`: fora;
  - `office`: fora;
  - interrompido: fora;
  - irmã sem `departed`: fora;
  - piso e teto: fora;
  - `departed` com `departure_cancelled` depois dele: fora;
  - cancelou e iniciou de novo: entra, contando do `departed` mais novo.
- **CA6 — App:**
  - o cartão nos três estados, mais o quarto: "Iniciar rota" bloqueado;
  - `resolveEnRouteStopId` por snapshot, fila, chegada, item recusado ignorado e irmã;
  - `enRouteSince` ausente libera o Cheguei (D17);
  - com outra parada a caminho, `canStartRouteAtStop` devolve
    `{ enabled: false, reason: 'other_stop_en_route', blockingStopId }`, o botão sai `disabled` com o
    motivo em texto, e o atalho rola até a parada aberta e põe o foco nela **sem iniciar nada**;
  - fechar a parada aberta na própria fila (chegada, "Registrar entrega depois" ou `cancelDeparture`)
    libera os outros botões sem recarregar;
  - "Cancelar rota" aparece só na parada a caminho e sem Cheguei, pede confirmação e, confirmado,
    devolve o cartão ao estado 1;
  - o item de fila recusado por `409` mostra "Outra parada está a caminho — feche a parada N" e o
    atalho, e continua na fila (RF8b).
- **CA7 — App:** o botão de viagem não existe mais (`dispatch.contract.ts:168-200` reescrito).
- **CA8 — Painel:** uma página com `stop.departed`, com `stop.departure_cancelled` e com um kind
  desconhecido não é recusada, e os itens mostram "A caminho da parada N" e "Cancelou a rota da parada
  N".
- **CA9 — Smoke:** Iniciar rota → Cheguei → Entreguei, com a fila mostrando as três confirmações; e
  Iniciar rota → Cancelar rota, com o cartão voltando ao estado 1 e as outras paradas liberadas.
- **CA10 — Revisão visual:** prints em 375 e 768 px dos três estados, do "Cancelar rota" e da sua
  confirmação, do botão bloqueado com o motivo e o atalho, e da fila com o item recusado — mais o "pode
  subir" do usuário.
- **CA11 (Fase 7) — Teto:**
  - com o teto em 1/dia, o segundo aviso grava `skipped_limit`, e o provedor não é chamado;
  - `429` de cota vira `skipped_limit`, e `429` de taxa tenta de novo.
- **CA12 (Fase 7) — Configuração:**
  - o schema de env recusa teto acima da cota;
  - **empresa nova e empresa já existente nascem com `en_route_notice_enabled = false` e
    `email_channel_enabled = false`** — a migration não liga ninguém;
  - sem `RESEND_API_KEY`, o `PUT` que liga o canal de e-mail responde
    `422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE`; ligar um canal sem adaptador (`whatsapp`,
    `partner_webhook`) responde o mesmo;
  - ligar o aviso **sem** canal é aceito e não manda nada;
  - contratante sem opt-in não gera aviso.
- **CA15 (Fase 7) — Desligado é não existir, e a porta é a saída (D20):**
  - com o aviso desligado, um `depart` e um `cancel-departure` completos **não** criam linha de aviso nem
    de outbox, **não** incrementam o contador e **não** chamam a porta — provado com um **dublê** da
    `RecipientNoticePort` que falha o teste se for chamado;
  - com o aviso e o canal ligados, o mesmo `depart` chama a porta **uma** vez, com o
    `RecipientNoticeEvent` completo — a chave não vira código morto;
  - as regras do evento (atraso de 2 min, supressão pelo cancelamento, opt-out, unicidade por saída) são
    provadas **contra o dublê**, sem provedor real;
  - o teto e o `429` são contados por `(company_id, channel)`, e um canal esgotado não bloqueia outro.
- **CA13 (Fase 7) — Conteúdo e supressão:**
  - o e-mail não contém nome, telefone nem placa do motorista, e tem o link de descadastro;
  - um endereço descadastrado ou com bounce não recebe o próximo;
  - uma parada que chega dentro dos 2 min não avisa.
- **CA14 (Fase 7) — Cancelamento (D19):**
  - cancelar **dentro** dos 2 min deixa a outbox em `skipped_cancelled`, o provedor não é chamado e
    nenhum aviso de cancelamento nasce;
  - cancelar **depois** de enviado manda um aviso de cancelamento ao mesmo endereço, e só um;
  - endereço descadastrado ou suprimido não recebe o cancelamento;
  - **iniciar rota de novo depois de cancelar manda um segundo "a caminho"**, com
    `departure_event_id` novo, e um segundo cancelamento manda o seu par — três ciclos lentos dão seis
    e-mails;
  - **o replay não duplica:** dois `depart` com a mesma chave, ou a drenagem dobrada do mesmo item,
    geram **um** aviso por saída (a unicidade por `departure_event_id`);
  - **a reserva por obrigação em aberto:** com duas viagens, cada uma com uma parada a caminho e o aviso
    já enviado, e o contador a duas vagas do teto, **nenhum** terceiro "a caminho" sai — as duas vagas
    estão reservadas para os dois cancelamentos possíveis;
  - com uma vaga só e nenhuma obrigação em aberto, o "a caminho" sai e o cancelamento dele ainda tem
    vaga.

## Dúvidas

- **Q1 — respondida (usuário, 2026-09-25):** "pode mandar e-mail se for sem custo". Vira a D13.
- **Q2 — decidida pela D13:** o envio usa `RESEND_API_KEY` e o subdomínio de aviso do worker, não a
  chave da transportadora.
- **Q3 — não bloqueia.** O piso de 60 s e o teto de 4 h da amostra (D11) foram escolhidos sem dado.
  Conferir contra a distribuição medida depois de duas semanas em produção.
- **Q4 — respondida (usuário, 2026-09-26): "Desfazer sempre, com registro".** A pergunta era o toque
  errado, com o motorista preso na parada aberta. Das três saídas oferecidas — (1) nada, (2) janela curta
  de desfazer, (3) queda automática ao iniciar outra —, ele escolheu uma quarta, mais larga: _"Cancelar
  rota" a qualquer momento antes de Cheguei, sem janela de tempo, gravando o cancelamento no histórico e
  avisando o cliente que o motorista não vem mais._ Viram a **D18** e a **D19**, e o "desfazer" saiu de
  Fora do escopo. O default anterior era a saída 1.
- **Q5 — registrada, e não bloqueia mais nada** (decisão do usuário, 2026-09-26: a Fase 7 nasce
  **desligada** por configuração de empresa, D20). **Com o aviso desligado, o pior caso é zero e-mail** —
  a conta abaixo só passa a valer quando alguém ligar, e é aí que a T7.2 pergunta o teto, **não antes**.
  Fica registrada como decisão pendente **para o momento de ligar**. Com a unicidade por saída
  (D19, decisão do usuário de 2026-09-26), o motorista indeciso que **espera os 2 min** a cada volta
  pode render **2 e-mails por volta** ao mesmo destinatário, sem limite por parada — até **30 num dia**,
  que é a fatia diária inteira da instalação (`RECIPIENT_NOTICE_DAILY_CAP = 30`, proposta da T7.0).
  Cancelar dentro dos 2 min continua custando zero. **Falta decidir se entra um teto de avisos
  `en_route` por parada e endereço** (proposta: 3, que cobre o indeciso honesto e corta a cauda), ou um
  teto por viagem. Sem resposta, vale o que o usuário escolheu: **sem teto por parada** — cada Iniciar
  rota avisa. **Perguntar quando a primeira transportadora for ligar o aviso** (T7.2), porque até lá a
  pergunta é hipotética.

## Convivência com outras specs

A tabela de conflito de arquivos está em `plan.md` § "Convivência e conflito de arquivos". Ela cobre
192, 193, 195, 196, 197, 198, 200, 203, 204, 205, 207 e 209.

## Preview

Largura de celular, cerca de 40 colunas (375 px), com os dados da API de demonstração (T4.5). A
parada é a 2 de 3, com duas notas.

### 1. Antes de Iniciar rota

```text
┌──────────────────────────────────────┐
│ 2  Mercado Abade              ⌄      │
│    Rua das Flores, 120 · Centro      │
│    Janela 09:00–11:00 · 3,2 km       │
│    2 notas pendentes                 │
│                                      │
│ [ ▶ Iniciar rota               ]     │  ← primário, 44 px
│ [ ↗ Navegar ]  [ ⚠ Ocorrência ]      │  ← ghost
│                                      │
│  NF 1234 · 3 vol.                    │
│  Toque em "Iniciar rota" e depois    │
│  em "Cheguei" para registrar a       │
│  entrega.                            │
│  ⏱ Registrar entrega depois          │  ← link da 205 (atrás da constante)
└──────────────────────────────────────┘
```

Com outra parada a caminho, o "Iniciar rota" desta aparece bloqueado, com o motivo e o atalho:

```text
┌──────────────────────────────────────┐
│ 2  Mercado Abade              ⌄      │
│    Rua das Flores, 120 · Centro      │
│    Janela 09:00–11:00 · 3,2 km       │
│                                      │
│ [ ▶ Iniciar rota               ]     │  ← desabilitado, visível, 44 px
│ ⓘ Você está a caminho da parada 1.   │
│    Chegue, registre depois ou        │
│    cancele a rota dela.              │
│    → Ir para a parada 1              │  ← atalho: rola e foca o cartão 1
│ [ ↗ Navegar ]  [ ⚠ Ocorrência ]      │
└──────────────────────────────────────┘
```

O cartão da parada 1 diz os **três** caminhos de fechar: "Cheguei", "Cancelar rota" e, atrás da
constante da 205, "Registrar entrega depois". Fechada a 1 por qualquer um deles, o botão da 2 libera na
hora.

Na fila, um `depart` recusado pelo servidor mostra o mesmo motivo:

```text
│ ⚠ Iniciar rota — parada 2            │
│    Outra parada está a caminho —     │
│    feche a parada 1.                 │
│    → Ir para a parada 1   ↻ Tentar   │
```

### 2. A caminho

```text
┌──────────────────────────────────────┐
│ 2  Mercado Abade   ● A caminho 09:12 │  ← selo; "na fila" enquanto não drena
│    Rua das Flores, 120 · Centro      │
│    Janela 09:00–11:00 · 3,2 km       │
│                                      │
│ [ ✓ Cheguei                    ]     │  ← primário
│ [ ↗ Navegar ]  [ ⚠ Ocorrência ]      │
│ [ ✕ Cancelar rota ]                  │  ← ghost, some depois do Cheguei
│                                      │
│  NF 1234 · 3 vol.                    │
│  Toque em "Cheguei" para registrar   │
│  a entrega.                          │
└──────────────────────────────────────┘
```

O "Cancelar rota" pede confirmação no próprio cartão, dizendo o efeito no cliente:

```text
│ Cancelar a rota da parada 2?         │
│ O cliente será avisado de que você   │
│ não vem mais.                        │
│ [ ✕ Cancelar rota ] [ ← Voltar ]     │
```

Confirmado, o cartão volta ao estado 1 e as outras paradas liberam. Dentro dos 2 min do aviso, o
cliente não recebe nada — nem "a caminho" nem "não vou mais" (D19).

### 3. Depois de Cheguei

```text
┌──────────────────────────────────────┐
│ 2  Mercado Abade   ✓ Cheguei às 09:31│
│    Rua das Flores, 120 · Centro      │
│ [ ↗ Navegar ]  [ ⚠ Ocorrência ]      │
│                                      │
│  NF 1234 · 3 vol.                    │
│  [ ✓ Entreguei ] [ ↩ Não entreguei ] │
│  [ ⚠ Registrar ocorrência ]          │
│  NF 1240 · 1 vol.                    │
│  [ ✓ Entreguei ] [ ↩ Não entreguei ] │
└──────────────────────────────────────┘
```

O cabeçalho da viagem não tem mais o botão "Iniciar rota". O selo "Em rota de entrega" continua,
lido do status.

### 4. Painel — linha do tempo

```text
09:31  ✓ Chegou na parada 2 · Motorista (app)
09:12  ↻ Viagem: Em rota de entrega · Motorista (app)
09:12  ▶ A caminho da parada 2 · Motorista (app)
09:08  ✕ Cancelou a rota da parada 3 · Motorista (app)
09:05  ▶ A caminho da parada 3 · Motorista (app)
```

A saída cancelada **fica** na linha do tempo: o histórico diz o que aconteceu, e o escritório entende
por que o motorista mudou de destino.
