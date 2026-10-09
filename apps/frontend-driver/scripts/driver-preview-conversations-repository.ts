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
  PREVIEW_TRIP_ID,
  toProtocol,
} from './driver-preview-conversations-seed'
import {
  OPENABLE_PREVIEW_SUBJECTS,
  randomProtocolSuffix,
} from './driver-preview-conversations-subjects'
import type {
  PreviewAttachment,
  PreviewConversation,
  PreviewMessage,
  PreviewSubjectType,
} from './driver-preview-conversations.types'

export const OFFICE_REPLY_DELAY_MS = 4000
const DEFAULT_FAIL_STATUS = 503

export type SendMessageInput = Readonly<{
  attachmentIds: readonly string[]
  body: string
  idempotencyKey: string
  subjectId: string
}>

export type SendMessageResult = Readonly<{
  isReplay: boolean
  messageId: string
}>

type OpenConversationResult = Readonly<{ isNew: boolean; summary: Record<string, unknown> }>

export type ConversationRepository = Readonly<{
  failNext: (input: Readonly<{ count: number; status?: number }>) => void
  has: (input: Readonly<{ subjectId: string; subjectType: PreviewSubjectType }>) => boolean
  injectOfficeMessage: (input: Readonly<{ subjectId: string; text: string }>) => string | undefined
  /** Rota antiga: só ocorrência, `{ occurrenceId, occurrenceLabel, ... }`. */
  list: () => readonly Record<string, unknown>[]
  /** Rota por assunto: todos os assuntos, no formato do `api-contract.md`. */
  listSummaries: () => readonly Record<string, unknown>[]
  markRead: (subjectId: string) => boolean
  /** O escritório leu: as mensagens do motorista desta conversa viram `read`. */
  markOfficeRead: (subjectId: string) => boolean
  open: (
    input: Readonly<{ subjectId: string; subjectType: PreviewSubjectType }>,
  ) => OpenConversationResult | undefined
  messages: (subjectId: string) => readonly PreviewMessage[] | undefined
  registerUpload: (
    input: Readonly<{ contentType: string; fileName: string; sizeBytes: number }>,
  ) => string
  reset: () => void
  /** `undefined` = ocorrência desconhecida; `number` = falha simulada (status HTTP). */
  send: (input: SendMessageInput) => SendMessageResult | number | undefined
}>

function toSummary(conversation: PreviewConversation): Record<string, unknown> {
  const last = conversation.messages.at(-1)
  return {
    awaitingDriver: last?.direction === 'outbound',
    channels: conversation.channels,
    ...(conversation.iconName === undefined ? {} : { iconName: conversation.iconName }),
    lastMessageAt: last?.createdAt ?? null,
    ...(last === undefined
      ? {}
      : { lastMessageDirection: last.direction, lastMessagePreview: last.bodyText.slice(0, 140) }),
    ...(conversation.officeReadAt === undefined ? {} : { officeReadAt: conversation.officeReadAt }),
    protocol: conversation.protocol,
    status: 'open',
    subjectId: conversation.occurrenceId,
    subjectLabel: conversation.occurrenceLabel,
    subjectType: conversation.subjectType,
    tripId: PREVIEW_TRIP_ID,
    unreadCount: conversation.messages.filter((message) => message.isUnread).length,
  }
}

export function createConversationRepository(now: () => number = Date.now): ConversationRepository {
  let conversations = buildSeedConversations(now())
  let replies = new Map<string, SendMessageResult>()
  let uploads = new Map<string, PreviewAttachment>()
  let pendingFailure: { count: number; status: number } = { count: 0, status: DEFAULT_FAIL_STATUS }

  const find = (subjectId: string): PreviewConversation | undefined =>
    conversations.find((conversation) => conversation.occurrenceId === subjectId)

  const unreadOf = (conversation: PreviewConversation): number =>
    conversation.messages.filter((message) => message.isUnread).length

  function append(
    conversation: PreviewConversation,
    message: Omit<PreviewMessage, 'createdAt' | 'id' | 'status'>,
  ): string {
    const id = crypto.randomUUID()
    conversation.messages.push({
      ...message,
      createdAt: new Date(now()).toISOString(),
      id,
      status: message.direction === 'inbound' ? 'delivered' : 'sent',
    })
    return id
  }

  function send(input: SendMessageInput): SendMessageResult | number | undefined {
    const conversation = find(input.subjectId)
    if (conversation === undefined) return undefined
    const replay = replies.get(`${input.subjectId}:${input.idempotencyKey}`)
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
      clientMessageId: input.idempotencyKey,
      direction: 'inbound',
      isUnread: false,
    })
    const result = { isReplay: false, messageId }
    replies.set(`${input.subjectId}:${input.idempotencyKey}`, result)
    return result
  }

  return {
    failNext(input) {
      pendingFailure = { count: input.count, status: input.status ?? DEFAULT_FAIL_STATUS }
    },
    markOfficeRead(subjectId) {
      const conversation = find(subjectId)
      if (conversation === undefined) return false
      for (const message of conversation.messages) {
        if (message.direction === 'inbound') message.status = 'read'
      }
      conversation.officeReadAt = new Date().toISOString()
      return true
    },
    injectOfficeMessage(input) {
      const conversation = find(input.subjectId)
      if (conversation === undefined) return undefined
      return append(conversation, {
        attachments: [],
        authorName: OFFICE_AUTHOR,
        bodyText: input.text,
        direction: 'outbound',
        isUnread: true,
      })
    },
    has: ({ subjectId, subjectType }) => find(subjectId)?.subjectType === subjectType,
    list: () =>
      conversations
        .filter((conversation) => conversation.subjectType === 'occurrence')
        .map((conversation) => ({
          lastMessageAt: conversation.messages.at(-1)?.createdAt ?? null,
          occurrenceId: conversation.occurrenceId,
          occurrenceLabel: conversation.occurrenceLabel,
          unreadCount: unreadOf(conversation),
        })),
    listSummaries: () => conversations.map(toSummary),
    markRead(subjectId) {
      const conversation = find(subjectId)
      if (conversation === undefined) return false
      for (const message of conversation.messages) message.isUnread = false
      return true
    },
    messages: (subjectId) => find(subjectId)?.messages,
    open({ subjectId, subjectType }) {
      const existing = find(subjectId)
      if (existing?.subjectType === subjectType) {
        return { isNew: false, summary: toSummary(existing) }
      }
      const subject = OPENABLE_PREVIEW_SUBJECTS.find(
        (candidate) => candidate.id === subjectId && candidate.subjectType === subjectType,
      )
      if (subject === undefined) return undefined
      const created: PreviewConversation = {
        channels: ['app'],
        messages: [],
        occurrenceId: subject.id,
        occurrenceLabel: subject.label,
        protocol: toProtocol(now(), randomProtocolSuffix()),
        subjectType,
      }
      conversations.push(created)
      return { isNew: true, summary: toSummary(created) }
    },
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
