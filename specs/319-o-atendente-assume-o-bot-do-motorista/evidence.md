# Evidência — 319

## T1 — Spike: envio livre pelo número do bot e o `fromMe` do webhook (lido em `origin/staging` `4f4ce8f`)

Somente leitura: código da API, SDK `@adatechnology/evolution-whatsapp-provider` 0.3.0 (`dist/index.js`) e logs de staging
(serviços `evolution-api` e `api`, Evolution 2.3.7) lidos pela ferramenta do Railway em 10/11/2026. Nada foi enviado.

### Conclusão

1. **O envio de texto livre funciona para grupo e para privado, pelo mesmo caminho do bot.** O destino passa por
   `resolveEvolutionDestination` do SDK: `…@g.us` vai como está; qualquer outro valor vira só dígitos. Então
   `<grupo>@g.us` e `<número>@s.whatsapp.net` servem, e o ritmo do número (spec 289) vale igual.
2. **`groupReplies.send` não serve como está para o atendente.** Ele é "dispara e esquece": não devolve o id do
   provedor, engole o erro (só `whatsapp_group_request.reply_failed` em log) e junta o texto no turno do bot. A T6 deve
   chamar o `sendText` de `createEvolutionDocumentSender` direto, com o mesmo pacer.
3. **A mensagem digitada no celular do bot chega ao nosso webhook como `messages.upsert` com `fromMe: true`** (visto em
   staging). Hoje o webhook a descarta: no privado sem log do id, no grupo com `outcome: from_me`.
4. **Ainda não confirmado: se o envio feito pela API volta como `messages.upsert`.** O SDK não assina `SEND_MESSAGE`,
   e os logs não deram prova nos dois sentidos. O desenho abaixo não depende disso. O script de leitura no fim desta
   nota responde de vez.

### 1. Envio (RF3, T6)

| Peça                       | Onde                                                                                    | O que vale para a 319                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destino                    | SDK `resolveEvolutionDestination` (`isEvolutionGroupJid` = `^\d+(-\d+)?@g\.us$`)        | Grupo vai como JID; privado vira dígitos (`5516…@s.whatsapp.net` → `5516…`).                                                                                                                                           |
| Texto com o id do provedor | `evolution-document-sender.gateway.ts` `sendText`                                       | Devolve `{ providerMessageId }` (`key.id`) e lança `ContractorReplyWhatsAppSendError` com `disconnected` (401/403/404, rede, instância fora de `active`), `number_not_found` (400) ou `failed` (5xx e pacer sem vaga). |
| Ritmo do número (289)      | `createEvolutionSendPacer` + `createDrizzleEvolutionSendSlotClaimer`                    | Vaga em `whatsapp_evolution_settings.next_send_at`, dividida entre API e worker. O bot no grupo usa `maxWaitMs: 120_000` (`main.ts`); as rotas do painel usam `20_000`.                                                |
| Resposta do bot            | `evolution-group-reply.gateway.ts` (`createEvolutionGroupReplySender`)                  | `send` devolve `void`, fila por empresa, erro só em log, corte em 4000 caracteres (`chunkWhatsAppTexts`), turno com chave `${companyId}\|${groupJid}` e marca `@número` só em `@g.us`.                                 |
| Marca no grupo             | `evolution-mention-text.gateway.ts`                                                     | Só se o atendente quiser marcar alguém; o envio livre não precisa.                                                                                                                                                     |
| Status depois do envio     | webhook `messages.update` → `inbound.receiveStatus` (`applyProviderMessageStatus`, 281) | Chega pelo `key.id`. Staging mostra o par: cada envio gera um `webhook.received` com `statuses: 1`.                                                                                                                    |

**Recomendação para a T6:**

- Porta própria `sendOperatorText({ companyId, chatJid, body })` sobre `createEvolutionDocumentSender({ pacer, repository, secrets }).sendText`, com o mesmo `createDrizzleEvolutionSendSlotClaimer`. Não reaproveitar `groupReplies.send`, pelo item 2.
- Duas fases, como no boleto da 281 T5. Primeiro grava a mensagem `queued` no histórico. Depois envia fora da transação e fecha `sent` com o `providerMessageId`, ou `failed` com o motivo. O reenvio usa a mesma linha.
- O pacer pode segurar o envio por segundos. A rota responde 202 com a linha `queued`, e o envio corre depois da resposta (o mesmo motivo do bot: o envio sai fora do webhook).
- Teto de 4000 caracteres no schema da rota, porque o `sendText` direto não corta o texto.
- O status (`messages.update`) precisa casar também com `whatsapp_chat_messages.provider_message_id`, além das tabelas da 281.

