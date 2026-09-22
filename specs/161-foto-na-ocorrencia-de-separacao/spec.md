# Feature 161 — Foto na ocorrência de separação

## Problema e resultado

A ocorrência de galpão (etapa `separation`) é registrada por
`POST /trips/:id/documents/:documentId/occurrences`
(`apps/api-transportada/src/trips/presentation/trip.routes.ts:1242`, permissão `trip.manage`), cujo
corpo é JSON `.strict()` com `note`, `occurrenceTypeId` e `productCode`
(`src/trips/presentation/occurrence.schema.ts:14-22`). **Não aceita arquivo.** O conferente que
achou a caixa violada descreve o estrago por escrito, e a prova visual não existe — o produto hoje
até manda ele para outro lugar: `trip.locale.json:1048` diz "Precisa anexar foto? Registre a
ocorrência na nota", apontando para a ocorrência **de rua**, que é outro fato e outra etapa.

O mesmo registro também acontece pelo WhatsApp: o fluxo do operador termina em
`noteRouter` (`src/whatsapp-commands/application/register-operator-trip-flow-actions.ts:609-616`),
que chama o mesmo `registerTripOccurrence`. Hoje uma foto enviada na conversa **chega e é
persistida** em `messages.payload`, mas é descartada como resposta inválida porque
`extractWhatsAppAnswer` (`src/whatsapp-commands/domain/whatsapp-answer.policy.ts:7-13`) só lê
`interactive.button_reply.id`, `interactive.list_reply.id` e `text.body`.

A base já tem quase tudo: `trip_document_occurrences.attachment_object_id`
(`src/database/trip.schema.ts:1457`) e a FK composta para `stored_objects`; o upload multipart com
`Idempotency-Key`, rate limit, conferência de bytes e limpeza de objeto órfão em
`src/trips/presentation/trip-field-office-occurrence.routes.ts`; a captura por câmera com degradê
para arquivo em `FieldDeliveryCaptureStep.component.tsx`; e a grade de fotos com URL assinada em
`TripOccurrenceTable.component.tsx:66-111`.

Resultado: a ocorrência de galpão passa a **exigir pelo menos uma foto** — pela web e pelo WhatsApp —
e a aceitar **até cinco**, tiradas na hora pela câmera ou escolhidas do aparelho. As fotos aparecem
no painel da nota, no feed `/trip-occurrences` e na linha do tempo, e expiram cinco anos depois do
registro, por expurgo que apaga o objeto de verdade.

## Fora do escopo

- **A ocorrência de rua fica como está** (uma foto, opcional, gravada em `attachment_object_id` pelo
  lote do escritório e pelo app do motorista). Mexer nela obrigaria a mexer no PWA do motorista, que
  não é o problema desta feature.
- Backfill de foto em ocorrência antiga — não existe o que preencher.
- Migrar a ocorrência de rua para a tabela de anexos (follow-up, ver D6).
- Ocorrência de **parada** (`trip_stop_occurrences`), cuja coluna de anexo hoje é sempre `null`
  (`src/main.ts:2580,2634`).
- Edição ou remoção de foto depois da ocorrência gravada.
- Ingestão genérica de mídia do WhatsApp para outros fluxos (motorista, emissão) — esta spec liga o
  download só para a ocorrência de galpão do operador.
- Expurgo dos demais objetos do bucket (comprovante de entrega, anexo de agregado). A varredura
  nasce escopada ao purpose novo; ampliar é follow-up registrado em `docs/SECURITY.md`.

## Decisões

- **D1. A foto é obrigatória, no caso de uso.** `registerTripOccurrence` recusa ocorrência de
  `separation` sem anexo, com 422 `OCCURRENCE_PHOTO_REQUIRED`. A regra fica no caso de uso, e não na
  rota, porque os **dois** canais que registram ocorrência de galpão passam a mandar foto: a rota
  HTTP e o fluxo do operador no WhatsApp (D7).
- **D2. Várias fotos, teto de cinco.** A coluna atual guarda uma só; entra a tabela
  `trip_document_occurrence_attachments`. Cinco é o teto porque cada foto sai da câmera reduzida para
  ~900 KB (`fieldDeliveryImage.service.ts`) e cinco cobrem o que um conferente fotografa de uma caixa
  (rótulo, os dois lados do estrago, o palete, a etiqueta) sem virar álbum.
- **D3. Câmera ou arquivo.** O diálogo web oferece os dois, lado a lado, sempre — não é um fallback
  escondido atrás de erro.
- **D4. Câmera que falha não trava o registro.** Permissão negada, aparelho sem câmera ou erro de
  stream (`cameraStatus` `denied`/`unavailable` de `useCameraStream`) reduzem o diálogo a "escolher
  arquivo", com aviso de uma linha. O obrigatório é **ter foto**, não ter câmera funcionando — o
  aparelho ruim é o comum no galpão, e travar ali é perder justamente a ocorrência que interessa.
- **D5. Uma foto por requisição (web).** O teto de corpo da aplicação é 1 MiB
  (`APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`, `src/shared/api.constant.ts:180`) e o arquivo do
  escritório é limitado a 960 KiB (`OFFICE_PROOF_MAX_BYTES`): cinco fotos **não cabem** num multipart
  só. Em vez de subir o teto global (que afeta toda rota do produto), a criação leva a primeira foto
  e cada foto seguinte vai por `POST .../occurrences/:occurrenceId/attachments`. É o desenho do
  `FieldDeliveryWizard`, que já envia nota a nota com chave de idempotência por item e reenvia só o
  que falhou.
