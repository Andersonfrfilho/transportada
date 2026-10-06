# Feature 245 — A localização do WhatsApp não fica na conversa

> **Estado:** pronta para execução, sem `[NEEDS CLARIFICATION]` aberto (as escolhas reversíveis estão
> marcadas como recomendação em "Decisões"). **Sem migration** em nenhum dos dois repositórios. Tem três
> pontos de parada humana: a **publicação do pacote no npm** (T1.5), o **deploy** (T3.1) e a **redação
> do legado em produção** (T3.3 — escrita irreversível de dado pessoal, decisão do usuário).
> Data: 2026-10-06. Nasce da pendência registrada pela spec 239 (D9, "WhatsApp em spec própria",
> `specs/239-o-expurgo-se-liga-na-tela/spec.md:261-273`), pela ADR-0081 (§3.1, `:98-100`, e emenda 7.1,
> `:195-196`) e pelo `docs/SECURITY.md:2118-2120`.

## Problema e resultado

Desde a subida de `@adatechnology/meta-whatsapp-module@0.7.0` (spec 196 T3.7, 2026-10-03), quando alguém
manda a **mensagem de localização** do WhatsApp, a coordenada vai a dois lugares:

1. **Ao evento da viagem** — o despachante a guarda em memória por 5 min e a próxima ação do motorista a
   grava como `captured` numa das cinco tabelas `trip_*`. Ali ela está sob o expurgo por empresa da
   spec 239 e sob a lista fechada de leitores da ADR-0081 §6.
2. **Ao transcript do pacote** — `meta_whatsapp.messages.payload.location` (latitude, longitude, nome,
   endereço e URL do pino) e o rótulo do pino em `messages.content`. **Fora** de qualquer expurgo, sem
   prazo, para qualquer remetente (motorista, operador, número desconhecido), e sem nenhum leitor no
   produto.

O segundo lugar não tem finalidade: nada na transportada lê o transcript, e o ponto que importa já está
no evento. Guardar coordenada de pessoa sem finalidade e sem prazo contraria a LGPD (art. 6º, I
finalidade e III necessidade) e o que a ADR-0045 §3.3 promete.

**Resultado:** a mensagem de localização **continua chegando** ao despachante (o carimbo `captured` da
196 não muda), mas o transcript passa a guardar só que houve uma localização (`type = 'location'`,
`content = '📍 Localização'`), **sem** o ponto, sem o nome e sem o endereço do pino. O que já foi gravado
desde a 0.7.0 é redigido uma vez, por empresa, com aprovação do usuário.

## O que o código diz hoje (evidência)

### (1) Onde a coordenada mora, e quem lê

Fontes do pacote no repositório `~/Documents/personal/adatechnology-packages`
(`packages/backend/meta-whatsapp-module/src/`), conferidas contra o `dist` publicado da `0.7.0` instalado
em `node_modules/.bun/@adatechnology+meta-whatsapp-module@0.7.0+…/dist/index.js`.

