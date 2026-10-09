/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Rotas de conversa de ocorrência da API de demonstração do motorista (spec 260). **Só para
 * preview**: repositório em memória, espelhando `me-occurrence-conversation.routes.ts` da API real.
 * Importável sem efeito colateral — quem sobe o servidor é `driver-preview-api.ts`.
 */
import {
  buildSeedConversations,
  DRIVER_AUTHOR,
  OFFICE_AUTHOR,
  type PreviewAttachment,
  type PreviewConversation,
  type PreviewMessage,
} from './driver-preview-conversations-seed'

export const OFFICE_REPLY_DELAY_MS = 4000
const DEFAULT_FAIL_STATUS = 503

export type SendMessageInput = Readonly<{
  attachmentIds: readonly string[]
  body: string
  idempotencyKey: string
  occurrenceId: string
}>

export type SendMessageResult = Readonly<{
  isReplay: boolean
  messageId: string
}>

export type ConversationRepository = Readonly<{
  failNext: (input: Readonly<{ count: number; status?: number }>) => void
  injectOfficeMessage: (
    input: Readonly<{ occurrenceId: string; text: string }>,
  ) => string | undefined
  list: () => readonly Record<string, unknown>[]
  markRead: (occurrenceId: string) => boolean
  messages: (occurrenceId: string) => readonly PreviewMessage[] | undefined
  registerUpload: (
    input: Readonly<{ contentType: string; fileName: string; sizeBytes: number }>,
  ) => string
  reset: () => void
  /** `undefined` = ocorrência desconhecida; `number` = falha simulada (status HTTP). */
  send: (input: SendMessageInput) => SendMessageResult | number | undefined
}>

export function createConversationRepository(now: () => number = Date.now): ConversationRepository {
  let conversations = buildSeedConversations(now())
  let replies = new Map<string, SendMessageResult>()
  let uploads = new Map<string, PreviewAttachment>()
  let pendingFailure: { count: number; status: number } = { count: 0, status: DEFAULT_FAIL_STATUS }

  const find = (occurrenceId: string): PreviewConversation | undefined =>
    conversations.find((conversation) => conversation.occurrenceId === occurrenceId)

  function append(
    conversation: PreviewConversation,
    message: Omit<PreviewMessage, 'createdAt' | 'id' | 'status'>,
  ): string {
    const id = crypto.randomUUID()
    conversation.messages.push({
      ...message,
      createdAt: new Date(now()).toISOString(),
      id,
      status: 'sent',
    })
    return id
  }

  function send(input: SendMessageInput): SendMessageResult | number | undefined {
    const conversation = find(input.occurrenceId)
    if (conversation === undefined) return undefined
    const replay = replies.get(`${input.occurrenceId}:${input.idempotencyKey}`)
    if (replay !== undefined) return { ...replay, isReplay: true }
    if (pendingFailure.count > 0) {
      pendingFailure.count -= 1
      return pendingFailure.status
    }
    const attachments = input.attachmentIds.flatMap((id) => uploads.get(id) ?? [])
    const messageId = append(conversation, {
      attachments,
      authorName: DRIVER_AUTHOR,
      bodyText: input.body,
      direction: 'inbound',
      isUnread: false,
    })
    const result = { isReplay: false, messageId }
    replies.set(`${input.occurrenceId}:${input.idempotencyKey}`, result)
    return result
  }

  return {
    failNext(input) {
      pendingFailure = { count: input.count, status: input.status ?? DEFAULT_FAIL_STATUS }
    },
    injectOfficeMessage(input) {
      const conversation = find(input.occurrenceId)
      if (conversation === undefined) return undefined
      return append(conversation, {
        attachments: [],
        authorName: OFFICE_AUTHOR,
        bodyText: input.text,
        direction: 'outbound',
        isUnread: true,
      })
    },
    list: () =>
      conversations.map((conversation) => ({
        lastMessageAt: conversation.messages.at(-1)?.createdAt ?? null,
        occurrenceId: conversation.occurrenceId,
        occurrenceLabel: conversation.occurrenceLabel,
        unreadCount: conversation.messages.filter((message) => message.isUnread).length,
      })),
    markRead(occurrenceId) {
      const conversation = find(occurrenceId)
      if (conversation === undefined) return false
      for (const message of conversation.messages) message.isUnread = false
      return true
    },
    messages: (occurrenceId) => find(occurrenceId)?.messages,
    registerUpload(input) {
      const id = crypto.randomUUID()
      uploads.set(id, { ...input, id })
      return id
    },
    reset() {
      conversations = buildSeedConversations(now())
      replies = new Map()
      uploads = new Map()
      pendingFailure = { count: 0, status: DEFAULT_FAIL_STATUS }
    },
    send,
  }
}
