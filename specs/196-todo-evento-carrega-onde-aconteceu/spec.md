# Feature 196 — Todo evento carrega onde aconteceu

> Estado: pronta para execução, revisada depois da crítica de 2026-09-25 (M1–M9) · Data: 2026-09-25 ·
> ADR: `docs/adr/0081-todo-toque-do-motorista-carimba-onde-aconteceu.md` (status `proposta`, passa a
> `aceita` na T0.1)

## Problema e resultado

Decisão do usuário, 2026-09-25: **"cada evento deve pegar localização"**.

Hoje só parte do que o motorista registra na app diz onde aconteceu. Conferido no código em
2026-09-25:

| Toque na app                                | Rota                                               | Grava o ponto?                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cheguei                                     | `POST /me/trips/current/stops/:stopId/arrive`      | sim — `{ location }` no corpo (`me-trip.routes.ts:343-353`, `me-trip.schema.ts:25-33`), em `trip_stop_events` (`trip.schema.ts:989-1008`)                             |
| Entreguei                                   | `POST .../documents/:documentId/deliver`           | sim — idem                                                                                                                                                            |
| Devolvi / "Não entreguei"                   | `POST .../documents/:documentId/return`            | sim — idem (`me-trip.routes.ts:405-416`)                                                                                                                              |
| Foto/assinatura do canhoto                  | `POST .../documents/:documentId/proof` (multipart) | sim — `latitude`/`longitude`/`accuracyMeters`/`capturedAt` no formulário, em `trip_delivery_proofs` (`trip.schema.ts:1422-1432`)                                      |
| Despachar                                   | `POST /me/trips/current/dispatch` (`{ tripId }`)   | **não** (`me-trip.routes.ts:418-436`, `me-trip.schema.ts:55`); a troca de status vai para `trip_status_events` (`trip.schema.ts:392-420`), sem coluna                 |
| Iniciar rota                                | `POST .../start-route` (sem corpo)                 | **não** — `parse: () => undefined` (`me-trip.routes.ts:297-324`): a rota ignora qualquer corpo; `startFieldTrip` grava `trip_status_events`                           |
| Conferir carga (sem botão desde a spec 185) | `POST .../confirm-load` (sem corpo)                | **não** — mesma rota acima                                                                                                                                            |
| Ocorrência da parada                        | `POST .../stops/:stopId/occurrences`               | **não** — `{ description, documentId, kind, distanceMeters? }` (`me-trip.schema.ts:42-53`, `.strict()`), em `trip_stop_occurrences` (`trip.schema.ts:1159-1196`)      |
| Ocorrência da nota, pela fila (com foto)    | `POST .../documents/:documentId/occurrences`       | **não** — `{ note, occurrenceTypeId, productCode, attachmentObjectId? }` + `Idempotency-Key` (`occurrence.schema.ts:37`, `.strict()`), em `trip_document_occurrences` |
| Ocorrência da nota, **direta** (sem fila)   | a mesma rota, por `registerDocumentOccurrence`     | **não** — `DriverTripWorkspace.page.tsx` (`onDocumentOccurrence`) → `driverTripClient.service.ts:128-132,228-240`: `POST` direto, fora da fila                        |
| Foto da ocorrência                          | `POST .../occurrence-uploads` e `.../confirm`      | não — e não precisa: é o anexo, não o evento (D6)                                                                                                                     |