**Armadilha: o privado tem que ser endereçado pelo número, nunca pelo `@lid`.** Um JID `…@lid` viraria "só dígitos"
no SDK e iria para um número que não existe, ou para o de outra pessoa. A chave do chat privado é o número que o
SDK já resolve (`senderOf`: `remoteJidAlt`/`senderPn` quando o `remoteJid` é `@lid`). O chat que chega só com
`@lid` (contador `lidOnly` do webhook) não entra na caixa.

### 2. O `fromMe` no webhook (RF2, RF4, P2/T9)

**Eventos assinados:** `DEFAULT_WEBHOOK_EVENTS` do SDK = `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`
(`setWebhook` sem `events`). `SEND_MESSAGE` **não** é assinado.

**Como o parser entrega:** `parseEvolutionWebhook` lê `fromMe` de `key.fromMe`, o `chat` do `remoteJid` (com troca de
`@lid` por `remoteJidAlt`/`senderPn`) e **descarta `source`** (`android`/`ios`/`web`/`unknown`). Para ler `source`, seria
preciso ler o corpo cru, como `readGroupMedia` já faz.

**O que o webhook faz hoje com `fromMe`** (`whatsapp-evolution-webhook.use-case.ts`):

- Privado (`chat === 'user'`): os dois ramos exigem `!event.fromMe`, então a mensagem cai no `else` e conta em
  `ignored`, sem log do id.
- Grupo: não há guarda de `fromMe` no ramo; `groupInbound.receive` devolve `from_me` antes de `findGroupDriver`, e o
  log `whatsapp_evolution.group_message` sai com `outcome: from_me` e o `providerMessageId`.
- `receiveDirect` e `receiveDirectImporter` também devolvem `from_me` logo de início.

**Observado em staging (04/11/2026 14:09:38 UTC):** uma mensagem digitada no celular do número do bot (Android), num
chat privado, apareceu no `evolution-api` com `fromMe: true`, `source: 'android'`, `remoteJid` `…@s.whatsapp.net` com
`remoteJidAlt` igual e `key.id` de 32 hexadecimais (`AC37…`). No mesmo segundo a `api` registrou um
`whatsapp_evolution.webhook.received` com `ignored: 1` (o `fromMe` do privado), seguido de um com `statuses: 1`.
Conclusão: o que o atendente digita no celular (ou no WhatsApp Web do número do bot) chega como `messages.upsert`
`fromMe: true`.

**`source` não separa o painel do humano.** Os ids gerados pelo Baileys (envio pela API) começam com `3EB0`, e o
Evolution os rotula `source: 'web'`. É o mesmo rótulo do WhatsApp Web usado por uma pessoa. Em staging, mensagens
`3EB0…` com `source: 'web'` vinham do WhatsApp Web do Anderson (`fromMe: false`).

**Recomendação para T3, T4 e T9:**

- **Histórico (T4):** gravar a mensagem do bot e a do atendente **na hora do envio**, com o `providerMessageId`, e não
  esperar o eco do webhook. O eco, se vier, é deduplicado pelo `provider_message_id` (único por empresa), como o plano já prevê.
- **Webhook (T3/T4):** o ramo do privado precisa de um caminho para `fromMe` (hoje vai para o `else`). No grupo, gravar
  antes do `return 'from_me'`, só para grupo cadastrado.
- **Assumir pelo celular (T9):** "`fromMe` que não saiu do painel" = `fromMe: true` cujo `key.id` **não** está em
  `whatsapp_chat_messages.provider_message_id` da empresa. Isso vale com ou sem eco do envio da API. Corrida: o eco
  pode chegar antes de o envio gravar o id. Por isso a fase 1 da T6 grava a linha `queued` antes de chamar o Evolution,
  e a T9 deve tratar `fromMe` de um chat com envio `queued` recente como do painel. Não usar `source`.
- **Respostas do próprio bot:** o fluxo já ignora `fromMe` em todos os trilhos. A guarda de "assumido" (T3) não muda isso.

### 3. Pendente: o eco do envio da API