- **D6. A coluna `attachment_object_id` convive, sem ser escrita pelo galpão.** Ela continua sendo a
  fonte da ocorrência de rua na mesma tabela; o galpão grava só na tabela nova. A **leitura** é
  unificada em um ponto: se a ocorrência tem linhas na tabela de anexos, são elas; senão, a coluna
  vale como anexo único. Nenhuma tela precisa saber de qual etapa a ocorrência veio, e quando a spec
  de follow-up migrar a de rua (backfill `coluna → tabela` e `DROP COLUMN`), só o caminho de escrita
  do lote muda. Migrar junto agora custaria tocar `office-occurrence-batch.service.ts`, o app do
  motorista e o feed no mesmo commit.
- **D7. O WhatsApp passa a pedir a foto — e a capacidade de baixar já está na mão do handler.**
  Medido: o webhook recebe e persiste `message.image` (`whatsAppMessageSchema` aceita `image`, e
  `ReceiveWebhookUseCase.handleMessage` grava `extractPayload(message)` em `messages.payload`);
  `channel.fetchMediaAsBase64` é **campo do contrato do canal**, e **todo `FlowActionHandler` já
  recebe `channel`** — o router da foto baixa a mídia hoje, sem injetar nada. O token é o por
  empresa, selado em `whatsapp_channels.secret_envelope` e já aberto pelo resolver.
  - ⚠️ **Correção de uma versão anterior desta spec**, que afirmava "falta ligação, não capacidade" e
    propunha injetar `providers.objectStorage` para acender o `IngestInboundMediaUseCase` do pacote.
    É o inverso, e a injeção foi **descartada na validação de arquitetura**, por dois motivos
    medidos: (a) o `IngestInboundMediaUseCase` **não grava em `stored_objects`** — usa chave fixa do
    pacote (`meta-whatsapp/{companyId}/inbound/{mediaId}`), sem purpose, sem `retention_until` e sem
    sha256, de modo que RF2, RF3 e RNF1 seriam inalcançáveis por aquele caminho; (b) injetar o
    provider **acende caminhos hoje dormentes** no módulo inteiro — `sendMedia` passaria a subir
    binário, `DeleteConversation` e `PurgeExpiredDocuments` passariam a apagar bytes no bucket, e o
    nó de fluxo `send_media`, que hoje encerra em silêncio, passaria a enviar arquivo de verdade.
    Nada disso foi pedido por esta feature. `meta-whatsapp-module.resolver.ts:82-95` continua
    montando o módulo **sem** `providers`, e um contrato trava essa ausência (RF16).
- **D8. O fluxo do operador ganha um passo de foto, obrigatório, com desistência explícita.** Depois
  da observação (`operator_note_entry`), o fluxo pede a foto e espera uma imagem. Quem não puder
  mandar foto usa a opção "❌ Cancelar ocorrência" e nada é gravado — o fluxo **não** oferece
  "pular", porque pular seria burlar a D1 pelo canal mais fácil.
- **D15. Abandonar no passo da foto perde a ocorrência inteira — aceito, e dito ao operador.** Hoje
  o `noteRouter` (`register-operator-trip-flow-actions.ts:580-620`) grava assim que recebe a
  observação. Com a foto obrigatória **antes** da gravação, quem sair da conversa no passo da foto
  perde tipo e observação junto, e **não há TTL de sessão** que limpe ou recupere isso: o contexto
  fica na `sessions` até a próxima interação sobrescrevê-lo.
  - Aceito, porque a alternativa é pior: gravar a ocorrência antes da foto criaria exatamente o
    registro sem prova que a D1 existe para impedir, e "completar depois" exigiria uma ocorrência em
    estado inválido, visível nas três telas, esperando uma foto que talvez nunca venha.
  - Mitigação, que é requisito (RF18): a mensagem do passo **diz** que sem a foto nada será
    registrado, e o "❌ Cancelar ocorrência" é a saída limpa. O operador perde o que digitou, não
    uma ocorrência que ele pensava ter registrado.
- **D16. A mídia viaja por contexto, não pela assinatura de `extractWhatsAppAnswer`.** Devolver um
  objeto de mídia não compila: o `FlowInterpreter` do pacote tipa `userAnswer?: string` e o handler
  **não recebe a mensagem**. Então `extractWhatsAppAnswer` mantém `string | undefined`, e o
  despachante escreve o descritor da imagem numa chave de contexto ao montar o cursor
  (`whatsapp-command-driver.service.ts:222-229`); o router da foto lê e **apaga no mesmo turno**.
  - Consequência aceita: imagem enviada num nó de **escolha** continua sendo resposta inválida e
    conta para o handoff humano, como qualquer outra resposta fora das opções.
  - Segurança: o `media-id` é um **handle resgatável com o token da empresa** — vale como credencial
    de curta duração. Nunca entra em log, e sai do contexto no mesmo turno em que foi usado.
- **D9. Retenção de cinco anos, com expurgo que apaga de verdade.** Cinco anos é o horizonte da
  guarda fiscal do produto (CT-e/NF-e) e o prazo em que um sinistro ou uma discussão de avaria ainda
  pode ser reaberta — a foto da caixa violada é a prova dessa discussão, então guardá-la menos que o
  documento que ela contesta não faz sentido, e guardá-la para sempre é acúmulo de dado pessoal sem
  finalidade (LGPD, minimização). `stored_objects.retention_until` recebe `created_at + 5 anos` na
  gravação, e a rotina `trip.occurrence-attachment.purge` apaga o objeto no bucket, marca o
  `stored_objects` como `deleted` e remove a linha do anexo.
- **D10. Expurgo é rotina do worker, disparada pelo tique do cron** — o padrão do produto. O cron
  (`apps/cron-transportada`) não executa rotina nenhuma: ele lê `job_schedules` e publica envelope no
  RabbitMQ (`run-tick.ts`); quem executa é o worker (`rate-limit.window.purge` é o molde exato:
  lote + teto de lotes + parada por `isStopRequested` + log de ciclo). Inventar um processo novo
  seria a única parte do produto fora desse trilho.