Na app, a ocorrência da parada entra na fila **sem** posição (`driverTrip.types.ts:175-181`; o
comentário de `applyReportLocation` em `offlineQueue.service.ts:203-219` diz "Ocorrência não leva
posição"), a ocorrência da nota também (`driverTrip.types.ts:188-199`), e "Despachar"/"Iniciar rota"
são `POST` diretos sem posição (`driverTripClient.service.ts:217-227`).

`reported_distance_meters` (`trip_stop_occurrences`) existe no schema, mas a app nunca manda
`distanceMeters` (`driverTripClient.service.ts:185-190`). A partir desta spec, **a fonte da distância é
o carimbo**: quem precisar dela (a spec 195) calcula no servidor a partir do ponto gravado.

E o escritório **não vê ponto nenhum**, nem dos que já são gravados: a linha do tempo (spec 158)
tirou latitude e longitude da resposta de propósito (spec 158, "Fora do escopo" e CA8), e nenhuma
outra tela do painel lê `trip_stop_events.latitude`. O dado existe, envelhece 90 dias e é apagado
sem ninguém o ter olhado.

**Resultado:**

1. Todo evento que o motorista registra pela app grava onde aconteceu — latitude, longitude,
   precisão e hora da leitura —, por leitura **pontual** no toque (ADR-0045 §3: a posição carimba
   o fato, nunca segue a pessoa).
2. As regras de hoje valem para todos: GPS recusado não bloqueia (grava sem ponto), 90 dias com
   expurgo, nunca em log, e o toque que vai para a fila **grava primeiro e completa a posição
   depois** (spec 189 T9.2 M1).
3. Cada evento diz o **estado** do seu ponto: registrado, sem localização, apagado pelo prazo — ou
   nada, quando não se aplica (escritório, operador, ação derivada, histórico sem ponto).
4. Quem gere a frota vê, na linha do tempo da viagem, o ponto de cada evento do motorista: a
   precisão, a hora da leitura e "Ver no mapa", que abre o mapa no próprio item, com a parada ao lado.
   Os demais papéis veem só o estado.

## Fora do escopo

- **Posição contínua.** O rastreamento com consentimento (ADR-0050 §5, `locationSharing.service.ts`)
  não muda, nem passa a alimentar o carimbo. O carimbo continua sendo `getCurrentPosition` uma vez
  por toque.
- **Despachar e Iniciar rota sem rede.** Os dois continuam `POST` direto, como hoje. Pôr os dois na
  fila é outra decisão (portões de estado, snapshot que abre as ações de campo) — registrada como
  continuação em `plan.md` § Riscos.
- **Ponto no portal do contratante, no WhatsApp, em exportação, no demonstrativo ou na tratativa.** A
  lista fechada de quem lê o ponto está no D7 e no RF12.
- **Distância calculada entre o ponto e a parada** na linha do tempo. O mapa mostra os dois pinos; a
  conta é da 195, para a sugestão de endereço.
- **Refazer a tela de fila do motorista (`/fila`)** para dizer "sem localização" por item: a spec 193
  está redesenhando essa tela agora (ver Interseções).
- **Backfill de estado em evento sem ponto.** Evento antigo sem coordenada fica com
  `location_state = null` (não se sabe se foi recusa ou se nunca houve pedido). O único ajuste de
  histórico é o do D2: linha com coordenada ganha `captured`.
- **A tela antiga `/minha-viagem` do painel** (`frontend-transportada/src/modules/driver-trip/`), que
  a ADR-0075 §6 aposenta. Ela já manda `location` em chegada, entrega e devolução, e continua assim.
  Nas ocorrências, no despacho e em "Iniciar rota" ela não manda, e o evento grava `unavailable` —
  que é verdade. Nenhuma mudança nela.

## Decisões

- **D1 — Colunas em cada tabela de evento, não uma tabela única de carimbo.** As mesmas quatro
  colunas que `trip_stop_events` e `trip_delivery_proofs` já têm (`latitude`, `longitude`,
  `accuracy_meters`, `captured_at`) entram em `trip_status_events`, `trip_stop_occurrences` e
  `trip_document_occurrences`. Uma tabela `event_location_stamps (event_type, event_id)` foi
  descartada por três motivos:
  1. ela seria consultável **por motorista, entre viagens**, ordenada por hora — o trajeto da pessoa,
     que a ADR-0045 §3.2 proíbe. As colunas no evento só são lidas **por viagem** (linha do tempo) e,
     na 195, por ocorrência;
  2. `(event_type, event_id)` não tem FK: a exclusão em cascata da viagem deixaria ponto órfão, e o
     isolamento por empresa passaria a depender de disciplina, não de constraint;
  3. a linha do tempo já lê a linha do evento, e a tabela única custaria um `join` polimórfico por
     fonte.

  O expurgo único não é vantagem real: cada tabela tem seu índice parcial, e a lista de tabelas é uma
  constante só, vigiada por contrato (D8).

- **D2 — Cada evento guarda o estado do ponto** em `location_state` (`VARCHAR(16)`, anulável, sem
  ENUM): `captured` (há ponto), `unavailable` (toque sem ponto — recusa, sem sinal, tempo esgotado,
  app antiga, ou comando do motorista pelo WhatsApp), `expired` (o expurgo apagou). `null` é **não
  se aplica**: escritório, operador (web ou WhatsApp), ação derivada, despacho automático e evento
  antigo sem coordenada. A coluna entra também em `trip_stop_events` (chegada, entrega, devolução), e a
  migration marca `captured` nas linhas antigas que já têm coordenada — sem isso, "Ver no mapa"
  sumiria do histórico que existe hoje.
- **D3 — Quem grava ponto é o canal `driver_app`; quem grava estado é `driver_app` ou `whatsapp`.**
  - **Escritório em nome do motorista (spec 156, ADR-0067):** não se aplica. O escritório não está
    na parada, e a posição dele não é a do fato. `location_state = null`, e as rotas do escritório
    continuam recusando `location` no corpo (schemas `.strict()`).
  - **WhatsApp do motorista (spec 144):** as três ações de `driverWhatsAppFlowActions`
    (`main.ts:833-873`: `registerOccurrence`, `reportDelivery`, `reportReturn`) gravam
    `location_state = 'unavailable'`, e a linha do tempo diz "Sem localização — o WhatsApp não envia a
    posição". Pedir a mensagem de localização do WhatsApp no fluxo é spec futura.
  - **WhatsApp do operador:** `operatorWhatsAppFlowActions` (`main.ts:886,951,990` — despachar e
    ocorrência de separação) grava `null`. O operador não é o motorista na rua, e o canal não o torna
    um.
  - **Backoffice e o despacho automático da spec 185:** `null`.
  - O banco garante, nas três tabelas novas: `latitude is null or channel = 'driver_app'` e
    `location_state is null or channel in ('driver_app', 'whatsapp')`.
- **D4 — Só o toque carimba; a consequência não.** A entrega que deriva `on_delivery_route` ou
  `completed` grava um `trip_status_events` que **não** leva ponto (`null`): o ponto está no evento
  da entrega. Levam ponto só as trocas de status que **são** o toque — "Despachar", "Iniciar rota" e
  "Conferir carga". Toque repetido que não muda nada (`changed: false`) não grava evento, e portanto
  não grava ponto.
- **D5 — Toque que vai para a fila grava primeiro; toque direto espera a posição com prazo curto.**
  - **Na fila** (chegada, entrega, devolução, ocorrência da parada, ocorrência da nota — **as duas
    portas**, inclusive a que hoje é `POST` direto — e "Não entreguei"): o item entra com
    `location: null`, a leitura de 8 s completa pela chave (`applyReportLocation`), e só então a
    drenagem é pedida — o molde da spec 189 T9.2 M1. "Não entreguei" grava dois itens; a posição
    completa **os dois**. A ocorrência de nota direta (`registerDocumentOccurrence`) passa a entrar na
    fila como `documentOccurrence` sem foto: ganha o carimbo e deixa de se perder sem rede.
  - **Direto** ("Despachar", "Iniciar rota"): não há gravação local para fazer primeiro. O botão faz
    uma leitura só (`getCurrentPosition`, ADR-0045 §3) com `enableHighAccuracy: false` e
    `maximumAge: 300_000` (5 min), numa **corrida com um relógio da própria app de 3 s**
    (`Promise.race`). O `timeout` da Geolocation API não serve para isso: ele só começa a contar
    depois da permissão, e o primeiro pedido de permissão seguraria o botão indefinidamente. Esgotado
    o relógio, o `POST` sai com `location: null`. Precisão de rede (e não de GPS) e leitura de até 5
    min bastam para "saiu do pátio"; `capturedAt` e a precisão ficam gravados e o escritório vê os
    dois.
- **D6 — O anexo não é evento.** `occurrence-uploads` e o `confirm` não levam ponto: o ponto é da
  ocorrência, que é o toque. A foto do canhoto continua com o próprio ponto (ADR-0070), porque ali a
  posição da foto decide a pontualidade.
- **D7 — Quem lê o ponto é uma lista fechada, e quem gere a frota é quem vê a coordenada.** Decisão do
  usuário (2026-09-25): o ponto é para quem gere a frota — quem tem `fleet.read` sem ser só
  `separator`. Como a autorização da API é por permissão, e não por papel (`context.scope.permissions`),
  a regra vira a permissão nova **`trip.event-location`**, dada aos papéis que têm `fleet.read`, menos
  o `separator`: `company-admin`, `operator`, `fiscal` e `viewer` (`authorization.policy.ts`). Membership
  com `separator` e mais um desses papéis recebe a permissão pela união, que é o "sem ser **só**
  separator". O `finance` (tem `trip.report-on-behalf`, não tem `fleet.read`,
  `authorization.policy.ts:147-151`) e o `separator` recebem `location: null` e continuam recebendo
  `locationState` — o molde é `test/trip-http/driver-redaction.contract.ts` (spec 156 D11).
  **Confirmado pelo usuário em 2026-09-25:** `trip.event-location` vale para `company-admin`,
  `operator`, `fiscal` e `viewer`; `finance` e `separator` recebem `location: null`.

  Os leitores permitidos, e o que cada um expõe:

  | Leitor                                                                                  | Expõe                                           | Política                                                           |
  | --------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
  | `GET /trips/:id/timeline` (spec 158)                                                    | `location` (com a permissão) e `locationState`  | `TRIP_FIELD_READ_POLICY` + `trip.event-location` para a coordenada |
  | Detalhe da sugestão de endereço (spec 195, `read-stop-location-suggestion.use-case.ts`) | o ponto do carimbo da ocorrência                | política própria, declarada pela 195                               |
  | Feed de ocorrências (`trip-occurrence-feed.query.ts`), pela 195                         | **só** o estado ("Sem ponto", "Ponto expirado") | a do feed                                                          |
  | Distância da sugestão (spec 195)                                                        | metros derivados no servidor, nunca coordenada  | a da 195                                                           |

  Todo o resto — portal do contratante, tratativa, demonstrativo, acerto, reentrega, lote do
  escritório, a app do motorista — não lê as colunas. Um contrato mantém a lista (RF12, CA12).

  Na tela, o mínimo útil: uma linha no item com a precisão e a hora da leitura, e "Ver no mapa", que
  **expande no próprio item** (como a foto da spec 180) um mapa com o pino do evento e o da parada.
  Isto **emenda a spec 158** ("Fora do escopo" e CA8), por escrito na ADR-0081.