Os logs de staging não provaram nem um lado nem o outro. A busca `fromMe: true` no `evolution-api` desde 03/11 achou
uma única ocorrência (a do celular, acima), e a do grupo não apareceu com `from_me` nas janelas lidas. O Evolution v2
costuma avisar o envio pela API só em `SEND_MESSAGE`, que não assinamos. Para fechar a dúvida, há um script de leitura
para staging, `staging-319-t1-envio-livre.sh`. Ele roda `GET /webhook/find` e `POST /chat/findMessages` com
`fromMe: true`, de dentro do container da `api`, e mostra id, `source`, tipo do chat e status, sem texto nem número. Com
os ids, procura-se no log da `api` se algum `3EB0…` do bot aparece como `group_message` `from_me`.

- Se aparecer: o eco existe, e a deduplicação por `provider_message_id` (já no plano) basta.
- Se não aparecer: o histórico do bot só existe se for gravado no envio (o que a recomendação acima já manda).

Nenhum dos dois resultados muda T2–T6. Só muda um teste da T9 (o eco que chega antes da gravação).

## T7b — Spike do SDK `@adatechnology/conversations-ui` 0.14.0

Fonte lida: o pacote publicado `@adatechnology/conversations-ui@0.14.0` (a última versão no npm em 10/11/2026, a
mesma do `apps/frontend-transportada/package.json`) e `@adatechnology/conversation-contracts@0.7.0`. O pacote traz o
`src/`, então tudo abaixo cita o arquivo do SDK.

### Resposta curta

**O botão Assumir/Devolver existe no SDK, mas não na camada que a 319 usa.** Ele mora na camada clássica da caixa de
entrada (`ConversationHeader`, `ConversationsWorkspace`, `ConversationsApi`), que é outro modelo de conversa (por número
de WhatsApp, com `mode: 'bot' | 'human'`). O `ConversationThread` de `@adatechnology/conversations-ui/participant`, que
o painel já usa na ocorrência e que a RF5 manda usar, **não tem** assumir/devolver nem o conceito de "modo". O que ele
tem são os dois encaixes que o painel precisa para pôr o botão do jeito certo: `headerActions` e `renderComposerLock`.

### O que existe na camada clássica (raiz do pacote)

| Peça               | Onde no SDK                                  | Contrato                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão no cabeçalho | `ConversationHeader.tsx` (exportado na raiz) | `onTakeover?()`, `onReturnToBot?()`, `onFinish?()`, `busy?`. Mostra "Assumir atendimento" quando `conversation.mode !== 'human'` e "Devolver ao bot" (+ "Finalizar") quando `mode === 'human'`. Selo de modo "atendimento automático" / "atendimento humano". Rótulos trocáveis por `labels`. No celular ou faixa estreita, as ações vão para o menu ⋮. Presentacional: o host passa os handlers. |
| Porta da API       | `providers/types.ts` `ConversationsApi`      | `takeover?(conversationId): Promise<void>`, `release?(conversationId): Promise<void>`, `finalize?(conversationId)`. Opcionais por capacidade: sem a função, sem botão.                                                                                                                                                                                                                            |
| Hook               | `hooks/useConversationActions.ts`            | `useConversationActions(id)` devolve `{ takeover, release, finalize }` ou `undefined`; exige `<ConversationsProvider>`.                                                                                                                                                                                                                                                                           |
| Trava do campo     | `workspace/ConversationPane.tsx`             | `requireTakeoverToReply`: com o chat no bot, o campo vira o aviso "Assuma o atendimento para responder diretamente ao cliente."                                                                                                                                                                                                                                                                   |
| Linha da lista     | `ConversationRow.tsx`                        | Botão "Continuar Atendimento" (`onTakeover`).                                                                                                                                                                                                                                                                                                                                                     |
| Tempo real         | `providers/types.ts`                         | Evento `mode-changed` no stream SSE.                                                                                                                                                                                                                                                                                                                                                              |
| Resumo             | `ConversationSummary`                        | `mode`, `assignedUserId`, `waitingHuman`, `whatsappNumber` (obrigatório, marcado `@deprecated`), `currentState`, `lastInboundAt`.                                                                                                                                                                                                                                                                 |

O contrato **não tem**: quem assumiu (nome), vencimento, motivo da devolução, nem um erro tipado de "já assumido por X"
(o `takeover` só rejeita a promessa).

### Por que não usar a camada clássica na 319

1. O `ConversationHeader` é feito para o `ConversationPane`; ao lado do `ConversationThread` ficariam dois cabeçalhos,
   com estilos de famílias diferentes (`cv-header` × tema do participant).