- **D12. A miniatura nasce no navegador, no mesmo passo que limpa o EXIF.** Antes de enviar, o
  navegador reencoda a foto para JPEG — e é o reencode que descarta os metadados, inclusive a
  coordenada de GPS do aparelho do conferente — e gera a miniatura a partir do mesmo canvas. Sobem
  **dois** objetos ligados ao mesmo anexo: o **original**, que é a prova, e a **miniatura**, que é o
  que as listas carregam. Gerar no cliente evita biblioteca de imagem no servidor (decisão do
  usuário, ver D14) e paga o custo onde ele já existe: o reencode acontece de qualquer jeito, e o
  segundo `toBlob` é barato perto do upload.
  - **Miniatura**: JPEG, lado maior **320 px**, qualidade **0,7**, alvo ≤ 60 KB. 320 px cobre a
    maior miniatura que as telas desenham (8 rem de grade no feed, ~128 px, com folga para tela de
    2×), e 60 KB deixa uma ocorrência de cinco fotos abaixo de 300 KB na listagem — contra ~2,5 MB
    se a lista baixasse os originais.
  - **Original**: JPEG, lado maior **1600 px**, alvo ≤ 400 KB (ver D13). 1600 px lê etiqueta,
    lacre rompido e avaria de caixa; acima disso a foto pesa sem provar mais nada.
  - **Purposes separados**: `trip_occurrence_attachment` (original) e
    `trip_occurrence_thumbnail` (miniatura). Separar é o que permite ao expurgo e a qualquer
    política futura tratar os dois como o que são — prova e cache de leitura.
  - **Escolha na leitura**: lista (painel, feed, linha do tempo) usa `thumbnailUrl`; abrir a foto
    usa `downloadUrl`. Os dois são presigned de 5 min, gerados só na leitura de detalhe.
- **D13. O teto por arquivo cai para 512 KiB na web, e fica em 960 KiB no WhatsApp.** Com o
  reencode do D12 mirando 400 KB, 512 KiB é folga de ~25% sobre o alvo — suficiente para a foto que
  o degradê de qualidade não conseguiu apertar, e apertado o bastante para caber com sobra no corpo
  de 1 MiB junto dos campos do multipart. O teto do servidor existe para pegar cliente que **não**
  reencodou (script, cliente antigo, aba com JS quebrado), não para apertar o usuário — por isso ele
  fica acima do alvo, não colado nele. A mídia do WhatsApp não passa pelo navegador e mantém os
  960 KiB de `OFFICE_PROOF_MAX_BYTES`: é o que a Meta entrega depois da compressão dela, e baixar
  esse teto recusaria foto legítima de operador sem nenhum ganho de segurança.
- **D14. A foto do WhatsApp não tem miniatura nem limpeza de EXIF — risco assumido, escrito.** Ela
  chega pronta da Meta, sem passar por navegador nosso. Gerar miniatura ou apagar EXIF do lado de cá
  exigiria biblioteca de processamento de imagem no servidor, e o usuário decidiu **não** acrescentar
  essa dependência. Consequências aceitas, em vez de escondidas:
  - a foto de WhatsApp **preserva metadado de localização** do aparelho do operador, quando o
    aparelho grava isso e a Meta não remove;
  - a lista dela **cai para o original** (`thumbnailUrl` ausente → a tela usa `downloadUrl`), com
    `loading="lazy"` e só para a ocorrência aberta. Escolhi original em vez de selo porque a foto de
    WhatsApp já vem comprimida pela Meta e está limitada a 960 KiB (D13): o pior caso de uma
    ocorrência inteira é ~4,8 MB, alto mas não proibitivo, e um selo esconderia a prova justamente
    de quem registrou pelo canal mais pobre. Se a medição em produção mostrar lista pesada demais, a
    troca para selo é de uma linha na leitura.
  - **Caminho de saída, se a operação quiser uniformizar**: uma biblioteca de imagem no servidor
    (`sharp` ou equivalente) geraria miniatura e removeria EXIF para os dois canais. O custo é o que
    fez o usuário recusar agora: binário nativo na imagem do worker/API, compatibilidade com Bun a
    verificar, superfície de CVE de decodificador de imagem (histórico conhecido em libwebp/libjpeg),
    e CPU de processamento dentro da transação de request. Fica registrado como opção, com o custo,
    não como pendência.
- **D11. A ocorrência é append-only: foto expirada não apaga o fato.** O registro, a nota, o tipo e a
  autoria continuam intactos e legíveis para sempre. O que some é o arquivo. A leitura devolve o
  anexo com `expired: true` e **sem** `downloadUrl`, e a tela mostra um selo "foto expirada
  (retenção de 5 anos)" no lugar da miniatura — nunca uma imagem quebrada nem um espaço vazio que
  pareça defeito.

## Histórias priorizadas

### P1 — O conferente fotografa o que achou

**Given** um usuário com `trip.manage` numa nota de viagem em separação **When** abre "Ocorrência" na
linha da nota, escolhe o tipo, tira uma foto pela câmera e envia **Then** a ocorrência é gravada com
a foto anexada e a lista da nota já mostra a miniatura.

### P1 — Sem foto não grava, em nenhum canal

**Given** qualquer canal de registro de ocorrência de galpão **When** o registro chega sem anexo
**Then** o caso de uso recusa com 422 `OCCURRENCE_PHOTO_REQUIRED` e **nada** é gravado — nem
ocorrência, nem objeto, nem auditoria.

### P1 — A câmera negada não impede a ocorrência