- **D8 — O expurgo é um só job, com uma lista de tabelas.** `trip.location.purge` (worker) varre as
  cinco tabelas de evento com ponto — `trip_stop_events`, `trip_delivery_proofs`,
  `trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences` —, apaga as quatro
  colunas e marca `location_state = 'expired'` onde a coluna existe. O teto de lotes é **por tabela**,
  com `exhausted` por tabela: uma tabela atrasada não come o ciclo das outras. Um contrato reprova
  tabela com `latitude` no schema da API que não esteja nem na lista do worker nem na lista de
  exclusões com motivo (`trip_stops`, `client_delivery_addresses`, `geocoded_addresses`,
  `geocoded_address_corrections`, `municipality_centroids`, `toll_booths`: endereço ou cadastro, não
  posição de pessoa; `trip_location_pings`: rastro ao vivo, com expurgo próprio de horas).
- **D9 — Toda rota nova de escrita do motorista declara o ponto.** Um contrato percorre as rotas
  `POST` de `/me/trips/current/**` e exige que cada uma aceite `location` ou esteja numa lista
  explícita de exceções com o motivo (D9 no `plan.md`). Rota nova que esquecer reprova.
- **D10 — Ordem de publicação.** A app nova não pode falar com a API antiga: os schemas `.strict()`
  dão `400` no corpo com `location`, e a fila **descarta** item recusado
  (`offlineQueue.service.ts:165-167,186`) — seria perda de entrega. E o painel antigo recusa item da
  linha do tempo com chave nova (`hasExactKeys`, spec 158 CA8). A publicação é em três etapas, com
  verificação entre elas (`plan.md` § Ordem de deploy).