| Lugar                                    | O que guarda                                                                                        | Evidência                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta_whatsapp.messages.payload` (jsonb) | `payload.location` = o objeto inteiro da Meta: `latitude`, `longitude`, `name?`, `address?`, `url?` | `channel/ReceiveWebhook.use-case.ts:80-92` (`extractPayload`, `:89`); `dist/index.js:2600`; forma em `meta-whatsapp-contracts@0.6.0` `dist/index.js:34-40` (`whatsAppLocationSchema`); coluna em `schema/schema.ts:75` |
| `meta_whatsapp.messages.content` (text)  | `📍 Localização: <name ?? address>` — o rótulo do pino                                              | `ReceiveWebhook.use-case.ts:73-76` (`extractContent`); `dist/index.js:2586`; coluna em `schema/schema.ts:72`                                                                                                           |
| Quando grava                             | **antes** do gancho, na própria requisição do webhook, para todo remetente                          | `ReceiveWebhook.use-case.ts:267-280` (`handleMessage` chama `logMessage` e só depois `dispatch`)                                                                                                                       |
| `meta_whatsapp.documents` / `flow_media` | nada de localização: são arquivos (`uploadId`, nome, mime)                                          | `schema/schema.ts:139-168`, `:206-243`; e a transportada não injeta `objectStorage` (`meta-whatsapp-module.resolver.ts:92-104`; spec 062 `tasks.md:447`)                                                               |
| Colunas de transcrição de áudio          | nada de localização; e a transcrição não é injetada aqui                                            | `schema/schema.ts:95-99`; resolver `:92-104`                                                                                                                                                                           |
| `meta_whatsapp.sessions.context`         | nada: a regra do host proíbe PII no `context`                                                       | `apps/api-transportada/CLAUDE.md` § WhatsApp ("Nada de ator, permissão ou PII no `context`"); o ponto vive em `WhatsAppSharedLocationStore`, memória, 5 min (`whatsapp-shared-location.service.ts:53-95`)              |
| Log do pacote                            | nada: o `dist` da `0.7.0` não tem `console.` (contagem 0)                                           | `grep -c "console\." dist/index.js` = 0; spec 196 `evidence.md` § T3.7 ("nenhuma coordenada em log nosso")                                                                                                             |
| Fila de entrada do pacote                | não se aplica: sem `inboundQueue`, o efeito roda na requisição; nada vai a Redis                    | `ReceiveWebhook.use-case.ts:332-336`; o resolver não injeta fila (`:92-104`)                                                                                                                                           |
| Conversa da ocorrência (spec 183)        | nada: o texto que ela copia ignora `location`                                                       | `occurrence-conversation/application/whatsapp-conversation-inbound.service.ts:41-56` (`extractWhatsAppConversationText`)                                                                                               |
| Cópias fora do banco de produção         | o backup cifrado e o espelho semanal em staging carregam o schema `meta_whatsapp` inteiro           | `deploy/staging-refresh/staging-refresh.sh:4,22`; `apps/api-transportada/test/deploy/staging-refresh.contract.ts:52-56`                                                                                                |

**Quem lê o transcript:** ninguém no produto. O pacote expõe leitores — `conversations.listMessages`
(`MessageRepository.ts:192-202`, `select()` da linha inteira), `conversations.export`
(`SessionRepository.ts:289-300`), e a prévia da lista de conversas lê `content` da última mensagem
(`SessionRepository.ts:29-33`) —, mas a transportada não os chama: a busca por `conversations.` em
`apps/*/src` só acha `module.conversations.repository` (sessões, `whatsapp-command-hook.factory.ts:77`), e
não há rota nem tela de inbox (a T007 da spec 062 nunca foi feita). Quem tem acesso direto ao banco, ao
backup ou ao staging espelhado lê.

**O despachante não depende do transcript:** o gancho recebe a mensagem crua da Meta, não a linha gravada
(`onMessageReceived(message, session)`, `whatsapp-command-driver.service.ts:108`), e o ponto sai de
`turn.message` (`:180`, `extractWhatsAppIncomingLocation`, `whatsapp-shared-location.service.ts:111-127`).
Só quem tem `trip.report` tem o ponto lembrado (`whatsapp-command-driver.service.ts:171-190`); as três
ações do motorista o consomem (`register-driver-flow-actions.ts:173-180`, usos em `:332`, `:378`, `:518`).
A localização de operador e de número desconhecido **só** existe no transcript.

### (2) A retenção atual das mensagens no pacote

**Não existe.** Nenhum caminho do pacote apaga ou redige `messages`:

- `PurgeExpiredDocumentsUseCase` (`use-cases/PurgeExpiredDocuments.use-case.ts:4-67`, exposto como
  `conversations.purgeExpiredDocuments` em `createMetaWhatsAppModule.ts:350`) expurga **só**
  `documents` (objeto no storage e a linha), com `retentionDays` **passado pelo host** a cada chamada —
  o pacote não guarda prazo. A transportada não o chama, e nem teria o que expurgar (sem `objectStorage`).
- `DeleteConversationUseCase` (`use-cases/DeleteConversation.use-case.ts`, `conversations.delete`) apaga a
  sessão inteira por número (a FK `messages.session_id` é `on delete cascade`, `schema/schema.ts:60-62`);
  é ação pontual, sem prazo, e a transportada não a chama.
- `MessageRepository` só tem `insert` e dois `update` (status de entrega e transcrição,
  `MessageRepository.ts:116-160`); nenhum `delete`.
- `meta_whatsapp.settings` (`schema/schema.ts:248-265`) é configuração por empresa, mas só de template,
  boas-vindas, despedida e transcrição — **nenhuma coluna de retenção**.

Ou seja: padrão = guardar para sempre; não há prazo, interruptor nem configuração por empresa.

## Fora do escopo

- **A retenção do transcript inteiro** (texto do motorista, telefone, código de verificação já
  registrado como B1 em `docs/SECURITY.md:1007-1010`). É decisão de produto maior, que a 239 D9 já
  separou ("a retenção dela merece a decisão inteira"); esta spec registra a pendência (T3.4) e não a
  decide. O texto livre do motorista fica como está, inclusive um endereço digitado.
- **A foto que chega pelo WhatsApp com EXIF/GPS** — risco aceito da spec 161 (`docs/SECURITY.md:160`).
- **Backups cifrados antigos e o espelho de staging anterior à redação.** O backup expira pela própria
  rotação (`deploy/backup/backup.sh:166`, `sweep_retention`); o staging se cura no espelho seguinte à
  redação de produção. Nada aqui reescreve backup.
- **Mensagem de saída do bot.** A resposta à localização é texto fixo sem número
  (`WHATSAPP_SHARED_LOCATION_REPLY`); a transportada não envia localização pelo WhatsApp.
- **O expurgo das cinco tabelas `trip_*`** — continua exatamente como a 239 o deixou.

## Decisões

- **D1 — Não persistir a coordenada no transcript (opção c), por um interruptor do pacote. Recomendação.**
  As três opções pedidas, comparadas:

  | Opção                                                                                          | Prós                                                                                                                                            | Contras                                                                                                                                                                                                                                                                                                                                                                                                       | Custo                                                                                 | Migration                                                                                                  | LGPD (art. 6º)                                                        |
  | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
  | **(a)** o worker redige `payload - 'location'` e o rótulo após N dias, por empresa (molde 239) | sem tocar no pacote; reaproveita `company_location_retention_settings` e o desenho do `CROSS JOIN LATERAL`                                      | **o worker escreveria no schema de outro dono**, com cópia de `meta_whatsapp.messages` vigiada contra as migrations do pacote; nasce desligado (sem linha = nada expira), então na prática o dado fica para sempre até alguém ligar; guarda N dias um dado **sem finalidade**; sem índice para `payload ? 'location'` (um índice útil seria migration no schema do pacote); o legado ainda precisa de redação | médio: tabela-cópia, redator, contrato de paridade, integração com o schema do pacote | nenhuma, se aceitar varredura sem índice; com índice, migration no schema do pacote = publicação de pacote | limitação temporal, mas não necessidade: ainda coleta o que não usa   |
  | **(b)** o pacote ganha política de retenção própria de mensagens                               | o dono do schema escreve no próprio schema; serve aos outros hosts                                                                              | é a decisão "retenção do transcript", que está fora do escopo; exige configuração de prazo (coluna nova em `meta_whatsapp.settings` ou prazo injetado pelo host, como `purgeExpiredDocuments`); varredura periódica precisa de quem a agende (o worker não depende do módulo); continua guardando o que não serve                                                                                             | alto: changeset, migration 0011, publicação, agendamento no host                      | **sim**, no pacote (coluna de prazo e/ou índice), com publicação npm                                       | igual a (a)                                                           |
  | **(c)** não persistir: o ingest descarta o ponto e o rótulo; o ponto segue só para o evento    | **minimização na fonte**: o dado nunca entra; não há prazo a configurar nem rotina a vigiar; o despachante já lê da mensagem crua, não da linha | exige mudança no pacote (a gravação acontece **antes** do gancho, `ReceiveWebhook.use-case.ts:267-280`, então o host não intercepta sem escrever no schema alheio); o ponto não consumido em 5 min se perde (já se perdia para o evento); o legado de 2026-10-03 em diante precisa de redação de uma vez                                                                                                      | baixo: uma opção em `features`, um caso de uso de redação, changeset minor            | **nenhuma**: muda o que se grava, não as colunas                                                           | finalidade e necessidade: coleta só o que o tratamento usa (o evento) |

  Escolhida **(c)**, desenhada assim:
  - **No pacote**, a opção `features.redactInboundLocation?: boolean` (padrão `false`: os outros hosts —
    sakura-bot, quickcart — continuam como estão; precedente de opção consciente com padrão conservador:
    `features.previewMedia`, `createMetaWhatsAppModule.ts:84-94`). Ligada, `extractPayload` não copia
    `location` e `extractContent` devolve `'📍 Localização'` sem rótulo. `type` continua `'location'`: o
    transcript diz que houve uma localização e quando, não onde. O gancho continua recebendo a mensagem
    crua inteira (nada muda em `dispatch`).
  - **Ligação:** `createMetaWhatsAppModule` passa `params.features?.redactInboundLocation ?? false` ao
    `ReceiveWebhookUseCase` (`ReceiveWebhook.use-case.ts:107-123`, parâmetro novo `redactInboundLocation?:
boolean`; fábrica em `createMetaWhatsAppModule.ts:216-226`); `extractContent`/`extractPayload`
    (`:64`, `:80`) ganham 2º argumento `{ isLocationRedacted }` com padrão `false` (`extractContent` é
    exportada e usada em teste: o padrão preserva o comportamento). Ressalva no JSDoc da opção: com
    `inboundQueue` o job leva a mensagem **crua**; a opção cobre o transcript, não a fila do host.
  - **Na transportada**, o resolver liga a opção sempre (`meta-whatsapp-module.resolver.ts:92`). É
    constante da instalação, não configuração (D3).
  - Por que não interceptar no gancho e fazer `UPDATE` pela `savedMessageId` (que o pacote entrega no
    `dispatch`): seria escrita da transportada no schema do pacote a cada mensagem, com janela em que o
    ponto está gravado e sem garantia se o gancho falhar — e o `dispatch` só roda para mensagem nova.
    Minimização que depende de o segundo passo dar certo não é minimização.

- **D2 — O legado é redigido uma vez, pelo pacote, com aprovação do usuário.** As linhas gravadas desde a
  subida da `0.7.0` em cada ambiente continuam com o ponto. O pacote ganha dois casos de uso, o dono do
  schema escrevendo no próprio schema (como `purgeExpiredDocuments`, que recebe `batchSize`):
  `conversations.countInboundLocations({ companyId, receivedBefore: Date })` →
  `{ counted, unreachable }` e `conversations.redactInboundLocations({ companyId, receivedBefore: Date,
batchSize? })` → `{ redacted }` (`batchSize` padrão 500; **uma passada por chamada**, o host faz o
  laço). A contagem vive no pacote; o **dry-run fica no script** (host), não no pacote.
  `unreachable` = linhas `type = 'location'` com `jsonb_typeof(payload) = 'string'` (ver abaixo). O
  `index.ts` exporta os dois casos de uso e a constante `INBOUND_LOCATION_CONTENT = '📍 Localização'`.

  ```sql
  WITH batch AS (
    SELECT x.id FROM meta_whatsapp.messages x
    WHERE x.company_id = $1 AND x.direction = 'inbound'
      AND jsonb_typeof(x.payload) = 'object' AND x.payload ? 'location'
      AND x.created_at < $2
    LIMIT $3
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE meta_whatsapp.messages m
    SET payload = NULLIF(m.payload - 'location', '{}'::jsonb),
        content = CASE WHEN m.type = 'location' THEN $4 ELSE m.content END -- $4 = INBOUND_LOCATION_CONTENT
    FROM batch WHERE m.id = batch.id AND m.company_id = $1
    RETURNING 1
  )
  SELECT count(*)::int AS redacted FROM updated;
  ```

  - **Guard `jsonb_typeof = 'object'`:** o `bun-sql` com Drizzle 0.x gravava `jsonb` como **escalar
    string**; `payload ? 'location'` dá falso em escalar e pularia a linha em silêncio. O guard evita o
    erro, e `unreachable` conta essas linhas para o operador saber que existem (não são tocadas).
  - **Sem `ORDER BY`:** o índice `idx_messages_company_number_created(company_id, whatsapp_number,
created_at)` não serve a ordenação por `created_at`. `company_id` repetido fora da subconsulta; ids
    nunca são logados (contagem por `count(*)` sobre o `RETURNING`).
  - **Lock só de linha**, transação curta por lote, `SKIP LOCKED`.
  - **Idempotente:** depois de redigida, a linha sai do filtro `payload ? 'location'`; a segunda execução
    devolve 0.
  - **Isolamento de tenant:** `company_id` obrigatório no caso de uso (como todo repositório do pacote);
    o filtro está na subconsulta, e o teste prova que a empresa B não é tocada.
  - **Sem índice novo:** o índice serve o **prefixo** `company_id` (ou seq scan), não a ordenação; cada
    lote revarre a empresa. Aceitável numa execução única, por empresa, numa instalação dedicada; o
    `EXPLAIN` com o volume real vai para a evidência da T3.3. Índice exigiria migration no schema do
    pacote — não vale para uma passada.
  - **Quem chama:** um script da API, `scripts/whatsapp-location-redact.ts --company <id>` — sem
    `--confirm` só **conta** (nenhuma coordenada impressa); com `--confirm` redige em lotes de 500 (laço no script) até
    zerar. Mesmo molde do `scripts/whatsapp-flow-publish.ts` (dry-run por padrão). `receivedBefore` = o
    instante do deploy da opção do D1, informado pelo operador: o que chegou depois já nasce redigido.
  - **Apagar é irreversível:** rodar em produção é escrita de dado pessoal, **decisão do usuário** em
    chat, nunca do executor (mesma regra do Gate A da 239).

- **D3 — Não é configuração por empresa, e não lê `company_location_retention_settings`. Recomendação.**
  A 239 D9 sugeriu que a spec do WhatsApp "pode ler o mesmo `retention_days`". Com (c) não sobra prazo
  para ler: o dado não entra. Um interruptor por empresa ("guardar a coordenada no transcript") seria
  tela para escolher guardar o que nenhum leitor usa — a empresa controladora não ganha nada com ele, e a
  minimização deixaria de ser padrão. Por isso o worker **não** muda: nada de junção, nada de N+1, nada de
  tenant novo na varredura. Se um dia existir inbox com finalidade para o ponto, a decisão volta com ela.

- **D4 — Escopo do que cai:** `payload.location` inteiro (latitude, longitude, `name`, `address`, `url` —
  `url` pode levar a coordenada no link) e o rótulo em `content`. **Ficam:** a linha da mensagem, o
  `type = 'location'`, `wa_message_id`, horário, remetente e todas as mensagens de texto. Vale para
  **todo** remetente (motorista, operador, número desconhecido), porque o ingest grava antes de saber
  quem é (`ReceiveWebhook.use-case.ts:267-280`). As outras chaves de `payload` (`interactive`, `image`,
  `referredProduct`…) não são tocadas.

- **D5 — O painel da 239 deixa de dizer "regra própria".** A linha
  `trip.locale.json:1081` ("As mensagens do WhatsApp seguem regra própria.") e o par `en` passam a dizer
  a verdade: _"A localização enviada pelo WhatsApp não fica na conversa: o ponto vai para o evento da
  viagem e segue este prazo."_ (e o `en` correspondente). Sem mudança de layout.

- **D6 — Registro, não auditoria em `audit_logs`.** A redação do legado é rodada por pessoa, por script,
  sem membership de ator (o FK composto de `audit_logs` exige membership, spec 239 D4). O rastro é: log
  estruturado `whatsapp.location.redacted` com `companyId` (id opaco) e contagem — **nunca** coordenada,
  rótulo, número de telefone ou id de mensagem —, mais a entrada em `evidence.md` e no `docs/SECURITY.md`
  com data, ambiente, empresa e contagem.

## Histórias priorizadas

### P1 — A localização chega ao evento e não fica na conversa

**Given** o motorista com `trip.report`, **when** ele manda a localização e em seguida "Entreguei",
**then** o evento grava `captured` com a coordenada (como na 196) e a linha em
`meta_whatsapp.messages` tem `type = 'location'`, `content = '📍 Localização'` e nenhum `payload.location`.

### P1 — Operador e desconhecido também não deixam ponto

**Given** um operador ou um número sem vínculo, **when** manda uma localização, **then** o transcript
guarda só que houve uma localização; nenhum evento é carimbado (como hoje).

### P2 — O legado sai uma vez

**Given** mensagens de localização gravadas desde a 0.7.0, **when** o usuário autoriza e o script roda com
`--confirm` para a empresa, **then** todas perdem o ponto e o rótulo, a segunda execução devolve 0, e as
de outra empresa ficam intactas.

## Requisitos funcionais

- **RF1** (pacote) `features.redactInboundLocation` ligada: mensagem de entrada do tipo `location` é
  gravada sem `payload.location` (com `payload = NULL` se não sobrar chave) e com `content = '📍 Localização'`.
  Desligada (padrão): comportamento da `0.7.0`, byte a byte.
- **RF2** (pacote) O gancho `onMessageReceived` recebe a mensagem crua com `location`, com a opção ligada
  ou não.
- **RF3** (pacote) `conversations.redactInboundLocations({ companyId, receivedBefore: Date, batchSize? })`
  devolve `{ redacted: number }`, redige pelo D2, só da empresa, só `direction = 'inbound'`, só antes de
  `receivedBefore`, uma passada por chamada. `conversations.countInboundLocations({ companyId,
receivedBefore })` devolve `{ counted, unreachable }` pelo mesmo predicado. O `index.ts` exporta os dois
  casos de uso e `INBOUND_LOCATION_CONTENT`.
- **RF4** (API) O resolver cria o módulo com `features: { redactInboundLocation: true }`.
- **RF5** (API) `scripts/whatsapp-location-redact.ts --company <uuid> [--received-before <ISO>] [--confirm]`:
  `--company` validado como UUID por Zod (senão o Postgres devolve 22P02); `--received-before` padrão
  agora, recusa futuro; sem `--confirm` o dry-run imprime `counted` e `unreachable`; com `--confirm`
  redige em lotes de 500 até zerar e imprime o total. Recusa sem `--company`.
- **RF6** (painel) Texto do D5 em pt-BR e `en`.

## Requisitos não funcionais

- **Sem migration** no pacote nem na API. Se a implementação descobrir que precisa de uma, **parar e
  perguntar** (🧠).
- Coordenada, rótulo, telefone e id de mensagem nunca em log, saída do script, erro ou evidência.
- Pacote: changeset `minor` (opção nova + caso de uso novo; padrão inalterado), testes do pacote
  (`ReceiveWebhook.location.test.ts` existe e é estendido), publicação pelo fluxo do repositório de
  pacotes. A `0.8.0` do módulo pina `meta-whatsapp-provider@0.4.0` (`workspace:*`; publicado em
  2026-10-05, aditivo `previewUrl`) e a API pina o provider `0.3.1` direto: a T2.1 sobe o provider da API
  para `0.4.0` junto. Contratos seguem `0.6.0`. Desvio registrado: o #125 (`15e0a02`) mudou
  `meta-whatsapp-contracts/src/providers.ts` (`SendTextOptions`) sem changeset; os contratos em `origin/main`
  estão à frente do `0.6.0` publicado, e o módulo não os usa.
- API: `bun install --frozen-lockfile` verde com a versão nova; `make check`; integração tocada rodada.

## Casos extremos e falhas

| Caso                                               | Comportamento                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Localização com `name` e `address`                 | Nenhum dos dois em `content` nem em `payload`.                                                                  |
| Mensagem com `location` e outra chave de `payload` | Só `location` sai; a outra fica.                                                                                |
| Reentrega da Meta (mesmo `waMessageId`)            | O índice único barra a segunda gravação (`schema/schema.ts:110-112`); nada muda.                                |
| API com a versão nova e o resolver sem a opção     | Comportamento antigo — por isso o contrato de RF4 tem mutação (tirar a opção reprova).                          |
| Ponto não consumido em 5 min (motorista não tocou) | Perde-se: não está no evento nem no transcript. Igual ao que já valia para o evento.                            |
| Script sem `--confirm`                             | Só contagem; nenhuma escrita.                                                                                   |
| Script rodado duas vezes                           | Segunda passada: 0.                                                                                             |
| Script com `--company` de outra empresa            | Só aquela empresa; a contagem das outras não muda (prova no teste).                                             |
| Pacote rebaixado depois (rollback do bump)         | Mensagens novas voltam a gravar o ponto; nada já redigido volta. Rollback seguro, sem perda de dado do produto. |

## Critérios de aceite

- **CA1** (pacote) Teste do webhook com a opção ligada: linha gravada sem `payload.location`, `content`
  sem rótulo, `type = 'location'`; gancho recebe `location` inteira. Com a opção desligada: igual à
  `0.7.0`. Inclui teste de **ligação** por `createMetaWhatsAppModule({ features: {
redactInboundLocation: true } })` + `module.webhook.receive`. Mutações: ignorar a opção no caso de uso
  reprova; ignorar a opção **na fábrica** reprova.
- **CA2** (pacote) Teste de integração em Postgres descartável com as migrations do pacote (roda de fato,
  sem pular). Sementes da empresa A antes do corte: só-location; location + `referredProduct`; texto;
  location já sem `payload`; location com `payload` escalar string (`to_jsonb(payload::text)`); mensagem
  de **saída** com location. A depois do corte: 1 localização. B antes do corte: 1 localização.
  Afirmações: `count = { counted: 2, unreachable: 1 }`; `batchSize: 1` → 1, 1, 0; só-location fica
  `payload NULL` e `content = INBOUND_LOCATION_CONTENT`; `referredProduct` preservado; posterior ao corte,
  B, texto, saída e escalar intactos; `jsonb_typeof(payload)` nunca `'string'` após a redação; 2ª passada 0.
  Mutações: tirar `company_id` (B cai), tirar `created_at <` (a posterior cai), `payload - 'location'` →
  `NULL` (`referredProduct` some), tirar o `NULLIF` (`payload` vira `{}`), tirar `direction` (a saída cai).
- **CA3** (API) `whatsapp-driver-flow-actions.integration.ts` (webhook real pelo resolver de verdade,
  `:616`) passa a afirmar, além do `captured` da 196, que a linha em `meta_whatsapp.messages` não tem
  `payload.location`. **Falso verde a evitar:** o webhook atual (`:361-370`) manda `location` **sem**
  `name`/`address`, e na `0.7.0` o `content` já sai `'📍 Localização'`; a asserção de rótulo não ficaria
  vermelha. A fixture precisa de `name`, `address` e `url`; a consulta filtra pela empresa do teste e
  afirma `NOT (payload ? 'location')` (ou `payload IS NULL`) e `jsonb_typeof(payload) IS DISTINCT FROM
'string'`. Mutação: tirar a opção do resolver reprova.
- **CA4** (API) Contrato do script: sem `--confirm` não escreve; sem `--company` recusa; saída sem
  dígito de coordenada nem telefone.
- **CA5** Painel com o texto novo (D5) em pt-BR e `en`; nenhum outro texto muda.
- **CA6** `docs/SECURITY.md` move a pendência "coordenada do transcript" para resolvida com data e a
  evidência; registra como aberta a retenção do transcript inteiro; ADR-0081 ganha emenda curta.

## O que esta spec não decide sozinha

- **Publicar o pacote no npm** (T1.5): afeta todos os hosts do módulo; parada humana.
- **Deploy** em qualquer ambiente; produção só com aprovação humana.
- **Redigir o legado** (T3.3): apagar dado pessoal é irreversível; o usuário aprova por ambiente, vendo
  a contagem do dry-run.
- **Divergência entre a fonte do pacote e o tarball `0.7.0`** (T1.1): não se publica a partir de fonte
  que não é a publicada.
- **Qualquer migration** que a implementação venha a achar necessária (nenhuma prevista).
- **A retenção do transcript inteiro** (texto, telefone): fica registrada como pendência aberta, não é
  decidida aqui.

## Riscos

- **Checkout principal do repositório de pacotes não serve.** `origin/main` já está em `0.7.0` e é
  idêntico ao tarball (conferido na T1.1: 37/37 arquivos, 11/11 migrations, 73/73 exports). Quem está
  atrás é o checkout principal (branch de feature + árvore suja de outra sessão): a Fase 1 roda em
  `git worktree add` a partir de `origin/main`, nunca no checkout principal.
- **Escrita irreversível no legado.** Mitigado por dry-run padrão, por empresa, com contagem antes e
  aprovação do usuário. Resíduo: o que estiver em backup e no staging espelhado até a próxima rotação.
- **Outro host do pacote quer o ponto no transcript.** Por isso a opção nasce desligada (padrão da
  `0.7.0`); só a transportada liga.
- **Rótulo "📍 Localização" duplicado.** A string aparece no pacote em dois caminhos (ingest e redação):
  vira constante única no pacote, para o legado e o novo ficarem idênticos.
- **Publicação do npm que cai em 404 por propagação** (memória de sessões anteriores): conferir pelo
  tarball antes de subir o bump.
