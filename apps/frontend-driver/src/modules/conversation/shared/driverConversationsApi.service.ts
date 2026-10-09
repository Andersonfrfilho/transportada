/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  participantConversationPageSchema,
  participantMessageSchema,
  type ParticipantMessage,
  type ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'
import type {
  ParticipantConversationsApi,
  ParticipantSendInput,
  ParticipantSendResult,
} from '@adatechnology/conversations-ui/participant'

import {
  ATTACHMENT_URL_MAX_AGE_MS,
  CURRENT_TRIP_PATH,
  DRIVER_CONVERSATION_ERROR,
  DRIVER_CONVERSATION_SUBJECT_TYPE,
} from './driverConversation.constant'
import {
  createClientMessageIdEcho,
  type ClientMessageIdEchoStorage,
} from './clientMessageIdEcho.service'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'
import {
  isAwaitingParticipant,
  readAttachmentUrls,
  readDataArray,
  toConversationSummaryCandidate,
  toParticipantMessageCandidate,
} from './driverConversationsMapper.service'
import { createDriverConversationUploader } from './driverConversationUploads.service'

export type DriverConversationsApiDependencies = Readonly<{
  echoStorage?: ClientMessageIdEchoStorage | undefined
  fallbackSubjectLabel: () => string
  http: DriverConversationHttp
  now?: () => Date
}>

type AttachmentUrlEntry = Readonly<{
  fetchedAt: number
  subject: ParticipantSubjectRef
  url: string
}>

function occurrenceIdOf(subject: ParticipantSubjectRef): string {
  if (subject.subjectType !== DRIVER_CONVERSATION_SUBJECT_TYPE) {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
  }
  return subject.subjectId
}

const messagesPath = (subject: ParticipantSubjectRef): string =>
  `${CURRENT_TRIP_PATH}/occurrences/${encodeURIComponent(occurrenceIdOf(subject))}/messages`

function readMessageId(payload: unknown): string {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  if (
    typeof data === 'object' &&
    data !== null &&
    'messageId' in data &&
    typeof data.messageId === 'string'
  ) {
    return data.messageId
  }
  throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
}

/** Um adapter só por app: a identidade estável do `api` evita recarregar a lista a cada render. */
export function createDriverConversationsApi(
  dependencies: DriverConversationsApiDependencies,
): ParticipantConversationsApi {
  const { http } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const echo = createClientMessageIdEcho(dependencies.echoStorage)
  const uploader = createDriverConversationUploader(http)
  const attachmentUrls = new Map<string, AttachmentUrlEntry>()
  /** A lista da API não traz a direção da última mensagem; vale a que a conversa aberta mostrou. */
  const awaitingByConversation = new Map<
    string,
    Readonly<{ lastMessageAt: string; isAwaiting: boolean }>
  >()

  async function fetchMessages(
    subject: ParticipantSubjectRef,
  ): Promise<readonly ParticipantMessage[]> {
    const payload = await http.getJson(messagesPath(subject))
    const rawMessages = readDataArray(payload)
    const messages = participantMessageSchema
      .array()
      .parse(rawMessages.map(toParticipantMessageCandidate))
    const fetchedAt = now().getTime()
    for (const raw of rawMessages) {
      for (const [id, url] of readAttachmentUrls(raw))
        attachmentUrls.set(id, { fetchedAt, subject, url })
    }
    const last = messages.at(-1)
    if (last !== undefined) {
      awaitingByConversation.set(subject.subjectId, {
        isAwaiting: isAwaitingParticipant(messages),
        lastMessageAt: last.createdAt,
      })
    }
    return echo.decorate(messages)
  }

  async function sendMessage(input: ParticipantSendInput): Promise<ParticipantSendResult> {
    const attachments = await uploader.upload({
      files: input.files ?? [],
      occurrenceId: occurrenceIdOf(input.subject),
    })
    const attachmentIds = attachments.map((attachment) => attachment.id)
    const payload = await http.postJson(messagesPath(input.subject), {
      body: { body: input.text ?? '', ...(attachmentIds.length === 0 ? {} : { attachmentIds }) },
      headers: { 'idempotency-key': input.clientMessageId },
    })
    const serverMessageId = readMessageId(payload)
    echo.remember({ clientMessageId: input.clientMessageId, serverMessageId })
    const message = participantMessageSchema.parse({
      attachments,
      clientMessageId: input.clientMessageId,
      createdAt: now().toISOString(),
      direction: 'inbound',
      id: serverMessageId,
      text: input.text,
    })
    return { message, outcome: 'sent' }
  }

  return {
    fetchMessages: (subject) => fetchMessages(subject),
    async listConversations() {
      const payload = await http.getJson(`${CURRENT_TRIP_PATH}/occurrence-conversations`)
      const candidates = readDataArray(payload).map((raw) => {
        const { occurrenceId, lastMessageAt, unreadCount } = (raw ?? {}) as Record<string, unknown>
        const remembered = awaitingByConversation.get(String(occurrenceId))
        // temporário até a API trazer awaitingDriver (spec 260 T2.5)
        const isAwaiting =
          Number(unreadCount) > 0 ||
          (remembered !== undefined &&
            remembered.lastMessageAt === lastMessageAt &&
            remembered.isAwaiting)
        return toConversationSummaryCandidate({
          fallbackSubjectLabel: dependencies.fallbackSubjectLabel(),
          isAwaitingParticipant: isAwaiting,
          raw,
        })
      })
      return participantConversationPageSchema.parse({ data: candidates })
    },
    async markRead(subject) {
      await http.postJson(`${messagesPath(subject)}/read`)
    },
    async resolveAttachmentUrl(attachment) {
      const known = attachmentUrls.get(attachment.id)
      if (known !== undefined && now().getTime() - known.fetchedAt < ATTACHMENT_URL_MAX_AGE_MS) {
        return known.url
      }
      if (known !== undefined) await fetchMessages(known.subject)
      const refreshed = attachmentUrls.get(attachment.id)
      if (refreshed === undefined) {
        throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.REQUEST_FAILED)
      }
      return refreshed.url
    },
    sendMessage,
  }
}
