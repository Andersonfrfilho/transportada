# Contrato da visão do participante (T0.3 🧠)

> Desenho do `architect` (opus), conferido contra o código do SDK em 2026-10-09. **É o contrato que as
> tasks T1.x e T1b.x implementam** — mudar aqui exige novo passe de arquitetura. Pacote:
> `@adatechnology/conversations-ui/participant`; tipos em `@adatechnology/conversation-contracts`.

## O que a leitura do código mudou no plano

As folhas que o plano mandava reaproveitar (`MessageBubble`, `MessageComposer`, `MediaRenderer`,
`AudioRecorderButton`) são **Tailwind** (`MessageBubble.tsx:52-56` usa `bg-[#d9fdd3]`; 53 e 59 utilitárias
em bolha e composer) e têm **perspectiva de operador** (cor por `sender`, seleção, moderação). Nenhum dos três
apps tem Tailwind (ADR-0051). Logo: a visão do participante tem **bolha e composer próprios em `.cv-p-*`** e
reaproveita só funções puras, `MessageText` e `StatusTicks` (estes dois depois de migrados para `.cv-*`).
Áudio fica **fora da v1**.

## 1. Porta própria, endereçada por assunto — sem `ConversationsProvider`, sem SSE

`ConversationsApi` (~30 métodos, `conversationId`, `sendMedia` em base64) **não muda**. A visão recebe `api`
por prop e cria um contexto interno não exportado.

```ts
export type ParticipantSendInput = {
  readonly subject: ParticipantSubjectRef
  /** Gerado pelo pacote (crypto.randomUUID). O host usa como Idempotency-Key; reenvio repete o mesmo. */
  readonly clientMessageId: string
  readonly text?: string
  readonly files?: readonly File[] // upload em duas etapas é do host (183 T702)
}
export type ParticipantSendResult =
  | { readonly outcome: 'sent'; readonly message: ParticipantMessage }
  | { readonly outcome: 'queued' } // o host guardou na fila offline dele

export type ParticipantConversationEvent =
  | { readonly type: 'inbox-changed' }
  | { readonly type: 'conversation-changed'; readonly subject: ParticipantSubjectRef }

export interface ParticipantConversationsApi {
  listConversations(params?: { readonly cursor?: string }): Promise<ParticipantConversationPage>
  fetchMessages(
    subject: ParticipantSubjectRef,
    params?: { readonly before?: string; readonly limit?: number },
  ): Promise<readonly ParticipantMessage[]>
  /** Lança = falhou; o pacote mostra "falhou — tocar para reenviar" e repete o MESMO clientMessageId. */
  sendMessage(input: ParticipantSendInput): Promise<ParticipantSendResult>
  /** Marca lidas as mensagens da outra ponta DAQUELE assunto (RF3), nunca "todas". */
  markRead(subject: ParticipantSubjectRef): Promise<void>
  resolveAttachmentUrl(
    attachment: ParticipantAttachment,
    disposition?: 'inline' | 'attachment',
  ): Promise<string>
  // Opcionais por ausência de método:
  openConversation?(subject: ParticipantSubjectRef): Promise<ParticipantConversationSummary>
  subscribe?(listener: (event: ParticipantConversationEvent) => void): () => void
}
```

**Contrato do adapter (obrigatório):** (a) toda mensagem criada por `sendMessage` devolve o `clientMessageId`
recebido (o mesmo do `Idempotency-Key`) — é o eco que casa a bolha local com a mensagem do servidor — e o servidor
trata com segurança duas requisições simultâneas com a mesma chave (uma cria, a outra devolve a mesma mensagem);
(b) `api` precisa ter identidade **estável** (adapter criado uma vez, fora do render); (c) o adapter valida a
resposta com `participantConversationPageSchema.parse(...)` e `z.array(participantMessageSchema).parse(...)` e usa
`encodeURIComponent` em todo segmento de URL; (d) `@adatechnology/conversations-ui/styles.css` é requisito.

Sem `subscribe`, a visão revalida em mount, `focus`, `visibilitychange` e `online`.
**`direction` é sempre na perspectiva da empresa**; dentro do pacote `isMine = direction === 'inbound'`.
O adapter do app não inverte nada.

## 2. Tipos no `conversation-contracts` (0.3.0 → 0.4.0, minor aditivo)

`ParticipantSubjectRef { subjectType, subjectId }` (`subjectType` opaco, `^[a-z][a-z0-9_-]{0,63}$`, `subjectId`
até 128 — casa com `requestSchemas.ts:21-22`); `ParticipantConversationSummary` (`subjectLabel`,
`lastMessageAt: string | null`, `lastMessagePreview?`, `lastMessageDirection?`, `unreadCount`,
`awaitingParticipant`, `status: 'open' | 'closed'`, `attributes?` — onde viaja o `tripId`);
`protocol?: string` (D8 — referência legível gerada pelo produto, ex. `261009-K7M2`; o pacote só exibe e copia, nunca gera);
`ParticipantConversationPage { data, nextCursor? }`; `ParticipantMessage` (`id`, `clientMessageId?`,
`direction`, `authorName?`, `text?`, `attachments`, `createdAt`, `status?`, `readAt?`);
`ParticipantAttachment`. Tudo com **schema zod** — a resposta da API é entrada não confiável.
`awaitingParticipant` e `subjectLabel` são **calculados no servidor**, nunca no cliente; o adapter do app
mapeia o `awaitingDriver` da API para `awaitingParticipant`.