**Given** um aparelho cuja permissão de câmera foi negada **When** o conferente abre o diálogo
**Then** vê o aviso de câmera indisponível e o seletor de arquivo funcionando, e conclui o registro.

### P1 — O operador manda a foto pelo WhatsApp

**Given** um operador autorizado no fluxo de ocorrência de galpão **When** chega ao passo da foto e
envia uma imagem na conversa **Then** a mídia é baixada da Meta, guardada no bucket, anexada à
ocorrência, e o fluxo confirma "Ocorrência registrada" com a contagem de fotos.

### P1 — Quem não pode mandar foto cancela

**Given** o mesmo operador no passo da foto **When** responde texto, ou toca "❌ Cancelar ocorrência"
**Then** no primeiro caso o fluxo repete o pedido explicando que precisa de imagem, e no segundo
nada é gravado e ele volta ao menu da viagem.

### P2 — Uma foto falha no meio de cinco

**Given** uma ocorrência web com cinco fotos **When** a terceira falha por rede **Then** a ocorrência
e as fotos que subiram permanecem, o diálogo marca só a que falhou e oferece "tentar de novo" com a
mesma chave de idempotência — reenviar não duplica as que já entraram.

### P2 — As fotos aparecem onde a ocorrência aparece

**Given** uma ocorrência de galpão com três fotos **When** alguém com leitura da viagem abre o painel
da nota, o feed `/ocorrencias` ou a linha do tempo **Then** vê as três miniaturas (painel e feed) ou
o marcador com a contagem (linha do tempo), servidas por URL assinada de vida curta.

### P3 — A foto expira e a ocorrência fica

**Given** uma ocorrência de cinco anos e um dia **When** o expurgo roda **Then** o objeto sai do
bucket, a linha do anexo some, e a ocorrência continua legível com o selo "foto expirada".

## Requisitos funcionais

### Dados e registro

- **RF1.** Tabela `trip_document_occurrence_attachments` com `company_id`, `occurrence_id`,
  `stored_object_id`, `thumbnail_object_id` (nullable), `position` e `created_at`, FKs compostas por
  `company_id` e teto de cinco por ocorrência garantido no banco (detalhe no `plan.md`).
  `thumbnail_object_id` é nullable porque a foto do WhatsApp não tem miniatura (D14), e o anexo
  lido da coluna antiga (D6) também não tem.
- **RF2.** Dois purposes novos em `STORAGE_OBJECT_PURPOSES` (`src/database/storage.schema.ts:12-26`),
  com o CHECK ampliado: `trip_occurrence_attachment` (original) e `trip_occurrence_thumbnail`
  (miniatura). A foto do galpão **não** reusa `delivery_proof`: é o purpose que define o horizonte de
  retenção (RF21) e a varredura do expurgo, e separar original de miniatura é o que permite tratá-los
  como o que são — prova e cache de leitura.
- **RF3.** Todo objeto gravado — original **e** miniatura — preenche
  `stored_objects.retention_until = created_at + 5 anos`. A miniatura expira junto com a foto que
  ela representa; miniatura sobrevivente seria dado pessoal órfão.
- **RF4.** `registerTripOccurrence` recusa ocorrência de etapa `separation` sem anexo, com 422
  `OCCURRENCE_PHOTO_REQUIRED`, antes de gravar ocorrência, objeto ou auditoria (D1).

### Contrato HTTP

- **RF5.** `POST /trips/:id/documents/:documentId/occurrences` passa a aceitar **apenas**
  `multipart/form-data`, com `Idempotency-Key` obrigatório: campos `occurrenceTypeId`, `note`,
  `productCode`, exatamente um `file` (o original) e no máximo um `thumbnail`. Corpo JSON responde
  400 `INVALID_REQUEST`. `thumbnail` sem `file` é 400; `file` sem `thumbnail` é aceito (é o que o
  WhatsApp e um cliente antigo mandam) e grava o anexo sem miniatura.
- **RF6.** `POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments` anexa uma
  foto a ocorrência já gravada da mesma empresa, com `Idempotency-Key`. Passar do teto responde 409
  `TRIP_OCCURRENCE_ATTACHMENT_LIMIT`; ocorrência de outra empresa ou inexistente responde 404
  `TRIP_OCCURRENCE_NOT_FOUND`; ocorrência de etapa `delivery` responde 422
  `OCCURRENCE_TYPE_NOT_SEPARATION`. Aceita os mesmos `file` + `thumbnail` de RF5.
- **RF7.** As duas rotas validam tamanho, tipo (`image/jpeg`, `image/png`, `image/webp`) e
  **assinatura de bytes**, reaproveitando `assertOfficeUploadAccepted`; rejeição é 422
  `TRIP_DELIVERY_PROOF_TOO_LARGE` / `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`. Tetos (D13):
  `OCCURRENCE_PHOTO_MAX_BYTES = 512 KiB` para o original vindo da web,
  `OCCURRENCE_THUMBNAIL_MAX_BYTES = 128 KiB` para a miniatura, e os `OFFICE_PROOF_MAX_BYTES`
  (960 KiB) para a mídia do WhatsApp, que não passou por navegador nosso. O teto da miniatura é
  o dobro do alvo de 60 KB — miniatura maior que isso é cliente adulterado, não foto difícil.

### Leitura

- **RF8.** O anexo é lido como
  `{ id, position, downloadUrl?, thumbnailUrl?, expiresAt?, expired, mimeType }` — `downloadUrl` é o
  original, `thumbnailUrl` é a miniatura, os dois presigned de 5 min. `thumbnailUrl` vem ausente
  quando a miniatura não existe (foto de WhatsApp, D14) e a tela cai para o original. `objectKey` e
  `bucket` **nunca** saem no JSON, em nenhuma das três telas.