## Histórias priorizadas

### P1 — O despacho e a saída dizem onde aconteceram

**Given** o motorista com a viagem pronta e GPS permitido, **when** toca "Iniciar rota", **then** o
evento `trip.status_changed` para `in_transit` guarda o ponto, com `location_state = 'captured'`.
**Given** GPS negado ou o pedido de permissão aberto, **when** toca, **then** a rota inicia em até 3 s e
o evento fica `unavailable`.

### P1 — A ocorrência diz onde aconteceu, mesmo sem rede

**Given** o motorista sem sinal, **when** registra ocorrência da parada, ocorrência da nota ou "Não
entreguei", **then** os itens entram na fila na hora, a posição os completa pela chave, e ao drenar
cada ocorrência chega com o ponto (ou `unavailable`).

### P1 — Quem gere a frota vê o ponto

**Given** uma viagem com eventos do motorista, **when** o operador abre a linha do tempo, **then** cada
evento do motorista diz "Localização registrada · ±12 m · 14:02" com "Ver no mapa", ou "Sem
localização", ou "Localização apagada após 90 dias"; o evento do escritório não diz nada sobre
posição. **Given** o `finance`, **then** vê o estado e não vê coordenada nem "Ver no mapa".

### P2 — O prazo vale para todos

**Given** eventos com ponto há mais de 90 dias nas cinco tabelas, **when** o expurgo roda, **then** as
coordenadas somem, o evento fica, e `location_state` vira `expired`.

