/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 260 T3.1/T3.2: o cliente das rotas do escritório para a conversa de nota e de viagem
 * (api-contract, "Rotas do escritório"). Usa o mesmo transporte e o mesmo erro da conversa de
 * ocorrência — o erro chega pelo `code` —, mas o corpo do envio e o do pedido de upload são
 * `.strict()` na API: nada de `channel` nem de participante aqui. A leitura é tolerante: resumo ou
 * mensagem que o guard não reconhece sai da lista, e a tela continua de pé.
 */
import { toConversationAttachments } from './conversationAttachment.service'
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  putConversationUpload,
  readConversationUpload,
  requestJson,
  withAttachments,
  type ClientDependencies,
} from './occurrenceConversationClient.service'
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import {
  OCCURRENCE_CONVERSATION_CHANNELS,
  OCCURRENCE_CONVERSATION_MESSAGE_STATUSES,
  type OccurrenceConversationChannel,
  type OccurrenceConversationMessage,
} from './occurrenceConversation.types'
import {
  SUBJECT_CONVERSATION_SUBJECT_TYPES,
  type SubjectConversationRef,
  type SubjectConversationSummary,
} from './subjectConversation.types'

export type SubjectConversationClient = Readonly<{
  closeConversation: (input: SubjectConversationRef) => Promise<SubjectConversationSummary>
  listConversations: (input: { tripId: string }) => Promise<readonly SubjectConversationSummary[]>
  listMessages: (input: SubjectConversationRef) => Promise<readonly OccurrenceConversationMessage[]>
  markRead: (input: SubjectConversationRef) => Promise<void>
  openConversation: (input: SubjectConversationRef) => Promise<SubjectConversationSummary>
  putUpload: (input: { file: File; url: string }) => Promise<void>
  requestUpload: (
    input: SubjectConversationRef & {
      contentType: string
      fileName: string
      sizeBytes: number
    },
  ) => Promise<Readonly<{ uploadId: string; uploadUrl: string }>>
  sendMessage: (
    input: SubjectConversationRef & {
      attachmentIds?: readonly string[]
      body: string
      idempotencyKey: string
    },
  ) => Promise<null | OccurrenceConversationMessage>
}>

function includes<TValue extends string>(list: readonly TValue[], value: unknown): value is TValue {
  return (list as readonly unknown[]).includes(value)
}

function toSummary(value: unknown): null | SubjectConversationSummary {
  if (
    !isRecord(value) ||
    !includes(SUBJECT_CONVERSATION_SUBJECT_TYPES, value.subjectType) ||
    !isString(value.subjectId) ||
    !isString(value.subjectLabel) ||
    !isString(value.protocol) ||
    (value.status !== 'open' && value.status !== 'closed') ||
    typeof value.unreadCount !== 'number' ||
    !Array.isArray(value.channels)
  ) {
    return null
  }
  return {
    awaitingDriver: value.awaitingDriver === true,
    channels: value.channels.filter((channel): channel is OccurrenceConversationChannel =>
      includes(OCCURRENCE_CONVERSATION_CHANNELS, channel),
    ),
    driverName: isString(value.driverName) ? value.driverName : null,
    lastMessageAt: isString(value.lastMessageAt) ? value.lastMessageAt : null,
    ...(isString(value.lastMessagePreview) ? { lastMessagePreview: value.lastMessagePreview } : {}),
    protocol: value.protocol,
    status: value.status,
    subjectId: value.subjectId,
    subjectLabel: value.subjectLabel,
    subjectType: value.subjectType,
    tripId: isString(value.tripId) ? value.tripId : null,
    unreadCount: value.unreadCount,
  }
}

/**
 * A mensagem do `/trips/…/messages` traz só o nome de quem escreveu. Vira o autor que o balão da 183
 * já sabe desenhar: `outbound` é a operação (nós), `inbound` é o motorista.
 */
function toMessage(value: unknown): null | OccurrenceConversationMessage {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.bodyText) ||
    !isString(value.createdAt) ||
    (value.direction !== 'inbound' && value.direction !== 'outbound') ||
    !includes(OCCURRENCE_CONVERSATION_CHANNELS, value.channel) ||
    !(value.status === null || includes(OCCURRENCE_CONVERSATION_MESSAGE_STATUSES, value.status))
  ) {
    return null
  }
  const name = isString(value.authorName) ? value.authorName : null
  return {
    attachments: toConversationAttachments(value.attachments),
    author:
      value.direction === 'outbound'
        ? { kind: 'operation', name, userId: '' }
        : { kind: 'driver', name, userId: '' },
    bodyText: value.bodyText,
    channel: value.channel,
    createdAt: value.createdAt,
    direction: value.direction,
    id: value.id,
    status: value.status,
    statusTimes: {},
  }
}

function readData(payload: unknown): unknown {
  return isRecord(payload) ? payload.data : undefined
}

function readSummary(payload: unknown): SubjectConversationSummary {
  const summary = toSummary(readData(payload))
  if (summary === null) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return summary
}

const tripPath = (tripId: string): string => `/trips/${encodeURIComponent(tripId)}/conversations`

const subjectPath = ({ subjectId, subjectType, tripId }: SubjectConversationRef): string =>
  `${tripPath(tripId)}/${subjectType}/${encodeURIComponent(subjectId)}`

export function createSubjectConversationClient(
  dependencies: ClientDependencies,
): SubjectConversationClient {
  return {
    async closeConversation(input) {
      return readSummary(
        await requestJson(dependencies, `${subjectPath(input)}/close`, { method: 'POST' }),
      )
    },
    async listConversations({ tripId }) {
      const data = readData(await requestJson(dependencies, tripPath(tripId)))
      if (!Array.isArray(data)) {
        throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
      }
      return data.flatMap((item) => toSummary(item) ?? [])
    },
    async listMessages(input) {
      const data = readData(await requestJson(dependencies, `${subjectPath(input)}/messages`))
      if (!Array.isArray(data)) {
        throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
      }
      return data.flatMap((item) => toMessage(item) ?? [])
    },
    async markRead(input) {
      await requestJson(dependencies, `${subjectPath(input)}/messages/read`, { method: 'POST' })
    },
    async openConversation({ subjectId, subjectType, tripId }) {
      return readSummary(
        await requestJson(dependencies, `${tripPath(tripId)}/open`, {
          body: { subjectId, subjectType },
          method: 'POST',
        }),
      )
    },
    putUpload: (input) => putConversationUpload(dependencies, input),
    async requestUpload({ contentType, fileName, sizeBytes, ...subject }) {
      return readConversationUpload(
        await requestJson(dependencies, `${subjectPath(subject)}/uploads`, {
          body: { contentType, fileName, sizeBytes },
          method: 'POST',
        }),
      )
    },
    async sendMessage({ attachmentIds, body, idempotencyKey, ...subject }) {
      const payload = await requestJson(dependencies, `${subjectPath(subject)}/messages`, {
        body: withAttachments({ body }, attachmentIds),
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
      return toMessage(readData(payload))
    },
  }
}