`subjectGroups` mora na **UI** (leva `ReactNode` de ícone): `{ subjectType, label, icon? }[]`, a ordem é a do
array. **Regra de seção** (pura, testada na T1.2) — cada conversa cai em exatamente uma, nesta ordem:
`closed` → "Encerradas" (recolhida, no fim) · `awaitingParticipant` → "Espera sua resposta" (topo) · grupo do
`subjectType` · tipo desconhecido → "Outros" (nunca descarta). Dentro da seção: `lastMessageAt` decrescente,
`null` por último, desempate por `subjectLabel`. Filtros por grupo só aparecem com 2+ grupos.

## 3. `ParticipantConversations` — controlada pela rota

```ts
export type ParticipantConversationsProps = {
  api: ParticipantConversationsApi
  subjectGroups: readonly ParticipantSubjectGroup[]
  selected: ParticipantSubjectRef | undefined // undefined = lista
  onSelect: (subject: ParticipantSubjectRef) => void
  onBack?: () => void
  channel?: ConversationChannel // ausente = 'app'; capacidade vem de channelCapabilityFor
  labels?: Partial<ParticipantConversationsLabels> // defaults em inglês, genéricos
  locale?: string
  theme?: ConversationsTheme
  className?: string
  classNames?: Partial<ParticipantConversationsClassNames>
  pendingMessages?: readonly ParticipantPendingMessage[]
  onRetryPending?: (clientMessageId: string) => void
  quickReplies?: readonly QuickReply[] // tocar PREENCHE, nunca envia
  renderSubjectCard?: (conversation: ParticipantConversationSummary) => ReactNode
  onOpenSubject?: (subject: ParticipantSubjectRef) => void
}
```

O app monta o componente **uma vez, acima das duas rotas** (`/conversas` e `/conversas/:subjectType/:subjectId`,
mesmo elemento): o cache da inbox e os rascunhos por conversa (RF6) vivem nele. O sino e o cartão da nota só
**navegam**. Mais de 5 props é desvio deliberado (estilo do pacote; "ausência = capacidade").

## 4. Fila offline sem o pacote conhecer IndexedDB (D5)

O pacote gera o `clientMessageId`; o host decide enviar ou enfileirar (`outcome: 'queued'`); a fila durável
volta por `pendingMessages` (`{ clientMessageId, subject, text?, attachments?, createdAt, state: 'queued' |
'failed' }`). **Fusão** (pura, testada na T1.3): mensagem do servidor › pendente do host (se nenhuma do servidor
tem o mesmo `clientMessageId`) › pendente em memória. Estados da bolha própria: em envio e `queued` → relógio ·
sem status/`sent` → um tique · `delivered` → dois · `read` → dois destacados (só se `confirmsRead`) · `failed`/
`bounced` → alerta + "tocar para reenviar". O canal `app` só alcança `queued/delivered/read`; "enviando" e
"falhou" são **estados locais**.

## 5. Canal e status (T1.0a / T1.0b)

- `ConversationChannel` da UI passa a derivar do contracts (`Core | 'messenger' | 'instagram'`); entradas de
  exibição de `app`/`portal` em `CHANNEL_CAPABILITIES`; `channelCapabilityFor('app')` = 25 MB, grava áudio,
  sem janela; `portal` = `records: false`. Hoje cai na regra do WhatsApp (`channelCapability.ts:31-36`).
- `MessagePayload.status?: MessageDeliveryStatus` (inclui `queued`, `bounced`); `StatusTicks` ganha `queued`
  (relógio) e troca as cores Tailwind por `.cv-status-ticks--{status}`; `MessageText` → `.cv-message-text`.
- Impacto nos consumidores 0.3.1: ampliar uma união que eles só escrevem não quebra; `switch` exaustivo de
  Sakura/quickcart pode — o changeset avisa.

## 6. Versão e publicação

**Minor em `latest`, sem pre mode**: `conversation-contracts` 0.4.0 e `conversations-ui` 0.5.0, mesmo PR. O
pre mode do changesets vale para o repositório inteiro (arrastaria o `whatsapp-preview-de-link.md` alheio), a
dist-tag `rc` está defasada (0.1.0-rc.44) e os consumidores fixam versão exata. A garantia de "três
consumidores juntos" é o **tarball**: `npm pack` dos dois pacotes, `file:` nos três apps em worktree descartável,
`make check` e smoke do painel e do portal **antes** do merge que publica.

## 7. O que NÃO fazer

Não usar `ConversationPane`, `ConversationsWorkspace`, `ConversationsProvider`, `useConversationMessages`,
`useConversationRealtime` nem nada de `workspace/`, `documents/`, `flows/`; não importar `@xyflow`; não
importar do barril `src/index.ts` dentro de `src/participant/**`; não pôr palavra do TMS no pacote; não
calcular `awaitingParticipant`/`subjectLabel` no cliente; sem flag `hasX`; sem mídia em base64; sem
`Idempotency-Key` nem IndexedDB no pacote. `markRead` só com a conversa em foco **e**
`document.visibilityState === 'visible'`. Os `.cv-p-*` viram API pública (prefixo `cv-p-`, BEM, nomes
congelados desde a 0.5.0). O `buildOutput.test.ts` afirma que `dist/participant` não tem `xyflow`, não tem o
símbolo `ConversationsWorkspace` e fica abaixo de **250 KB** minificado.