2. Ele pede um `ConversationSummary` clássico (número de WhatsApp obrigatório, `currentState`, `waitingHuman`), que não
   cabe num chat de grupo por JID e repetiria o número do motorista na tela e no estado.
3. Trocar o fio inteiro para `ConversationsWorkspace` jogaria fora o que o painel já padronizou na ocorrência
   (`perspective="operator"`, menu da mensagem, áudio, pendentes) e fugiria da RF5.

### O que o `ConversationThread` (participant) já cobre para um chat por JID

| Necessidade da 319          | Cobertura no 0.14                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assunto do chat             | `subject = { subjectType, subjectId }`; `subjectType` casa `^[a-z][a-z0-9_-]{0,63}$` e `subjectId` vai até 128. Sugestão: `whatsapp_group` e `whatsapp_direct` com o **id interno** do chat (não o JID nem o telefone, para não levar número para URL e log). |
| Fio e paginação             | `api.fetchMessages(subject, { before, limit })`.                                                                                                                                                                                                              |
| Composer (texto e arquivo)  | `api.sendMessage({ subject, clientMessageId, text, files })`; `clientMessageId` serve de Idempotency-Key e o reenvio repete o mesmo id. Áudio é opcional (`audioRecording`), fica para a T10.                                                                 |
| Falhou / reenviar           | Lançar no `sendMessage` mostra o reenvio; fila durável por `pendingMessages` + `onRetryPending`.                                                                                                                                                              |
| Enviado / lido              | `ParticipantMessage.status` (`queued`, `sent`, …) e `readAt`; `markRead(subject)` + `onMarkedRead`.                                                                                                                                                           |
| Menu da mensagem            | `messageMenu` (copiar, selecionar, itens do host).                                                                                                                                                                                                            |
| Quem escreveu               | `ParticipantMessage.authorName` por mensagem (serve para o grupo, com vários autores) e `avatars="initials"`.                                                                                                                                                 |
| Tempo real                  | `api.subscribe(listener)` com `conversation-changed`.                                                                                                                                                                                                         |
| Respostas rápidas           | `quickReplies` (chips que preenchem o texto).                                                                                                                                                                                                                 |
| Botões do host no cabeçalho | `headerActions: ReactNode`.                                                                                                                                                                                                                                   |
| Trocar o campo por aviso    | `renderComposerLock(conversation) => ReactNode \| undefined`, avaliado a cada render.                                                                                                                                                                         |
| Lista de chats              | `ParticipantConversations` (lista + conversa) agrupa e filtra **por `subjectType`** (dá "Grupos" × "Privado"). Filtro por estado (bot / assumidos / não lidos) não existe: vira `filter-pills` do painel.                                                     |

### O que falta no participant (pedidos ao SDK)

1. **Assumir/devolver na camada participant**: `takeover?(subject)` e `release?(subject)` opcionais no
   `ConversationThreadApi`, `mode` e `assignee` no `ParticipantConversationSummary`, e o botão e a trava do campo
   desenhados pelo próprio `ConversationThread` (mesmos rótulos do `ConversationHeader`).
2. **Erro tipado de conflito**: "já assumido por X" para o assumir atômico (caso extremo da spec).
3. **Prévia antes de enviar (RF3b)**: um gancho `confirmSend?(input) => Promise<boolean>` antes do `sendMessage`. Hoje o
   composer chama o `sendMessage` direto; recusar ali lançando erro marca a mensagem como falha, o que é errado.
4. **Papel do autor**: distinguir bot × atendente × participante numa mensagem `outbound` (hoje só `direction` +
   `authorName`).
5. **Filtro por atributo na lista**: filtrar `ParticipantConversations` por `attributes` (estado), não só por `subjectType`.

### Recomendação para a T8

- Fio, composer, menu, lido/enviado e reenvio: `ConversationThread` com `perspective="operator"`, igual à ocorrência.
- **Assumir/Devolver**: botão padrão do painel (`src/components/ui/`) no `headerActions`, com os rótulos do SDK
  ("Assumir atendimento" / "Devolver ao bot") e quem atende ao lado. Com o chat no bot, `renderComposerLock` troca o
  campo pelo aviso "Assuma o atendimento para responder" com o botão Assumir, no padrão das faixas da ocorrência.
- No adaptador do painel, chamar as funções de `takeover`/`release` com esses nomes, para a troca pelo SDK (pedido 1)
  ser só apagar a faixa provisória.