## Requisitos funcionais

- **RF1** `POST /me/trips/current/dispatch` aceita `{ tripId, location? }`; `start-route` e
  `confirm-load` passam a ler corpo **opcional** `{ location? }` — corpo vazio continua válido.
- **RF2** `POST .../stops/:stopId/occurrences` e `POST .../documents/:documentId/occurrences` aceitam
  `location` opcional, no mesmo `locationSchema` de hoje (inteiro ou nada; `.strict()`).
- **RF3** Em toda rota de toque do motorista, `location` ausente ou `null` grava
  `location_state = 'unavailable'`; presente grava as quatro colunas e `captured` (D2). A precisão
  acima do que a coluna `numeric(10,2)` guarda é **reduzida ao teto** no servidor
  (`toReportedLocation`) e na app, nunca recusada — recusar derrubaria o item da fila.
- **RF4** As trocas de status que são toque (D4) gravam o ponto em `trip_status_events`; as derivadas
  gravam `location_state = null`.
- **RF5** Escritório (`office`), backoffice, despacho automático e **WhatsApp do operador** gravam
  `location_state = null`; as três ações do **WhatsApp do motorista** gravam `unavailable` (D3). As
  rotas do escritório continuam recusando `location`.
- **RF6** Na app, ocorrência da parada e ocorrência da nota (as duas portas) levam `location` no item
  da fila; entram com `null` e são completadas pela chave; "Não entreguei" completa os dois itens (D5).
- **RF7** Item da fila gravado por versão anterior da app, sem o campo `location`, sai com
  `location: null` — nunca quebra a drenagem.
- **RF8** "Despachar" e "Iniciar rota" disparam o `POST` em no máximo 3 s depois do toque, com ou
  sem posição, mesmo com o pedido de permissão aberto (D5).
- **RF9** `GET /trips/:id/timeline` devolve `location` e `locationState` por item; `location` só com
  `trip.event-location`, `null` para os demais; nenhum outro campo de posição (D7).