- **RF9.** **Painel da nota dentro da viagem** —
  `GET /trips/:id/documents/:documentId/occurrences` passa a devolver `attachments[]` ordenado por
  `position`, no lugar do `attachment` singular (`src/main.ts:2717-2745`). A grade mostra
  **miniaturas**; o original só é buscado quando o usuário abre uma.
- **RF10.** **Feed / consulta de ocorrências** (`GET /trip-occurrences`, tela `/ocorrencias`) — o
  campo `hasAttachment` deixa de ser `false` fixo para ocorrência de nota
  (`trip-occurrence-feed.query.ts:234`) e passa a refletir a existência de anexo. O detalhe expandido
  carrega **miniaturas** por `GET /trip-occurrences/:id/attachments`, que devolve todas as fotos no
  formato de RF8. É aqui que a miniatura mais importa: lista longa com originais baixaria megabytes
  por rolagem.
- **RF11.** **Detalhe da ocorrência** — a conferência do que foi registrado mostra as fotos em grade
  de miniaturas, e o original em tela cheia só quando o usuário abre uma, pelo mesmo `downloadUrl`
  assinado.
- **RF12.** **Linha do tempo** (`GET /trips/:id/timeline`) marca a ocorrência que tem foto e diz
  quantas, **sem** gerar URL assinada nenhuma na listagem — nem de original, nem de miniatura. Quem
  quer ver abre a ocorrência.
- **RF13.** Carregamento: a miniatura **não bloqueia** a renderização da lista. A grade desenha o
  esqueleto no lugar de cada foto (`@/components/ui/skeleton`, na forma do conteúdo real) e as
  imagens entram com `loading="lazy"`, uma a uma. Falha de uma imagem vira selo de "não foi possível
  carregar", nunca ícone quebrado, e nunca derruba as outras.
- **RF14.** A grade tem no máximo cinco fotos (D2), então cabe inteira em qualquer largura: no
  telefone são duas por linha, no desktop as cinco em linha única. Não há "ver mais" nem paginação
  de foto — o teto existe justamente para dispensar isso.
- **RF15.** A leitura é unificada num ponto só: anexos da tabela nova quando existirem, senão a
  coluna `attachment_object_id` como anexo único (D6) — que, sendo anterior às miniaturas, sempre
  vem sem `thumbnailUrl`.

### WhatsApp

- **RF16.** A ocorrência do WhatsApp passa a nascer pelo **mesmo** bloco de persistência da rota
  HTTP: a dep `registerOccurrence` (`src/main.ts:826-843`) troca o `saveOccurrence` cru por
  `persistSeparationOccurrenceWithAttachment` (já usado em `src/main.ts:2799-2824`), com
  `attachment` opcional. `meta-whatsapp-module.resolver.ts:82-95` **continua sem** `providers`, e um
  contrato trava essa ausência como regressão (D7).
- **RF17.** `extractWhatsAppAnswer` mantém a assinatura `string | undefined`. O descritor da imagem
  é escrito pelo despachante numa chave de contexto ao montar o cursor
  (`whatsapp-command-driver.service.ts:222-229`), lido pelo router da foto e **apagado no mesmo
  turno** (D16). Imagem em nó de escolha segue sendo resposta inválida e conta para o handoff.
- **RF18.** O fluxo do operador ganha o nó `operator_occurrence_photo_entry` depois de
  `operator_note_entry` (`register-operator-trip-flow-actions.ts:580-620`): pede a foto **dizendo
  que sem ela nada será registrado** (D15), aceita até cinco (cada imagem anexa e repete o pedido,
  com "✅ Concluir" quando já há pelo menos uma), e oferece "❌ Cancelar ocorrência".
- **RF18b.** O router da foto **incrementa o contador de tentativas inválidas** a cada resposta que
  não é imagem. Sem isso, quem responde texto entra em **laço infinito**: o contador só roda em nó
  de escolha hoje, e o passo da foto não é um. Estourado o limite, vale o handoff humano já
  existente.
