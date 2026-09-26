# Feature 195 — O endereço errado vira correção

> Estado: pronta para execução. Revisada pela crítica (M1–M6) e com as quatro perguntas respondidas pelo
> usuário em 2026-09-25. Roda depois das Fases 1, 2 e 3 da spec 196 · Data: 2026-09-25 · ADR:
> `docs/adr/0080-o-ponto-do-motorista-e-sugestao-que-o-escritorio-aplica.md` (emenda a ADR-0057,
> responde a D4 da 084, aceita a 084 T1d para `driver` e para o pino do escritório e abre uma exceção
> nomeada à ADR-0081 §6)

## Problema e resultado

O motorista chega a uma parada e o pino está no lugar errado. A causa mais comum é o endereço da nota
cair no centro do município: 149 dos 300 endereços medidos na 084 têm precisão `city`. Outras causas
são o número trocado e a entrada pelos fundos. Ele acha a porta certa perguntando e entrega, e o
sistema não fica sabendo de nada disso. Na próxima nota da mesma loja, o próximo motorista roda os
mesmos quilômetros. O escritório também fica sabendo disso por telefone ("o endereço certo é na outra
rua") e não tem onde registrar o fato.

O produto já tem as peças para consertar isso, mas nenhuma delas vem do campo:

| peça                                                      | o que faz hoje                                                                                                | de onde veio        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| `PATCH /geocoded-addresses/:addressKey`                   | o escritório arrasta o pino e grava `rooftop`/`manual`, com trilha em `geocoded_address_corrections`          | 084 G1/T1e          |
| `geocoded_address_corrections.origin`                     | já aceita `driver`, mas nenhum caminho grava esse valor                                                       | 084 T01             |
| `address_correction_requests` + e-mail à contratante      | corrige o **texto** do cadastro na origem (a próxima nota chega certa)                                        | 150                 |
| `trip_stop_occurrences` + `/ocorrencias` + linha do tempo | o relato de parada, com anexo, distância, canal e idempotência                                                | 079/082/156/158/180 |
| carimbo de posição em todo toque do motorista             | `trip_stop_occurrences` ganha ponto + `location_state`, com expurgo de 90 dias                                | 196 / ADR-0081      |
| ADR-0057                                                  | decidiu `wrong_address` como ocorrência **de parada** e que o app não corrige nada, e ficou sem implementação | 082 evidence §1     |

**Resultado:**

- No card da parada, o motorista toca **"Endereço incorreto"**. A app captura o ponto em que ele está
  (leitura pontual, renovada no "Enviar" se tiver envelhecido), aceita uma observação e uma foto
  opcionais, e enfileira o relato como os outros. A entrega segue normalmente.
- No detalhe da viagem, o escritório também registra **"Endereço incorreto"**, arrastando o pino para o
  lugar certo no mapa.
- Os dois relatos viram uma **sugestão**, que aparece em **Ocorrências** (`/ocorrencias`) e na linha do
  tempo da viagem como **Correção de endereço**, e o sino leva direto ao detalhe.
- O detalhe mostra o pino atual, o ponto proposto e a distância entre os dois, além da observação e da
  foto. Quem tem `occurrences.resolve` escolhe **"Usar este ponto"**, que corrige a coordenada daquele
  endereço para as próximas viagens, ou **"Descartar"**. Uma sugestão descartada pode ser **reaberta**;
  uma aplicada, não.
- Fica registrado quem registrou, quem decidiu, quem reabriu e quando.

## Decisões do usuário (2026-09-25)

| #   | pergunta                                               | resposta                                                                                |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| (a) | "Página de aviso" é `/ocorrencias` ou `/notificacoes`? | **`/ocorrencias`**, com o sino levando ao detalhe (RF17, RF19)                          |
| (b) | Quem aplica?                                           | **`occurrences.resolve`** (ADR-0080 §3.1)                                               |
| (c) | O escritório também registra `wrong_address`?          | **Sim**, com o ponto vindo do pino que ele arrasta no mapa (P4, RF23–RF25, ADR-0080 §6) |
| (d) | Uma sugestão descartada pode ser reaberta?             | **Sim**, `dismissed → pending`; a aplicada nunca reabre (P5, RF14, ADR-0080 §8)         |

### Relação com as specs anteriores (lidas antes de escrever)

- **084 (agenda de endereços).** Esta spec **realiza** G12, T17, T18a e T18b da 084 e **responde a
  D4**: o pino do motorista entra como **sugestão aprovada pelo escritório**, nunca direto. Ela segue a
  regra da 084 de que **candidato ambíguo não vira coordenada** (P5): chave sem logradouro que junta
  ruas, ou `S/N`, não se aplica (M1). Para gravar, usa a trilha da 084 e o upsert do `PATCH` (G1/T1e),
  e aceita a T1d para `driver` e para o pino do escritório (ADR-0080 §4). Não escreve em
  `client_delivery_addresses`, que não tem leitor enquanto a T3b estiver aberta e cujo envelope do
  `client_tax_id` ainda não foi decidido (T1c). O pino do escritório **reusa** a interação de arrastar
  pino do "Ajustar no mapa", mas grava sugestão, e não coordenada direta.
- **150 (pedido de correção à contratante).** É complementar, sem sobreposição. A 150 corrige **como o
  endereço se chama**, na origem. A 195 corrige **onde ele fica**, na nossa base. A 195 não cria
  segundo pedido, segundo e-mail nem tabela paralela a `address_correction_requests`. A P3 só faz o
  relato virar **motivo** de um pedido da 150, e a 150 é a saída quando a chave é ambígua.
- **196 (todo toque carimba onde aconteceu, ADR-0081).** É **pré-requisito**. A 196 dá a
  `trip_stop_occurrences` as colunas do carimbo, faz a rota da ocorrência de parada aceitar `location`
  e põe a tabela no expurgo de 90 dias. A 195 **não recria nada disso**: o ponto do relato do motorista
  **é** o carimbo da ocorrência. A 196 separou dois papéis do ponto, e a 195 os mantém separados: o
  **carimbo** (onde o motorista estava; dado pessoal; 90 dias; é da 196) e a **coordenada proposta do
  endereço** (dado de cadastro). O pino do escritório é só do segundo tipo: não é posição de ninguém. A
  fila da app já completa `location` pela chave em qualquer item que tenha o campo
  (`offlineQueue.service.ts:209-219`), então a 195 não depende da T5.2 da 196.
- **197 (a parada é do cliente, ADR-0082).** A parada passa a ser o par (cliente, endereço), e a
  `address_key` continua sendo a chave do lugar. A correção da 195 é do **endereço** e corrige as
  paradas irmãs juntas, porque é o mesmo portão (197 D20). A sugestão guarda a **parada** de origem
  (`stop_id`), e por ela o destinatário. Enquanto a 084 T3b/T1c estiver aberta, a correção vale para
  todos os destinatários da chave, e o detalhe mostra "esta chave serve N destinatários". A 197 **não**
  é pré-requisito.
- **ADR-0057.** A 195 implementa o §1, o §3, o §4 e o §6. A ADR-0080 emenda o Contexto item 1 e os §2,
  §3, §4 e §5.
- **067/068 (canais).** O relato do motorista é `driver_app`. O pino do escritório é `backoffice`, e
  não `office`: `office` é "em nome do motorista" e o banco exige `on_behalf_of_driver_id`
  (`trip_stop_occurrences_office_driver_check`, ADR-0067 §2). `backoffice` é a ação da tela do
  escritório que não é em nome do motorista (ADR-0068 §3), que é o caso aqui.
- **082 evidence §1 (as três saídas).** A escolha é a primeira saída, no catálogo da parada. O risco
  de "duas portas" para o mesmo fato é contido por desenho: `wrong_address` **não aparece** em nenhum "Deu
  problema" nem na lista de tipos do diálogo "em nome de". Ele tem botão próprio no app e fluxo próprio,
  com mapa, no painel.
- **073/080.** A chave da parada é `cidade|CEP|número` (`buildStopAddressKey`), montada a partir do
  destino físico. Ela **não tem logradouro**, e isso é o que obriga a regra de ambiguidade (M1).
- **157/164/167.** `wrong_address` **não** vira tipo cadastrado da empresa (157) e não abre tratativa
  (164). Usa a **permissão** da tratativa (`occurrences.resolve`, 164 D7). A correção do relato (167)
  continua fora.
- **158/180.** A linha do tempo já projeta `stop.occurrence`, e com a 196 ela mostra o ponto. A 195
  acrescenta só o rótulo e o estado da sugestão, sem tipo novo de item.
- **192/193/194/196/197.** Mexem agora no mesmo `DriverStopCard`, na fila, no `useDriverTrip` e nos
  locales. A 195 põe a folha em arquivo próprio para o card ganhar só um botão.

## Fora do escopo

- **Corrigir o texto do endereço** (rua, número, CEP) direto na nossa base. A nota é documento fiscal
  recebido (ADR-0057, alternativas), e o texto se corrige na origem, pela 150.
- **Aplicar sem uma decisão humana** (ADR-0080 §1), e **aplicar chave ambígua** (ADR-0080 §3.3).
- **Reabrir uma sugestão aplicada.** Desfazer é outra correção (ADR-0080 §8).
- **Corrigir por (cliente, endereço).** Depende da 084 T3b e T1c.
- **Recalcular a rota da viagem em curso por causa da correção** (ADR-0080 §4).
- **Isolar `geocoded_addresses` por empresa.** A 084 T1d continua aberta para `contractor`.
- **O carimbo em si** (colunas, estado, expurgo). É da 196.
- **Foto na ocorrência de parada genérica** ("Deu problema"), e foto no pino do escritório.
- **"Em nome do motorista" com `wrong_address`.** O escritório registra como ele mesmo (`backoffice`),
  e não pelo motorista.
- **Rastreamento.** A leitura é pontual (`getCurrentPosition`), nunca `watchPosition`, e não depende do
  consentimento de posição ao vivo (ADR-0075 §8).

### Pendências achadas nesta leitura (2026-09-25)

- `GET /me/trips/current` lê `trip_stops.latitude/longitude`, colunas que nunca são escritas, e por
  isso a distância da parada no app do motorista é sempre vazia. **Confirmado** e já tratado por outra
  sessão ("Fix driver app stop distance always empty").
- O mesmo defeito existe em `drizzle-delivery-proof.repository.ts:215-216`: a pontualidade do canhoto lê
  `stopLatitude`/`stopLongitude` de `trip_stops`, que são sempre nulas. Não está coberto por nenhuma spec.
- O `PATCH /geocoded-addresses` ("Ajustar no mapa") está sob `trip.manage`, que o **separador** tem, e não
  passa pela regra de chave ambígua. Um separador consegue mover a coordenada de um endereço direto. A
  195 não muda essa rota (é da 084), mas o risco é o mesmo que a 164 D7 e a ADR-0067 evitaram em outros
  lugares. Registrar como item próprio: levar a rota para `occurrences.resolve` e aplicar a ela a regra
  de ambiguidade.

## Histórias priorizadas

### P1 — O motorista diz que o endereço está errado, sem parar a entrega

**Given** o motorista numa parada da viagem ativa (`dispatched`/`in_transit`/`on_delivery_route`) ou
concluída há menos de 24 h, antes ou depois de entregar
**When** ele toca "Endereço incorreto" no card da parada
**Then** a folha abre e a leitura de posição começa na hora ("Procurando sua posição…" → "Ponto
capturado (±12 m)" ou "Sem posição — vai sem ponto"). Se ele demorar, a folha mostra a idade da leitura
("ponto de há 2 min — Atualizar"). Ele pode escrever uma observação ("o número certo é 120", "entrada
pelos fundos") e tirar ou anexar uma foto. "Enviar" grava o relato na fila da app com `Idempotency-Key`:

- leitura com até 30 s vai no item;
- leitura mais velha que 30 s é refeita no toque, e o item fica **não drenável** até a leitura nova
  resolver ou passarem 8 s. Assim o ponto é o do momento do envio, e não o de quando a folha abriu.

O card passa a dizer "Correção na fila" e depois "Correção enviada às 14:02", e isso sobrevive a
recarregar a página. Os botões de entrega continuam disponíveis o tempo todo.

A folha diz, em uma linha, **quando** tocar: _"Toque quando estiver na porta certa — o ponto de agora
vai como sugestão do lugar certo."_

### P2 — O escritório vê a sugestão com o mapa e decide

**Given** uma sugestão com ponto (carimbo `captured` do motorista, ou pino do escritório)
**When** o operador abre Ocorrências (`/ocorrencias`), a linha do tempo da viagem ou o aviso do sino
**Then** a linha diz **Correção de endereço · Pendente**, com a origem ("pelo motorista" ou "pelo
escritório"), e o aviso abre direto o detalhe. O detalhe mostra:

- o mapa com os dois marcadores (endereço atual e ponto proposto, com o círculo de precisão quando o
  ponto é do GPS do motorista) e a distância entre eles;
- a precisão, a hora da leitura, a observação e a foto, quando houver;
- "esta chave serve N destinatários" e, quando for o caso, "esta chave junta N logradouros".

Quem tem `occurrences.resolve` vê **"Usar este ponto"** e **"Descartar"**.

**When** ele confirma "Usar este ponto" numa chave não ambígua
**Then** a coordenada da chave passa a ser o ponto (`rooftop`, `manual`), com trilha na origem certa
(`driver` ou `operator`) em nome de quem aplicou. A sugestão fica **Aplicada por Fulano em 25/09
14:02**, e o mapa da viagem já mostra o pino novo. Uma linha avisa que a rota planejada desta viagem
não é recalculada por esta correção.

### P2b — O relato sem ponto também chega

**Given** o motorista negou a localização, ou o aparelho não fixou posição em 8 s
(`location_state = 'unavailable'`)
**When** ele envia
**Then** o relato é gravado. No painel, a linha diz "Sem ponto do motorista", "Usar este ponto" não
aparece e restam "Descartar" e o caminho da 150 (P3).

### P2c — Chave ambígua vai para o mapa ou para a contratante

**Given** uma sugestão numa chave `S/N`, ou numa chave em que a empresa tem mais de um logradouro
**When** o operador abre o detalhe
**Then** "Usar este ponto" fica desabilitado com o motivo ("esta chave junta 3 ruas — o ponto de uma
corrigiria as outras"), e a saída oferecida é "Pedir correção do cadastro à contratante" (150).

### P3 — O relato vira motivo do pedido à contratante (150)

**Given** uma correção de endereço, aplicada ou não
**When** o operador com `settings.manage` escolhe "Pedir correção do cadastro à contratante"
**Then** abre o rascunho da 150 para aquela chave, com o motivo **"o motorista relatou endereço
incorreto a 1,2 km do pino"** (ou "o escritório marcou o endereço a 1,2 km do pino"). O relatório de
endereços (084 P2/P4) passa a listar a chave com o sinal `driver_report`. O resto é a 150, sem mudança.

### P4 — O escritório marca o lugar certo no mapa

**Given** um operador com `occurrences.resolve` no detalhe da viagem (qualquer estado) ou no diálogo
"Registrar ocorrência" da parada
**When** ele escolhe "Endereço incorreto" numa parada
**Then** abre o mapa do "Ajustar no mapa", com o pino no endereço atual. Ele arrasta o pino para o lugar
certo, escreve uma observação opcional ("cliente ligou: é na rua de trás") e toca "Registrar
correção". Nasce a ocorrência `wrong_address` com o canal `backoffice` e a sugestão com origem
`office_pin`, e ela aparece em Ocorrências como qualquer outra. Ele mesmo pode aplicá-la em seguida,
pelo detalhe, e a trilha diz "registrada e aplicada por Fulano" (ADR-0080 §6.2).

Se a chave for ambígua, o mapa avisa **antes** de ele arrastar ("esta chave junta 3 ruas — a correção
não poderá ser aplicada; peça à contratante"). Ele pode registrar mesmo assim, e o relato vale como
motivo da 150.

### P5 — Uma sugestão descartada pode voltar

**Given** uma sugestão descartada
**When** um operador com `occurrences.resolve` escolhe "Reabrir"
**Then** ela volta a **Pendente**, com a marca "reaberta por Fulano em 25/09 15:10" no detalhe, e pode
ser aplicada ou descartada de novo. Uma sugestão **aplicada** não mostra "Reabrir": ela já moveu a
coordenada, e desfazer é registrar outra correção.

## Requisitos funcionais

**Campo (app do motorista, `apps/frontend-driver`)**

- **RF1** — Botão próprio "Endereço incorreto" no card da parada, com ícone e alvo ≥ 44 px, fora do "Deu
  problema". `wrong_address` entra na cópia `DRIVER_OCCURRENCE_KINDS` (paridade com a API), e o "Deu
  problema" passa a usar `DRIVER_PROBLEM_KINDS`, sem ele.
- **RF2** — A leitura começa **ao abrir a folha** (`readCurrentLocation`: `getCurrentPosition`,
  `enableHighAccuracy`, `maximumAge: 0`, 8 s). A folha mostra o estado e a idade da leitura e oferece
  "Atualizar". Leitura que falha não bloqueia nada.
- **RF3** — **O ponto é o do momento do envio.** No "Enviar", uma leitura com mais de 30 s
  (`ADDRESS_REPORT_MAX_LOCATION_AGE_MS`) é refeita. O item entra na fila com `location: null` e
  `awaitingLocationUntil = agora + 8 s`, e a drenagem não o envia antes de a leitura resolver ou o
  prazo passar. A leitura completa o item pela chave (`applyReportLocation`).
- **RF4** — Observação opcional de até 500 caracteres. A foto é opcional, com "Tirar foto"
  (`capture="environment"`) e "Anexar", no padrão `FilePickerButton` do comprovante, com miniatura e
  "Refazer". A foto é reencodada em JPEG **sem EXIF** (`reduceOccurrencePhotoToJpeg`), porque o EXIF
  carrega GPS e modelo do aparelho.
- **RF5** — **O ponto nunca é recusado por causa da foto.** Se a foto estourar o teto de bytes da fila
  (`ATTACHMENT_QUEUE_LIMIT`), o relato entra **sem a foto** e a folha diz "a foto não coube na fila; a
  correção foi enviada sem ela". Isso é o contrário do "Não entreguei" (`useDriverTrip.hook.ts:450-458`,
  que recusa tudo), e é de propósito: aqui o conteúdo é o ponto.
- **RF6** — O relato é um item novo da fila (`kind: 'stopAddressReport'`) com chave gerada no toque,
  dono (`subHash`) e o campo `location`. O `send` sobe a foto por URL assinada (rota de upload **da
  parada**), confirma e só então faz o `POST` com `attachmentObjectId`, na mesma ordem da ocorrência de
  nota (179 T303).
- **RF7** — **"Correção enviada" vem do servidor**, não da sessão. `sentReportKeys`
  (`useDriverTrip.hook.ts:143-144`) é da sessão e some ao recarregar. O card lê "na fila" pela fila e
  "enviada às HH:MM" pelo `addressReportedAt` da parada no `GET /me/trips/current` (RF15).
- **RF8** — Relatar não muda o estado da parada, da nota nem da viagem. Mais de um relato na mesma
  parada é permitido, e cada toque é um fato.

**API (`apps/api-transportada`)**

- **RF9** — `TRIP_STOP_OCCURRENCE_KINDS` ganha `wrong_address`, e o CHECK do banco acompanha.
  `POST /me/trips/current/stops/:stopId/occurrences` (`trip.report`, só a viagem do motorista via `/me`,
  `Idempotency-Key` obrigatório; `me-trip.routes.ts:571-619`) já recebe `location` pela 196. A 195
  acrescenta `attachmentObjectId` ao schema `.strict()` (`me-trip.schema.ts:42-53`), aceito **só** em
  `wrong_address`. Em outro tipo, responde `400` com `details[attachmentObjectId]`. O objeto tem de ser
  um upload confirmado da mesma viagem e do mesmo motorista. A fiação em `main.ts:3078` e `:3134`, que
  hoje passa `attachmentObjectId: null` fixo, passa a repassar o valor.
- **RF10** — **Viagem concluída há pouco ainda recebe o relato do motorista.** `findStopForDriver` só
  aceita `TRIP_ON_ROAD_STATUSES` (`drizzle-driver-field-report.repository.ts:163-192`). Para
  `wrong_address`, aceita também viagem `completed` até **24 h** depois da conclusão (a hora do
  `trip_status_events` que a levou a `completed`, ou `trips.closed_at` quando o escritório encerrou).
  Os outros tipos não mudam.
- **RF11** — Para `wrong_address` do motorista, o servidor **ignora** `distanceMeters` do cliente e
  calcula a distância ele mesmo: haversine entre o carimbo e o pino atual de `geocoded_addresses` para a
  chave da parada. O resultado vai para `reported_distance_meters`, e `null` significa "não aferida". Na
  mesma transação da ocorrência e da chave de idempotência, grava a sugestão (`origin = 'driver_stamp'`,
  `pending`, `stop_id`, chave da parada e **fotografia do pino**). O reenvio devolve o mesmo recurso.
- **RF12** — `POST /me/trips/current/stops/:stopId/occurrence-uploads` e `.../:uploadId/confirm` são a
  URL assinada da foto, reaproveitando `create/confirm-occurrence-upload` (escopo viagem + motorista),
  com a mesma janela de 24 h da RF10. Entram na lista de exceções "anexos" do inventário da 196.
- **RF13** — `GET /trip-occurrences/:id/location-suggestion` (`fleet.read`, a política do feed; ver
  ADR-0080 §7) devolve:
  - a origem (`driver_stamp` | `office_pin`), o pino atual e a fotografia do pino;
  - o ponto proposto: para `driver_stamp`, **lido do carimbo da ocorrência**, com o `locationState`
    (`captured`/`unavailable`/`expired`), a precisão e a hora da leitura; para `office_pin`, o pino
    arrastado, sem precisão;
  - a distância, a observação e a URL de leitura da foto (vida curta, ou `null`);
  - o estado, quem registrou, quem decidiu e quando, e a última reabertura (quem e quando);
  - `pinChangedSinceReport`, `otherPendingCount`, `recipientCount` e `streetCount`, mais `ambiguity`
    (`null` | `no_number` | `multiple_streets`).

  Escopo por empresa, por escrito:
  - `otherPendingCount` conta sugestões `pending` da **mesma empresa** e da mesma chave;
  - `recipientCount` e `streetCount` contam só notas e paradas da **mesma empresa**;
  - `pinChangedSinceReport` lê a sugestão pela empresa e o pino atual de `geocoded_addresses` pela
    chave. Essa tabela não tem tenant (ADR-0044), e é a mesma leitura que o mapa da viagem já faz.

- **RF14** — `PATCH /trip-occurrences/:id/location-suggestion` com
  `{ status: 'applied' | 'dismissed' | 'pending' }`, sob `occurrences.resolve` e com limitador próprio
  (Postgres, 300 s, 120 requisições, no molde de `occurrence-case.routes.ts:46-51`):

  | de ↓ / para → | `applied`                     | `dismissed`      | `pending` (reabrir)           |
  | ------------- | ----------------------------- | ---------------- | ----------------------------- |
  | `pending`     | aplica (ou `422` pelo motivo) | descarta         | `200` sem efeito              |
  | `dismissed`   | `409`                         | `200` sem efeito | **reabre**                    |
  | `applied`     | `200` sem efeito              | `409`            | `409` (aplicada nunca reabre) |
  - `applied` grava a coordenada pelo upsert da 084 com `origin` da trilha `driver` (sugestão
    `driver_stamp`) ou `operator` (sugestão `office_pin`), e ator = quem aplicou. Na mesma transação
    marca a sugestão, liga a linha de `geocoded_address_corrections` (id devolvido pelo upsert) e grava
    `audit_logs`;
  - `422` com código por motivo: `…_WITHOUT_POINT` (carimbo `unavailable`/`expired`),
    `…_POINT_TOO_IMPRECISE` (GPS com mais de 100 m; não vale para `office_pin`), `…_AMBIGUOUS_KEY`
    (chave `S/N` ou mais de um logradouro, vale para as duas origens);
  - reabrir limpa `decided_*`, grava `last_reopened_by_user_id`/`last_reopened_at` e um `audit_logs`
    `stop_location_suggestion.reopened` com ator e horário;
  - o `409` é `STOP_LOCATION_SUGGESTION_ALREADY_DECIDED`;
  - id de outra empresa responde igual a inexistente: `404 STOP_LOCATION_SUGGESTION_NOT_FOUND`.

- **RF15** — `GET /me/trips/current` ganha, por parada, `addressReportedAt` (a hora do último
  `wrong_address` **deste motorista** naquela parada, ou `null`). É só uma hora, sem coordenada e sem
  estado da decisão.
- **RF16** — O feed `GET /trip-occurrences` inclui `addressSuggestionStatus` e `addressSuggestionOrigin`
  nos itens `wrong_address`, **sem coordenada** (ADR-0081 §6). O estado exibido é um de cinco, mutuamente
  exclusivos, e o filtro multivalor `addressSuggestionStatusIn` usa os mesmos cinco:

  | valor           | regra                                                                    |
  | --------------- | ------------------------------------------------------------------------ |
  | `pending`       | `status = 'pending'` e (origem `office_pin` ou carimbo `captured`)       |
  | `without_point` | `status = 'pending'`, origem `driver_stamp` e carimbo `unavailable`/nulo |
  | `point_expired` | `status = 'pending'`, origem `driver_stamp` e carimbo `expired`          |
  | `applied`       | `status = 'applied'`                                                     |
  | `dismissed`     | `status = 'dismissed'`                                                   |

  **A reaberta é `pending`**, e não um sexto estado: para quem filtra, ela está esperando decisão como
  qualquer outra. A marca "reaberta" aparece no selo como subtexto e no detalhe (RF19). A linha do
  tempo inclui o mesmo valor no item `stop.occurrence`.

- **RF17** — O aviso usa o catálogo: template `trip.occurrence-wrong-address` (caixa de entrada e
  e-mail, categoria `trip`), sem PII, com a cópia do worker em paridade, e com **deep link** para o
  detalhe (`/ocorrencias?ocorrencia=<id>`). Dispara para as duas origens. O link vai pelo campo de ação
  do pacote de notificação, se ele tiver um. Se não tiver, vai como marcador `occurrenceLink` só neste
  template, e o contrato de marcadores (`stop-notification.contract.ts`) é emendado para esta chave.
- **RF18** — A rota "em nome do motorista" (`OFFICE_STOP_OCCURRENCES_PATH` em
  `trip-field-office-trip.routes.ts`, `trip.report-on-behalf`, canal `office`) **continua recusando**
  `wrong_address`, com `400` e `details[kind]`. O escritório registra pela RF23, como ele mesmo.

**Escritório registra (resposta (c))**

- **RF23** — `POST /trips/:tripId/stops/:stopId/location-suggestions`, sob `occurrences.resolve`
  (ADR-0080 §6.1), com `Idempotency-Key` obrigatório e o mesmo limitador da RF14. Corpo `.strict()`:
  `{ proposedLatitude, proposedLongitude, description? }`, com faixas -90..90 e -180..180 e
  observação de até 500 caracteres. Na mesma transação, grava:
  - a ocorrência `wrong_address` com canal `backoffice`, ator = o operador, sem `on_behalf_of_driver_id` e
    sem carimbo (ADR-0081 §3: só `driver_app` tem ponto de pessoa);
  - a sugestão com `origin = 'office_pin'`, `proposed_latitude`/`proposed_longitude`, `stop_id`, chave
    e fotografia do pino;
  - a distância entre o pino proposto e o atual em `reported_distance_meters`;
  - a chave de idempotência.

  Vale para parada de viagem em qualquer estado, porque a correção é do endereço e não da viagem. A
  parada tem de ser da empresa do token (`404` igual a inexistente).

- **RF24** — **Precisão e ambiguidade no pino do escritório.** O pino arrastado não tem `accuracy`, e
  a regra dos 100 m **não se aplica** a ele: é um humano pondo o ponto onde sabe que é, e a precisão
  de um GPS não mede isso. A regra de chave ambígua **se aplica igual**, porque é sobre a chave e não
  sobre o ponto. O `POST` aceita chave ambígua e devolve `ambiguity` na resposta; o `PATCH applied`
  recusa com `422 …_AMBIGUOUS_KEY`.
- **RF25** — **Autoaplicação permitida, e visível.** Quem registrou um `office_pin` pode aplicá-lo
  (ADR-0080 §6.2). O `audit_logs` do `applied` leva `selfApplied: true` quando o ator é o mesmo que
  registrou, e o detalhe diz "registrada e aplicada por Fulano".

**Painel (`apps/frontend-transportada`)**

- **RF19** — Em Ocorrências, `wrong_address` aparece como "Correção de endereço", com a origem ("pelo
  motorista" / "pelo escritório"), o selo do estado (os cinco da RF16, com o subtexto "reaberta" quando
  for o caso) e o filtro multivalor na query string. `/ocorrencias?ocorrencia=<id>` abre o detalhe
  direto (deep link do sino). "Detalhar" abre o painel de sugestão (`useRevealedPanel`), com:
  - o mapa (o que a 196 T6.2 criar para a linha do tempo, se já existir; senão o primitivo MapLibre de
    `TripRouteMap`/`AssemblyVectorMap`), dois marcadores e a linha tracejada;
  - a distância, a precisão, a observação, a foto (`OccurrenceAttachmentGrid`), as contagens da RF13 e
    a trilha de quem registrou, decidiu e reabriu.
- **RF20** — As ações seguem `occurrences.resolve`, e sem ela o painel é só leitura:
  - "Usar este ponto" pede confirmação e diz o efeito: _"o endereço passa a apontar para este ponto nas
    próximas viagens, para os N destinatários desta chave; a rota planejada desta viagem não é
    recalculada por esta correção"_;
  - com precisão acima de 100 m (só no GPS do motorista) ou chave ambígua, o botão fica desabilitado com
    o motivo, e aparecem "Ajustar no mapa" (só para precisão) e o caminho da 150;
  - "Descartar" em `pending`; "Reabrir" em `dismissed`; nada disso em `applied`.
- **RF21** — Na linha do tempo da viagem e na lista de ocorrências do detalhe da viagem
  (`TripOccurrences`), o rótulo é "Correção de endereço", com a origem, o estado e o link para o detalhe.
- **RF22** — Coerência das listas de tipos, nas três telas que oferecem tipo de parada:

  | lista                                                                                                | oferece `wrong_address`?                                                                                          |
  | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | `DRIVER_PROBLEM_KINDS` (app novo) — "Deu problema"                                                   | não; o motorista tem o botão próprio                                                                              |
  | `DRIVER_PROBLEM_KINDS` (módulo legado do painel, `DriverStopCard.component.tsx:600`)                 | não                                                                                                               |
  | `OFFICE_STOP_OCCURRENCE_KINDS` (chips do `TripStopOccurrenceDialog.component.tsx:107`, "em nome de") | não nos chips; o diálogo ganha a entrada separada "Endereço incorreto — marcar no mapa", que abre o fluxo da RF26 |
  | `STOP_OCCURRENCE_KINDS` (`trip.types.ts:871`)                                                        | sim; é a cópia de paridade, usada para rótulo                                                                     |

- **RF26** — **O fluxo do pino no painel.** "Endereço incorreto" aparece na linha de cada parada do
  detalhe da viagem, ao lado das ações da parada, e como entrada separada no diálogo "Registrar
  ocorrência" da parada. Os dois abrem o mesmo diálogo de mapa:
  - reusa a interação de arrastar pino do "Ajustar no mapa" (detalhe da viagem, "corrigir / salvar /
    cancelar no mapa", 080 T006), que hoje chama `PATCH /geocoded-addresses`
    (`tripClient.service.ts:766`). Aqui a mesma interação envia para a RF23;
  - começa no pino atual (ou no centro do município, sem pino) e mostra a distância enquanto arrasta;
  - avisa antes de arrastar quando a chave é ambígua;
  - "Registrar correção" grava e abre o detalhe da sugestão, onde está "Usar este ponto";
  - só aparece com `occurrences.resolve`.

## Requisitos não funcionais

- **RNF1 — LGPD.**
  - O ponto do motorista é o carimbo da ocorrência, com as regras da 196/ADR-0081: nunca em log e
    retenção de **90 dias** pelo expurgo único (`trip.location.purge`).
  - A tabela da sugestão **não guarda coordenada de pessoa**. `proposed_latitude`/`proposed_longitude` só
    existem com `origin = 'office_pin'` (CHECK), e são um ponto posto por um humano no mapa, que não é
    posição de ninguém. Por isso ficam fora do expurgo do carimbo. Um contrato por nome de coluna reprova
    qualquer outra coordenada na tabela.
  - A sugestão pendente cujo carimbo expirou vira "Ponto expirado" e não pode mais ser aplicada.
  - O ponto **aplicado** passa a ser coordenada do endereço, dado de cadastro que não expira (ADR-0080
    §5).
  - O `audit_logs` guarda ids, a chave, as precisões, a distância, a origem e `selfApplied`, **nunca
    coordenadas**.
  - A foto da fachada é apagada **90 dias depois da decisão**, ou 90 dias depois do relato se ainda
    estiver pendente (ADR-0080 §5), e não 5 anos. Reabrir não ressuscita foto já apagada.
- **RNF2 — Isolamento.** `companyId` vem do token. Toda junção nova é escopada por `company_id`, com os
  contratos `test/trip-schema/tenant-safety.contract.ts`,
  `test/trip-schema/occurrence-feed-query-tenant-safety.contract.ts` e
  `test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`.
- **RNF3 — Migration aditiva** com `rollback.sql`, `snapshot.json` e asserção
  `test/database-migration/stop-location-suggestion-rollback.assertion.ts` (molde:
  `driver-allowance-rollback.assertion.ts`). O rollback **recusa** (via `RAISE`) quando já existe
  ocorrência `wrong_address`, em vez de apagar dado.
- **RNF4 — Offline.** O relato do motorista funciona sem rede, como o resto da fila: sem Background
  Sync, drenagem pelos gatilhos existentes.
- **RNF5 — Custo.** Nenhum provedor pago é chamado.

## Casos extremos e falhas

| caso                                                       | comportamento                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Permissão de localização negada                            | relato com `unavailable` (emenda à ADR-0057 §2); a app diz "sem ponto"                                                     |
| Folha aberta há 2 min                                      | a folha mostra "ponto de há 2 min — Atualizar"; o "Enviar" relê e o item só drena com a leitura nova ou depois de 8 s      |
| Chave `S/N`, ou chave com mais de um logradouro na empresa | `422 …_AMBIGUOUS_KEY` nas duas origens; o detalhe explica e oferece a 150                                                  |
| Última parada: a viagem fecha antes de a fila drenar       | aceito até 24 h depois da conclusão (RF10); depois disso, item recusado com a causa                                        |
| Foto acima do teto de bytes da fila                        | o relato entra sem a foto e a folha diz isso; o ponto nunca é recusado                                                     |
| Parada sem pino (`geocoded_addresses` sem a chave)         | distância "não aferida"; o mapa do escritório começa no centro do município; aplicar **cria** a coordenada                 |
| Duas sugestões pendentes para a mesma chave                | as duas ficam; o detalhe conta "mais 1 pendente"; depois de aplicar uma, a outra mostra "o pino mudou depois deste relato" |
| Pino corrigido por outro caminho depois do relato          | o detalhe compara pino atual × fotografia e avisa; aplicar continua possível                                               |
| A chave serve mais de um destinatário (197)                | aplicar corrige todos; o detalhe e a confirmação dizem quantos                                                             |
| Geocodificação em lote depois de aplicar                   | não desfaz: o upsert do worker não sobrescreve `source = 'manual'`                                                         |
| Viagem concluída antes da decisão                          | a decisão continua possível; afeta só viagens futuras                                                                      |
| Mesmo toque reenviado (fila ou duplo clique no painel)     | mesma resposta, nenhuma segunda linha (`trip_field_reports`)                                                               |
| Operador aplica o próprio pino                             | permitido; `selfApplied: true` no audit e "registrada e aplicada por" no detalhe                                           |
| Reabrir uma descartada cujo carimbo expirou                | reabre como "Ponto expirado"; só pode ser descartada de novo ou virar motivo da 150                                        |
| Reabrir uma aplicada                                       | `409`; desfazer é registrar outra correção                                                                                 |
| Carimbo expirado (90 dias) com sugestão pendente           | "Ponto expirado"; `422 …_WITHOUT_POINT` ao aplicar                                                                         |
| Recarregar a página depois de a correção drenar            | o card continua dizendo "Correção enviada às HH:MM" (`addressReportedAt`)                                                  |

## Critérios de aceite

- **CA1** — Contrato: `POST .../occurrences` com `wrong_address` e `location` grava ocorrência com
  carimbo `captured` + sugestão `driver_stamp` `pending` com `stop_id` + fotografia do pino + distância
  calculada pelo servidor. O `distanceMeters` enviado pelo cliente é ignorado.
- **CA2** — Contrato: com `location: null`, grava `unavailable`, sugestão `pending` e distância `null`.
  `attachmentObjectId` em `long_wait` responde `400` com `details[attachmentObjectId]`; upload de outra
  viagem responde como inexistente.
- **CA3** — Contrato: o reenvio com a mesma `Idempotency-Key` devolve o mesmo id, e existe uma linha só
  em cada tabela (vale para a rota do motorista e para a RF23).
- **CA4** — Integração (Postgres): `PATCH applied` escreve `geocoded_addresses` com `rooftop` e
  `source = 'manual'`, uma linha em `geocoded_address_corrections` com a origem certa (`driver` para
  `driver_stamp`, `operator` para `office_pin`) e `actor_user_id` = quem aplicou, a sugestão `applied`
  com o id devolvido pelo upsert e um `audit_logs` sem coordenada, **na mesma transação**. Uma falha
  injetada no audit desfaz tudo.
- **CA5** — Contrato, a tabela de transições da RF14 inteira:
  - `applied → applied`, `dismissed → dismissed` e `pending → pending` dão `200` sem segunda trilha nem
    segundo audit;
  - `applied → dismissed`, `applied → pending` e `dismissed → applied` dão `409`;
  - `dismissed → pending` reabre, limpa `decided_*` e grava `last_reopened_*` e o audit
    `stop_location_suggestion.reopened` com ator e horário;
  - `unavailable`/`expired`, GPS com mais de 100 m e chave ambígua dão `422` com o código do motivo;
  - id de outra empresa dá `404`; sem `occurrences.resolve`, `403`; o limitador responde `429` com
    `Retry-After`.
- **CA6** — `tenant-safety`: o feed, o detalhe, as contagens, o `PATCH` e a RF23 não alcançam nem contam
  sugestão, nota ou parada de outra empresa.
- **CA7** — Contrato por **nome de coluna**: `trip_stop_location_suggestions` não tem coluna cujo nome
  case `latitude|longitude|accuracy|captured_at` além de `pin_latitude`/`pin_longitude` e
  `proposed_latitude`/`proposed_longitude`. O CHECK garante `proposed_*` preenchidas ⇔
  `origin = 'office_pin'`. O D8 da 196 segue verde sem a tabela na lista. Integração: depois do expurgo,
  o detalhe diz "Ponto expirado" e o `PATCH applied` dá `422`.
- **CA8** — App e painel: nenhum "Deu problema" (app novo e módulo legado) e nenhum chip do diálogo "em
  nome de" oferece `wrong_address`; o diálogo tem a entrada separada "Endereço incorreto — marcar no
  mapa". A paridade de catálogo com a API continua verde nas duas apps. O item `stopAddressReport` drena
  com upload → confirmação → `POST`, nessa ordem.
- **CA9** — App, com **relógio falso**: leitura de 20 s vai no item; leitura de 40 s é refeita no
  "Enviar", e o item fica fora da drenagem até a leitura nova completar `location` ou até 8 s. Com
  geolocalização recusada, o item drena com `location: null` depois dos 8 s, e a tela diz "sem ponto".
- **CA10** — App: com a foto estourando o teto de bytes, o relato entra sem a foto, com o aviso na
  folha, e o `POST` sai com `attachmentObjectId: null`.
- **CA11** — API: `wrong_address` do motorista numa parada de viagem `completed` há 23 h é aceito; há
  25 h responde como parada inexistente; `long_wait` na mesma viagem concluída continua recusado.
- **CA12** — **Chave ambígua:** com a chave `…|S/N`, o `PATCH applied` dá `422 …_AMBIGUOUS_KEY`, para
  `driver_stamp` e para `office_pin`. Com duas notas da empresa na mesma chave e logradouros canônicos
  diferentes, também dá; com logradouros que canonicalizam igual (`R DR MATTA` / `RUA DR. MATTA`),
  aplica. O detalhe devolve `streetCount` e `ambiguity`, e o painel desabilita o botão com o motivo.
- **CA13** — Card: depois de drenar e recarregar a página, "Correção enviada às HH:MM" continua, lido de
  `addressReportedAt`.
- **CA14** — Sino: o relato (das duas origens) gera o aviso `trip.occurrence-wrong-address` para quem
  assina a categoria `trip`. O link do aviso abre `/ocorrencias?ocorrencia=<id>` com o detalhe aberto.
- **CA15** — Painel: a linha "Correção de endereço · Pendente" abre o detalhe com dois marcadores, a
  distância e as contagens. Sem `occurrences.resolve` não há ações. A confirmação diz o efeito com o
  número de destinatários. O feed não carrega coordenada. O filtro pelos cinco estados reflete na query
  string, e uma reaberta aparece em `pending` com o subtexto "reaberta".
- **CA16** — Revisão de design com print:
  - app em 375 e 768: card com o botão; folha com ponto, sem ponto e com "ponto de há 2 min"; estado
    "Correção enviada";
  - painel em desktop: linha, detalhe pendente, detalhe ambíguo, detalhe aplicado, detalhe reaberto e o
    diálogo de mapa do escritório.

  Tudo visto **primeiro no preview local** e só publicado depois de o usuário ver.

- **CA17** — `make migration-test` verde, com a asserção de rollback recusando quando existe
  `wrong_address`.
- **CA18** — Foto: a de uma sugestão decidida há 91 dias é apagada, a de uma decidida há 89 dias fica,
  e a de uma pendente há 91 dias é apagada.
- **CA19** — **Pino do escritório** (contrato + integração):
  - a RF23 grava ocorrência com canal `backoffice`, sem `on_behalf_of_driver_id` e sem carimbo, e
    sugestão `office_pin` com `proposed_*` e distância;
  - sem `occurrences.resolve` responde `403`, e o separador não alcança a rota
    (`separator-role.contract.test.ts`);
  - coordenada fora da faixa responde `400` com `details[]`; parada de outra empresa responde `404`;
  - o `PATCH applied` de um `office_pin` não verifica precisão, verifica a ambiguidade e grava a trilha
    com `origin = 'operator'`;
  - a rota "em nome de" continua recusando `wrong_address` (RF18).
- **CA20** — **Autoaplicação:** o mesmo operador registra e aplica um `office_pin`; o `200` vem com
  `selfApplied: true` no audit, e o detalhe diz "registrada e aplicada por Fulano". Um segundo operador
  aplicando grava `selfApplied: false`.
- **CA21** — Painel, fluxo do pino: "Endereço incorreto" na linha da parada e a entrada no diálogo
  "Registrar ocorrência" abrem o mesmo mapa, começando no pino atual; a chave ambígua é avisada antes
  de arrastar; "Registrar correção" abre o detalhe; nada aparece sem `occurrences.resolve`.

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` aberto: as quatro perguntas foram respondidas pelo usuário em 2026-09-25
(tabela "Decisões do usuário").

**Dependência de ordem:** a 195 roda depois das Fases 1 (colunas), 2 (expurgo) e 3 (API grava o ponto)
da spec 196, em `origin/staging`. Se elas não estiverem lá quando a Fase 1 começar, o executor **para e
pergunta**. A 197 não é pré-requisito: a T0.1 só registra se ela já está lá, para saber de onde sai a
contagem de destinatários.

Decisões que esta spec tomou sozinha, na ADR-0080, e que o usuário pode rever:

- o limite de precisão para aplicar o GPS do motorista: **100 m** (§3.2), sem valer para o pino do
  escritório (§6.3);
- a regra de chave ambígua: `S/N` ou mais de um logradouro canônico na empresa (§3.3), para as duas
  origens;
- o escritório registra com `occurrences.resolve` e canal `backoffice`, e não pela rota "em nome de"
  (§6.1);
- quem registrou um pino pode aplicá-lo (§6.2);
- a reaberta volta a "Pendente", com a marca "reaberta", e não é um sexto estado (§8);
- a rota planejada da viagem em curso **não é recalculada por esta correção** (§4);
- o detalhe da sugestão mostra o ponto fora da linha do tempo, como exceção nomeada à ADR-0081 §6 (§7);
- a foto da fachada fica 90 dias depois da decisão, e não 5 anos (§5);
- a janela de 24 h para o relato do motorista depois de a viagem fechar (RF10);
- a P3 (relato → motivo da 150) é a última fase e pode ser cortada sem afetar o resto.