- **RF10** A linha do tempo do painel mostra, por estado: `captured` com `location` → precisão, hora da
  leitura e "Ver no mapa" (expande no item um mapa com o pino do evento e o da parada, quando a parada
  tem coordenada); `captured` sem `location` (sem a permissão) → "Localização registrada", sem mapa;
  `unavailable` → "Sem localização" (no WhatsApp, "Sem localização — o WhatsApp não envia a
  posição"); `expired` → "Localização apagada após 90 dias"; `null` → nada.
- **RF11** O expurgo de 90 dias cobre as cinco tabelas, em lotes, com teto e `exhausted` por tabela, e
  marca `expired` (D8).
- **RF12** Só os leitores da tabela do D7 leem as colunas novas, e cada um só no que ela diz. Um
  contrato lista os leitores permitidos e reprova os demais.

## Requisitos não funcionais

- Migration **aditiva** (colunas anuláveis sem default, CHECKs, índices parciais e o `UPDATE` de
  `captured` do D2), com `rollback.sql` e `make migration-test`.
- Coordenada nunca em log, em nenhum nível, nem na API de demonstração do preview. O log do expurgo
  conta linhas por tabela; o da API, se registrar algo, registra só `locationState`.
- `numeric(10,7)` para latitude/longitude e `numeric(10,2)` para a precisão — o mesmo tipo das
  colunas de hoje; precisão ruim é gravada com o número, nunca descartada (ADR-0045 §4).
- O mapa do painel carrega sob demanda (`lazy`), como o `TripRouteMap`; abrir a linha do tempo não
  baixa o mapa. O mapa base é o PMTiles da própria instalação (`BASEMAP_URL`,
  `vectorBasemap.service.ts:67`); as requisições por faixa de bytes revelam a área a quem hospeda o
  arquivo, e isso é registrado no `docs/SECURITY.md`.
- Toque ≥ 44 px, textos em `*.locale.json`, ícone de biblioteca (`map-pin`) — `web.md` §6, §9, §10.

## Casos extremos e falhas

| Caso                                                     | Comportamento                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Permissão de GPS negada                                  | O evento grava, `unavailable`.                                                                                     |
| Pedido de permissão aberto no toque direto               | O relógio da app corre desde o toque; em 3 s o `POST` sai com `null`.                                              |
| GPS demora mais que 8 s (fila)                           | O item drena sem ponto se a drenagem sair antes; fica `unavailable`.                                               |
| Drenagem em voo leva o item antes de a posição completar | Chega `unavailable`; o reenvio devolve o primeiro resultado (idempotência) e não corrige — o evento é append-only. |
| Precisão de 5 km, ou `0,0`                               | Grava com a precisão ao lado (ADR-0045 §4); o painel mostra `±5 km`.                                               |
| Precisão maior que o teto da coluna                      | Reduzida ao teto, gravada; nunca `400`.                                                                            |
| `capturedAt` com relógio do aparelho errado              | Grava o que veio; o painel mostra a hora da leitura ao lado da hora do evento.                                     |
| Latitude sem longitude                                   | `400` — `locationSchema` é inteiro ou nada.                                                                        |
| Escritório manda `location`                              | `400` (schema `.strict()`).                                                                                        |
| App nova contra API antiga                               | Não acontece pela ordem de deploy (D10); se acontecesse, `400` e o item sairia da fila — por isso a ordem é gate.  |
| API revertida com a app nova no ar                       | Proibido: reverte-se a app primeiro (`plan.md` § Ordem de deploy).                                                 |
| "Iniciar rota" tocado duas vezes                         | O segundo é `changed: false`: sem evento novo, sem ponto novo.                                                     |
| Evento com mais de 90 dias                               | Coordenadas apagadas, `expired`; o evento e a hora ficam.                                                          |
| Evento antigo sem ponto                                  | `location_state = null`: a linha do tempo não diz nada sobre posição.                                              |
| Parada sem coordenada                                    | "Ver no mapa" mostra só o pino do evento.                                                                          |
| `finance` ou `separator` abrem a linha do tempo          | Estado sim, coordenada não, sem "Ver no mapa".                                                                     |
| Viagem de outra empresa                                  | `404`, como hoje (contrato de isolamento).                                                                         |

## Critérios de aceite

- **CA01** Cada rota de toque do motorista (chegada, entrega, devolução, ocorrência da parada,
  ocorrência da nota, despacho, iniciar rota, conferir carga) grava as quatro colunas e `captured`
  quando recebe `location`, e `unavailable` quando não recebe — provado contra Postgres.
- **CA02** Troca de status derivada da entrega grava `location_state = null`.
- **CA03** Baixa do escritório grava `null`; as três ações do WhatsApp do motorista gravam
  `unavailable`; o despacho e a ocorrência de separação pelo WhatsApp do **operador** gravam `null`;
  rota do escritório com `location` no corpo → `400`.
- **CA04** O CHECK recusa ponto com canal diferente de `driver_app`, estado com canal fora de
  `driver_app`/`whatsapp`, `captured` sem latitude e latitude sem `captured`.
- **CA05** A app manda `location` em ocorrência da parada, ocorrência da nota (as duas portas),
  despacho e iniciar rota; o item da fila entra com `null` e é completado pela chave; "Não entreguei"
  completa os dois; a ocorrência de nota direta passa pela fila.
- **CA06** Item antigo da fila sem o campo drena com `location: null`.
- **CA07** Com uma Geolocation falsa que **ignora as opções** e nunca responde, "Iniciar rota" dispara o
  `POST` em ≤ 3 s com `location: null` (contrato com relógio falso) e em ≤ 3,2 s no smoke.
- **CA08** `GET /trips/:id/timeline` devolve `location` e `locationState`; com `trip.event-location`
  a coordenada vem, sem ela `location` é `null` e o estado vem; nenhuma chave de posição fora das
  duas; o contrato da spec 158 (CA8) é emendado, não contornado.
- **CA09** O painel mostra as variações do RF10 e expande o mapa no item; prints em 1280 e 375 px, com
  coordenada sintética, aprovados pelo usuário.
- **CA10** O expurgo apaga as coordenadas das cinco tabelas e marca `expired`, com teto por tabela; o
  contrato do D8 reprova tabela com `latitude` fora da lista e fora das exclusões.
- **CA11** O contrato do D9 reprova rota `POST` nova de `/me/trips/current/**` sem `location` e fora da
  lista de exceções.
- **CA12** O contrato do RF12 reprova leitor das colunas novas fora da tabela do D7, e as respostas do
  portal, da tratativa, do demonstrativo, do acerto e da reentrega não têm chave de posição.
- **CA13** `make migration-test` passa com a migration e o `rollback.sql`.
- **CA14** A publicação seguiu as três etapas do D10, com a sonda da etapa 2 registrada em
  `evidence.md` antes da etapa 3.

## Interseções com specs em andamento

- **192 — o motorista muda a ordem (ADR-0077).** A reordenação do motorista é evento (canal
  `driver_app`, `trip_stop_order_events`), e pela decisão desta spec leva o carimbo. A ADR-0077 §10
  diz que a coordenada da **sugestão** não vai para o evento — isso continua certo: aquela coordenada
  é entrada do solver, efêmera. O carimbo do toque "Salvar ordem" é outro dado, com os 90 dias.
  **Obrigação da 192** (a 192 está sendo reescrita por outro planejador; esta nota é o registro até lá):
  `trip_stop_order_events` nasce com as colunas do D1 e o `location_state`, a tabela entra na lista do
  expurgo, e as rotas de sugestão entram na lista de exceções do D9. Se a 196 chegar depois ao
  `origin/staging`, a 196 acrescenta; o contrato do D8 reprova quem esquecer. **Linha do tempo:** a
  T0.2 da 192 faz o validador do painel ignorar `kind` desconhecido; a T4.0 desta spec faz o mesmo
  validador aceitar `location`/`locationState` opcionais. São a mesma porta: quem vier depois faz
  rebase sobre a outra e não reimplementa.
- **193 — quem recebeu, contato e a fila.** O comprovante já tem ponto; nada muda nele. A 193
  redesenha `/fila` e o cabeçalho: esta spec **não** mexe nessas telas. As duas tocam
  `useDriverTrip.hook.ts`, `driverTrip.types.ts` e `DriverStopCard.component.tsx`: conferir `git log`
  antes de editar.
- **194 — verificação do canhoto (ADR-0078).** Roda sobre a foto do canhoto, que já leva ponto. Sem
  interseção de dados; a verificação não pode tirar `latitude`/`longitude` do multipart.
- **195 — endereço incorreto com ponto (sobre `address-correction`, spec 150).** A 195 é **leitora** do
  carimbo desta spec, e a tabela do D7 a inclui por nome:
  - o detalhe da sugestão lê o ponto do carimbo da ocorrência da parada, com política própria
    declarada pela 195;
  - o feed lê **só** `location_state` ("Sem ponto", "Ponto expirado"), nunca a coordenada
    (`specs/195-o-endereco-errado-vira-correcao/plan.md`, § Feed e linha do tempo);
  - a distância é calculada no servidor a partir do carimbo, e a resposta leva metros, não ponto.

  Quando a sugestão é **aceita**, a coordenada passa a ser dado de endereço
  (`applyGeocodedAddressCorrection`, `geocoded_address_corrections`), que não é posição de pessoa e
  fica fora do expurgo (exclusão do D8). O carimbo da ocorrência continua com os 90 dias: sugestão
  pendente há mais de 90 dias perde o ponto, e é esse o "Ponto expirado" da 195.

- **189 — app própria.** Reusa `readCurrentLocation`, `reportWithLocation` e `applyReportLocation`
  (T9.2 M1).
- **158 / 180 — linha do tempo.** Emenda da 158 (D7). O mapa expande no item como a foto da 180 (RF16).

## Dúvidas

Nenhuma aberta. Quem vê o ponto é decisão do usuário de 2026-09-25, confirmada no mesmo dia com a lista de papéis da permissão `trip.event-location` (D7). Duas escolhas
feitas aqui são reversíveis sem migration:

1. o relógio de 3 s, `maximumAge` de 5 min e `enableHighAccuracy: false` do toque direto (D5) —
   revistos pela T7.6;
2. o escritório nunca carimba (D3).
