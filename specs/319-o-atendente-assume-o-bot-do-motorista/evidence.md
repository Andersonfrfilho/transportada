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