- **RF18c.** `describeTripError` ganha os casos `TRIP_DELIVERY_PROOF_TOO_LARGE` e
  `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`, com mensagem que diz o **limite** e a **saída** ("mande
  uma foto menor" / "mande JPEG, PNG ou WebP") — hoje esses códigos cairiam na mensagem genérica, e
  o operador não saberia o que corrigir.
- **RF19.** A ocorrência do WhatsApp só é gravada **depois** da primeira foto baixada com sucesso, na
  mesma transação do anexo. Falha de download responde ao operador que a foto não chegou e mantém o
  passo, sem gravar nada.
- **RF20.** A mídia do WhatsApp passa pelas mesmas validações de tipo e assinatura de bytes (RF7) —
  o canal não é rota de escape para tipo inesperado. O **teto de bytes vira parâmetro** de
  `persistSeparationOccurrenceWithAttachment`, que hoje fixa `OCCURRENCE_PHOTO_MAX_BYTES` (512 KiB):
  o WhatsApp passa `OFFICE_PROOF_MAX_BYTES` (960 KiB), **importado** de `delivery-proof.policy.ts`,
  sem constante nova (§16 do code-standart). Sem essa parametrização a foto de 700 KiB passaria no
  router e seria recusada lá dentro, com mensagem que não corresponde ao limite anunciado.
- **RF20b.** A idempotência do canal é por **sha256 do arquivo baixado**, nunca por `media-id`: o
  `media-id` muda quando o operador reenvia a mesma foto, e uma chave derivada de `occurrenceId`
  seria circular — no momento do upload a ocorrência ainda não existe. A reentrega do mesmo webhook
  pela Meta é barrada antes disso, pelo `nonceStore` que o módulo já usa.

### Retenção e expurgo

- **RF21.** Rotina `trip.occurrence-attachment.purge` no worker, registrada no `JOB_CATALOG` das
  quatro apps (cópia por valor, paridade guardada por contrato), com intervalo mínimo de 86 400 s.
- **RF22.** A rotina processa em lotes com teto de lotes e parada por `isStopRequested`, no molde de
  `rate-limit.window.purge`: para cada `stored_objects` dos **dois** purposes de RF2 com
  `retention_until < now()` e `status <> 'deleted'` — apaga o objeto no bucket, marca a linha como
  `status: 'deleted'` com `deleted_at`, e remove a linha de `trip_document_occurrence_attachments`.
  Original e miniatura do mesmo anexo saem no mesmo lote: miniatura que sobrevivesse ao original
  seria retrato de carga alheia sem a prova a que pertence.
- **RF23.** A linha de `stored_objects` **não** é apagada: vira registro de que existiu e foi
  expurgada. A ocorrência nunca é tocada (D11).
- **RF24.** Objeto já ausente do bucket não falha o ciclo: a rotina converge (marca e segue).
- **RF25.** O log do ciclo traz só contadores e identificadores opacos
  (`trip_occurrence_attachment_purge_cycle_finished` com `batches`, `deleted`, `exhausted`,
  `correlationId`, `executionId`) — nunca `object_key`, URL ou `companyId` de uma foto específica.
- **RF26.** A leitura devolve `expired: true` e **sem** `downloadUrl` para anexo cuja retenção
  venceu, mesmo antes de o expurgo passar (a expiração é a data, não a varredura).
- **RF27.** O achado de retenção e a varredura nova são registrados em `docs/SECURITY.md` no formato
  do arquivo (`### AAAA-MM-DD — …`, com `Onde`, `O que é`, `O que falta`/`Corrigido`, `Origem`),
  fechando parcialmente o achado aberto que já pede varredura periódica de `delivery-proofs/` e
  `trip-occurrence-attachments/` (`docs/SECURITY.md:149-172`).

### UI

- **RF28.** O diálogo de ocorrência de galpão (`TripOccurrences.component.tsx` e
  `SeparationOccurrenceDialog.component.tsx`) ganha captura por câmera e seleção de arquivo, lista de
  miniaturas com remover antes do envio, teto de cinco à vista, e bloqueia o envio sem foto.
- **RF29.** Toda foto é reencodada para JPEG antes de sair do navegador, e o mesmo passo gera a
  miniatura (D12): **original** com lado maior ≤ 1600 px e alvo ≤ 400 KB, **miniatura** com lado
  maior ≤ 320 px e qualidade 0,7 (alvo ≤ 60 KB). Os dois sobem na mesma requisição, ligados ao mesmo
  anexo. O reencode é o que descarta o EXIF, inclusive a coordenada de GPS.
- **RF29b.** Se a geração da miniatura falhar (canvas indisponível, memória), o envio segue **só com
  o original** e o anexo fica sem `thumbnail_object_id` — a prova nunca é perdida por causa do cache
  de leitura.
- **RF30.** Câmera `denied`/`unavailable` mostra aviso e mantém o seletor de arquivo (D4).
- **RF31.** O envio é sequencial com estado por foto (`pending → sending → sent | failed`); falha
  parcial preserva o que já entrou e oferece reenvio só do que falhou, com a mesma chave.
- **RF32.** Anexo `expired` aparece como selo "foto expirada", com a data do registro, no painel, no
  feed e no detalhe da ocorrência — nunca `<img>` apontando para nada. Na linha do tempo, a contagem
  de fotos passa a dizer que elas expiraram.
- **RF32b.** Anexo sem miniatura (foto de WhatsApp, coluna antiga, falha de RF29b) é desenhado na
  grade a partir do **original**, com `loading="lazy"` — a tela não mostra buraco nem selo por falta
  de miniatura, porque a foto existe e é a prova (D14).
- **RF33.** O texto `occurrence.occurrencePhotoHint` (`trip.locale.json:1048`), que mandava o usuário
  registrar a ocorrência em outro lugar para anexar foto, sai.

## Requisitos não funcionais

- **RNF1.** Chave do objeto sem dado pessoal:
  `tenants/{companyId}/trip-occurrence-attachments/{occurrenceId}/{objectId}` — nunca nome de
  destinatário, CNPJ, número de nota ou nome de arquivo do usuário (segurança §7). A mídia do
  WhatsApp usa a mesma chave, não a do pacote.
- **RNF2.** URL de acesso é presigned `inline` de 5 min (`DOWNLOAD_EXPIRES_IN_SECONDS`), gerada só na
  leitura de detalhe; nunca no cursor de listagem.
- **RNF3.** Nenhum log carrega `object_key`, URL assinada, bytes, `note` da ocorrência ou telefone —
  só identificadores opacos.
- **RNF4.** Upload dentro da transação, com `runWithStoredObjectCleanup` apagando o objeto se ela
  desfizer.
- **RNF5.** Rate limit em Postgres nas duas rotas, no molde de
  `test/rate-limited-routes.contract.test.ts`. O WhatsApp segue limitado por
  `WHATSAPP_COMMAND_RATE_LIMIT`.
- **RNF6.** Isolamento por `companyId` do contexto em toda query nova, com contrato em
  `test/trip-schema/tenant-safety.contract.ts`.
- **RNF7.** As migrations são aditivas, com `rollback.sql` ao lado e `snapshot.json`, e passam em
  `make migration-test`.
- **RNF8.** O download da mídia da Meta tem prazo e não segura o turno da conversa além do aceitável:
  falha ou demora respondem ao operador e mantêm o passo (RF19).

## Casos extremos e falhas

- Ocorrência antiga, sem foto nenhuma: continua legível; `attachments` vem `[]`. A obrigatoriedade
  vale só para registro novo.
- Ocorrência de rua (uma foto na coluna antiga): a leitura devolve `attachments` com um item.
- Sexta foto: 409 `TRIP_OCCURRENCE_ATTACHMENT_LIMIT`; a UI nem oferece o botão, e o WhatsApp troca o
  pedido por "✅ Concluir".
- Reenvio com a mesma `Idempotency-Key` e mesmo conteúdo: converge. Mesma chave com conteúdo
  diferente: 409 `TRIP_FIELD_REPORT_KEY_REUSED`.
- Arquivo com extensão de imagem e bytes de outra coisa: 422 pela assinatura, não pelo `content-type`.
- Aba fechada entre a criação e a segunda foto: a ocorrência fica gravada com as fotos que subiram.
- Bucket fora do ar na criação: a transação desfaz, nada é gravado, a UI mostra falha reenviável.
- WhatsApp: mídia expirada na Meta (o link de download tem validade) ou `media-id` desconhecido →
  mensagem ao operador e o passo continua, sem gravar.
- WhatsApp: operador manda vídeo, documento ou áudio no passo da foto → mesma instrução de imagem.
- WhatsApp: operador abandona a conversa no passo da foto → **nada gravado, e o tipo e a observação
  que ele já tinha escolhido se perdem** (D15). Não há TTL de sessão: o contexto fica na `sessions`
  até a próxima interação sobrescrevê-lo. Comportamento declarado e aceito, com aviso no passo.
- WhatsApp: operador responde texto várias vezes no passo da foto → o contador de tentativas
  inválidas sobe e o handoff humano acontece (RF18b); o fluxo **não** repete o pedido para sempre.
- Objeto apagado do bucket com a linha viva: a leitura omite o anexo e não derruba a resposta.
- Expurgo interrompido no meio do lote: converge no ciclo seguinte (marcação é idempotente).
- Expurgo com objeto já ausente no bucket: marca e segue (RF24).

## Critérios de aceite

- **CA1.** Migration: a tabela nova existe com as FKs compostas por `company_id`, o teto de cinco e o
  unique `(company_id, id)` que faltava em `trip_document_occurrences`; o purpose novo entra no
  CHECK; `make migration-test` verde com o `rollback.sql` aplicado e revertido.
- **CA2.** Contrato: multipart com um `file` válido grava ocorrência + anexo `position: 1` +
  `stored_objects` `final` com `retention_until` de cinco anos; corpo JSON responde 400; sem `file`
  responde 422 `OCCURRENCE_PHOTO_REQUIRED` **no caso de uso**, sem tocar storage nem `saveOccurrence`.
- **CA3.** Contrato: a rota de anexo grava a segunda foto com `position` seguinte; a sexta responde
  409; ocorrência de outra empresa responde 404; ocorrência `delivery` responde 422.
- **CA4.** Contrato: arquivo acima do teto ou de tipo não aceito responde 422 e o objeto não fica
  órfão no bucket (limpeza exercitada).
- **CA5.** Contrato: `GET .../occurrences` devolve `attachments` ordenado, com `downloadUrl` **e**
  `thumbnailUrl` assinados e sem `objectKey`/`bucket`; ocorrência sem anexo devolve `[]`; ocorrência
  só com a coluna antiga devolve um item **sem** `thumbnailUrl`; anexo com retenção vencida devolve
  `expired: true` sem nenhuma das duas URLs.
- **CA6.** Contrato: o feed devolve `hasAttachment: true` para ocorrência de nota com foto, e
  `/trip-occurrences/:id/attachments` lista as cinco no formato de RF8, com `thumbnailUrl` quando há
  miniatura e sem ele quando não há (foto de WhatsApp).
- **CA6b.** Contrato do frontend: as três telas que mostram foto — feed `/ocorrencias`, detalhe da
  ocorrência e painel da nota — pedem a **miniatura**, e só buscam o original quando o usuário abre
  uma foto; anexo sem miniatura cai para o original; a grade desenha esqueleto antes das imagens e
  usa `loading="lazy"` (RF13); falha de uma imagem não derruba as outras.
- **CA7.** Contrato: a linha do tempo traz a contagem de fotos e nenhuma URL assinada — nem de
  original, nem de miniatura.
- **CA7b.** Contrato do frontend: o reencode gera original (≤ 1600 px, ≤ 400 KB) e miniatura
  (≤ 320 px, ≤ 60 KB) do mesmo canvas, o multipart leva os dois, e falha na miniatura envia só o
  original (RF29b). Contrato da API: original acima de 512 KiB → 422; miniatura acima de 128 KiB →
  422; `thumbnail` sem `file` → 400.
- **CA8.** Isolamento: nenhuma query nova alcança anexo de outra empresa
  (`tenant-safety.contract.ts`).
- **CA9.** Contrato do WhatsApp: `extractWhatsAppAnswer` **mantém** `string | undefined`; o
  descritor da imagem chega pelo contexto escrito no cursor e é apagado no mesmo turno; imagem em nó
  de escolha vira resposta inválida e conta para o handoff; `media-id` não aparece em log nenhum.
- **CA9b.** Contrato de regressão: `meta-whatsapp-module.resolver.ts` monta o módulo **sem**
  `providers` — o teste falha se alguém injetar `objectStorage` (D7).
- **CA9c.** Contrato: a ocorrência vinda do WhatsApp nasce por
  `persistSeparationOccurrenceWithAttachment`, com `stored_objects` de purpose
  `trip_occurrence_attachment`, `retention_until` de cinco anos, chave
  `tenants/…/trip-occurrence-attachments/…` e **sem** miniatura.
- **CA10.** Contrato do WhatsApp: o fluxo do operador chega a `operator_occurrence_photo_entry` depois
  da nota; imagem anexa e repete o pedido com "✅ Concluir"; texto repete a instrução; "❌ Cancelar
  ocorrência" não grava nada; a sexta imagem não é aceita.
- **CA11.** Contrato do WhatsApp: falha de download da mídia **não** grava ocorrência (RF19); foto
  entre 512 KiB e 960 KiB é **aceita** (prova que o teto é parâmetro, RF20); acima de 960 KiB e tipo
  errado são recusados com a mensagem de `describeTripError` que diz o limite e a saída (RF18c);
  resposta de texto no passo incrementa o contador de tentativas e o handoff acontece (RF18b) — o
  teste falha se o fluxo repetir o pedido indefinidamente.
- **CA11b.** Contrato: a idempotência é por sha256 do arquivo baixado (RF20b) — reenviar a mesma
  foto com `media-id` diferente não duplica anexo; e a **reentrega do mesmo webhook é barrada pelo
  `nonceStore`**, provado por teste, não assumido.
- **CA11c.** Contrato: nenhum `stored_objects` com origem WhatsApp nasce com purpose diferente de
  `trip_occurrence_attachment`.
- **CA11d.** Contrato: abandonar no passo da foto não grava nada, e a mensagem do passo avisa disso
  antes (D15/RF18).
- **CA12.** Integração: o fluxo do operador ponta a ponta contra Postgres grava ocorrência + anexo +
  `stored_objects` com o purpose e a retenção corretos
  (`test/integration/whatsapp-operator-flow-actions.integration.ts`).
- **CA13.** Contrato do expurgo: a rotina apaga o objeto, marca `deleted`/`deleted_at`, remove a
  linha do anexo, **não** toca a ocorrência, respeita lote/teto/`isStopRequested`, converge com
  objeto ausente, e loga só contadores.
- **CA14.** Paridade: `trip.occurrence-attachment.purge` aparece no `JOB_CATALOG` das quatro apps e
  passa em `test/job-catalog/catalog.contract.ts`; a linha nasce em `job_schedules` pela migration.
- **CA15.** Integração do worker: foto com retenção vencida some do bucket e da tabela, e a
  ocorrência segue legível (`make worker-integration`).
- **CA16.** Contrato do frontend: o cliente envia multipart com `Idempotency-Key` e uma foto por
  requisição; a segunda em diante vai pela rota de anexo; a chave é estável no reenvio.
- **CA17.** Contrato do frontend: sem foto, o envio fica bloqueado com motivo visível;
  `cameraStatus` `denied`/`unavailable` mostra o aviso e mantém o seletor de arquivo; falha da
  terceira de cinco marca só ela e oferece reenvio; anexo `expired` vira selo, não `<img>`.
- **CA18.** Rate limit: as duas rotas aparecem em `test/rate-limited-routes.contract.test.ts`.
- **CA19.** `docs/SECURITY.md` tem a entrada nova no formato do arquivo (RF27).
- **CA20.** Smoke + prints: diálogo com miniaturas, diálogo em modo "só arquivo" (câmera negada),
  painel da nota com três fotos e painel com foto expirada, em 390×844 e 1440×900, claro e escuro,
  em `specs/161-foto-na-ocorrencia-de-separacao/prints/`, com a revisão de design e usabilidade
  registrada em `evidence.md` (`web.md` §15).

## Segurança e LGPD

Foto de carga pode conter rótulo com nome, endereço ou CNPJ do destinatário — é dado pessoal por
tabela, mesmo que a intenção seja fotografar a caixa.

- **Acesso**: as mesmas permissões da leitura da viagem (`TRIP_FIELD_READ_POLICY` no painel,
  `fleet.read`/`trip.report-on-behalf` no feed). Nenhuma rota pública, nenhum objeto público.
- **Entrega**: presigned de 5 min, `inline`. A chave do objeto e o bucket nunca saem no JSON nem em
  log (RNF1/RNF3).
- **Retenção**: cinco anos a contar do registro (D9), com expurgo que apaga o objeto de verdade
  (RF21–RF25). Guardar indefinidamente é acúmulo sem finalidade; guardar menos que o documento
  fiscal que a foto contesta destrói a prova antes do fim da discussão.
- **EXIF**: o reencode JPEG do navegador (RF29) descarta metadados, inclusive coordenada de GPS do
  aparelho do conferente — e é o mesmo passo que gera a miniatura, então limpeza e cache de leitura
  custam um canvas só.
- **EXIF da mídia do WhatsApp — risco assumido** (D14): ela não passa por navegador nosso, então
  **preserva metadado de localização** e não tem miniatura. O usuário decidiu não acrescentar
  biblioteca de processamento de imagem no servidor, e a spec não contorna isso por baixo: fica
  registrado em `docs/SECURITY.md` (RF27) com essa justificativa. O caminho de saída, se a operação
  quiser uniformizar, é `sharp` ou equivalente no servidor, ao custo de binário nativo na imagem,
  compatibilidade com Bun a verificar, superfície de CVE de decodificador de imagem e CPU dentro do
  request. Enquanto isso não for decidido, a foto de WhatsApp é uma foto com GPS dentro, guardada
  por cinco anos, e quem tem acesso à ocorrência tem acesso a ela.
- **WhatsApp**: o token do canal segue selado em `whatsapp_channels`; nenhuma URL de mídia da Meta,
  `media-id` ou telefone entra em log.
- **Auditoria**: o registro segue gravando `actor_user_id` e `channel`; nenhum campo novo de PII.

## Dúvidas

Nenhuma.
