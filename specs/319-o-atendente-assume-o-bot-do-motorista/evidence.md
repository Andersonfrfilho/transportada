# Evidência — 319

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