- Bot × atendente no fio: `authorName` ("Bot" ou o nome do atendente) até sair o pedido 4.
- Prévia (T6b): abrir o diálogo **antes** de entregar o texto ao composer não é possível hoje; a T6b decide entre um
  botão "Enviar com prévia" no `renderComposerLock`/cabeçalho ou esperar o pedido 3. Recomendo esperar o pedido 3 e,
  enquanto isso, mostrar o destino (grupo ou privado, remetente = bot) fixo acima do campo.

## T2 — Domínio e migration (branch `work/319-t2-dominio`, sobre `origin/staging` `4f4ce8f`)

Lido antes: a nota da T1 (PR #682, `work/319-t1-spike-envio`) e a da T7b (PR #680). As decisões abaixo seguem a T1:
privado endereçado pelo número (nunca `@lid`), histórico gravado na hora do envio, eco deduplicado pelo
`provider_message_id`, envio em duas fases (`queued` antes de chamar o Evolution).

### O que entrou

| Peça                        | Onde                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Vocabulário                 | `src/whatsapp-inbox/domain/whatsapp-chat.constant.ts`                                     |
| JID que entra na caixa      | `domain/whatsapp-chat-jid.policy.ts` (`classifyWhatsAppChatJid`, `directWhatsAppChatJid`) |
| Quem atende, assumir, prazo | `domain/whatsapp-chat-takeover.policy.ts`                                                 |
| Status que só avança        | `domain/whatsapp-chat-message.policy.ts`                                                  |
| Erros                       | `domain/whatsapp-chat.error.ts` (404, 409 com quem segura, 400 JID)                       |
| Porta                       | `application/whatsapp-chat.port.ts`                                                       |
| Serviço                     | `application/whatsapp-chat-takeover.service.ts` (`createWhatsAppChatTakeoverService`)     |
| Repositório                 | `infrastructure/drizzle-whatsapp-chat.repository.ts`                                      |
| Schema                      | `src/database/whatsapp-chat.schema.ts`; coluna nova em `whatsapp-evolution.schema.ts`     |
| Migration                   | `drizzle/20261110224844_whatsapp_chats` (aditiva, com `rollback.sql` que recusa dado)     |

**Tabelas.**

- `whatsapp_chats`: um por `(company_id, chat_jid)`; `kind` `group`|`direct` casado com o JID por CHECK (`…@g.us` ou
  `<8–15 dígitos>@s.whatsapp.net`; `@lid` não entra); `state` `bot`|`operator`; com `operator`, dono
  (`taken_over_by_user_id`, FK para o vínculo da mesma empresa), início e vencimento obrigatórios; devolução com
  `release_reason` `manual`|`expired`, hora e quem devolveu (só na manual); `last_message_at`/`last_inbound_at`/`read_at`
  para a lista e o "não lido". Índice parcial do vencimento só nos assumidos.
- `whatsapp_chat_messages`: autor `driver`|`member` (recebida, sem status) ou `bot`|`operator`|`phone` (enviada, com
  status `queued`→`sent`→`delivered`→`read` ou `failed` com motivo `disconnected`|`number_not_found`|`failed`);
  `operator` exige `author_user_id` e texto de 1 a 4000; `sender_phone` só na recebida; `provider_message_id` único por
  empresa (índice parcial). FK composta para o chat, com `company_id`.
- `whatsapp_evolution_settings.chat_takeover_timeout_seconds` (padrão 1800, de 300 a 28800): o prazo da RF6 por empresa.
- Staging-refresh: as duas tabelas novas são `empty` (conversa é dado pessoal).

**Assumir atômico.** `takeOver` é um `UPDATE … WHERE state = 'bot' OR expires_at <= now OR taken_over_by = eu`. No
READ COMMITTED, o segundo `UPDATE` espera o primeiro e reavalia o `WHERE` na linha nova: perde e recebe `held` com
quem segura e até quando (o serviço transforma em `409 WHATSAPP_CHAT_ALREADY_TAKEN_OVER` com
`takenOver { userId, expiresAt }`). O próprio atendente renova sem trocar o início.

**Vencimento.** Duas formas, como o plano pede: na leitura (`resolveWhatsAppChatAttendance` trata `operator` vencido como
`bot`, então a guarda da T3 já cala/religa certo) e em lote (`expireDue`, CTE com `for update skip locked`, grava
`expired` e devolve empresa, chat e quem segurava para a T7 avisar). `touch` empurra o prazo a cada mensagem do
atendente e devolve `null` se ele não segura mais.

### Para as próximas tasks

- **T3 (guarda):** `service.attendanceOf({ companyId, chatJid })`. `kind: 'operator'` = não responder nem avançar
  fluxo, só gravar. Chat que não existe é `bot`. O JID do privado sai de `directWhatsAppChatJid(número)`.
- **T4 (histórico):** `service.ensureChat` + `repository.appendMessage`. Eco e reentrega voltam `duplicate` sem mexer
  em nada. `bot`/`phone` nascem `sent`; o `operator` nasce `queued`.
- **T5 (rotas):** `takeOver`/`release`/`ensureChat` lançam `ApiError` prontos (404, 409, 400). Auditoria e permissão
  ficam na T5.
- **T6 (envio):** `appendMessage({ author: 'operator', … })` (fase 1), depois `updateMessageStatus` com `messageId` e
  `providerMessageId` (`sent`) ou `failed` + motivo; reenvio = `failed → queued` na mesma linha; `touch` empurra o prazo.
  O status do webhook entra com `updateMessageStatus({ providerMessageId, status })`, que só avança.
- **T7 (job):** `service.expireDue({ limit })`.

### Testes

Postgres 16 local (`.env.test`), Bun 1.4.4.

- Contrato novo `test/whatsapp-inbox.contract.test.ts` (domínio, serviço com dublê, separação da ocorrência e
  `companyId` em toda consulta do repositório): **17 pass, 0 fail**.
- Contrato estático da migration `test/database-migration/whatsapp-chats.static.contract.ts`, no
  `database-migration.contract.test.ts`: **215 pass, 4 skip, 0 fail** (o `schema-snapshot` incluído).
- Integração nova `test/integration/whatsapp-chat-repository.integration.ts`: **11 pass, 0 fail** (dois atendentes ao
  mesmo tempo, renovar, devolver, vencer em lote uma vez, eco deduplicado, status que só avança, CHECKs, isolamento por
  empresa, prazo da empresa).
- `bun run test` da API inteira: **14 949 pass, 1 fail** na primeira rodada (o contrato do staging-refresh cobrando
  política para as tabelas novas); corrigido em `prune-source.sql`, `test/deploy.contract.test.ts` **214 pass**.
- Rollback à mão num banco migrado: recusa com chat gravado (`whatsapp_chats has 1 rows; refusing…`) e, vazio, remove
  as tabelas, a coluna e a linha do journal.
- `tsc --noEmit`, `eslint` dos arquivos tocados e `prettier --check` limpos.

## T5 — Rotas da caixa de conversas (sonnet)

Postgres 16 local, Bun 1.4.4.

- Rotas (`GET /whatsapp-inbox/chats`, `GET …/chats/:id/messages`, `POST …/take-over|release|read`) com a permissão
  `occurrences.resolve`, a mesma de quem atende a conversa da ocorrência: a caixa não criou permissão nova para não
  mexer na lista de papéis (que o painel compara em ordem). `companyId` e `userId` vêm só do contexto.
- A resposta é de formato fechado: a lista não leva JID nem telefone, o histórico não leva `provider_message_id` nem
  `sender_phone` (a tela endereça pelo id interno, como a T7b recomendou). `unread` é derivado
  (`last_inbound_at > read_at`).
- Query e cursor com o mesmo padrão do resto da API (`readListQuery`, `readPaging`); chave desconhecida ou valor fora da
  lista é 400, `:id` que não é uuid canônico nem casa a rota (404, do roteador).
- Auditoria (`whatsapp_chat.taken_over` / `whatsapp_chat.released`, antes/depois do estado) só quando o estado muda:
  renovar o próprio prazo e devolver o que já está com o bot não gravam.
- `test/whatsapp-inbox/inbox-routes.contract.ts` (8 testes) e `test/integration/whatsapp-inbox-list.integration.ts`
  (4 testes: lista da empresa com filtro e cursor, não lido, histórico paginado, auditoria) — ambos nas listas do
  `package.json`. Rodada inteira da API: **14 975 pass, 35 skip, 0 fail**; `tsc`, `eslint` e `prettier` limpos.
- Fica para a T8 (a tela): nome do motorista/grupo e prévia da última mensagem na lista, que hoje só traz o chat.
  Fica para a T6: o envio (`POST …/messages`).
