/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407: o cliente das rotas da conversa da ocorrência (T404). A leitura é tolerante — a
 * mensagem que o guard não reconhece sai da lista, e a aba continua de pé —; o envio leva a
 * `Idempotency-Key` do diálogo; o erro da API chega pelo `code`, nunca pelo texto.
 */
import { isRecord, isString } from '@/modules/trip/shared/tripGuards.validation'

import {
  toConversationAttachments,
  type ConversationAttachmentChannel,
} from './conversationAttachment.service'

import {
  OCCURRENCE_CONVERSATION_CHANNELS,
  OCCURRENCE_CONVERSATION_MESSAGE_STATUSES,
  type ContractorMailRequest,
  type OccurrenceConversation,
  type OccurrenceConversationsView,
  type OccurrenceConversationMessage,
  type OccurrenceMailPreview,
  type OccurrenceMailRecipient,
  type UnassignedCandidate,
  type UnassignedMessage,
} from './occurrenceConversation.types'

export const OCCURRENCE_CONVERSATION_ERROR = {
  REQUEST_FAILED: 'OCCURRENCE_CONVERSATION_REQUEST_FAILED',
  RESPONSE_INVALID: 'OCCURRENCE_CONVERSATION_RESPONSE_INVALID',
  /** O armazenamento recusou o arquivo (ou não respondeu); a API nunca chegou a vê-lo. */
  UPLOAD_FAILED: 'OCCURRENCE_CONVERSATION_UPLOAD_FAILED',
} as const

export class OccurrenceConversationRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
  }
}

export type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (request: Request, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type OccurrenceConversationClient = Readonly<{
  assignUnassigned: (input: { conversationId: string; unassignedId: string }) => Promise<void>
  listUnassigned: () => Promise<readonly UnassignedMessage[]>
  listConversations: (input: { occurrenceId: string }) => Promise<OccurrenceConversationsView>
  markConversationRead: (input: { conversationId: string }) => Promise<void>
  previewContractorMail: (input: {
    body?: string
    occurrenceId: string
    subject?: string
  }) => Promise<OccurrenceMailPreview>
  /** Spec 183 T702b: o PUT direto ao armazenamento, sem o token — a URL já é a autorização. */
  putConversationUpload: (input: { file: File; url: string }) => Promise<void>
  /** Spec 183 T702b: a URL de subida de um anexo para o app (motorista) ou o portal (contratante). */
  requestConversationUpload: (input: {
    channel: ConversationAttachmentChannel
    contentType: string
    fileName: string
    occurrenceId: string
    participant: 'contractor' | 'driver'
    sizeBytes: number
  }) => Promise<Readonly<{ uploadId: string; uploadUrl: string }>>
  /** Spec 183 T654 (RF21): à contratante pelo portal — o texto e, desde a T702b, os anexos. */
  sendContractorPortalMessage: (input: {
    attachmentIds?: readonly string[]
    body: string
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<void>
  sendDriverAppMessage: (input: {
    attachmentIds?: readonly string[]
    body: string
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<void>
  sendContractorMail: (input: {
    idempotencyKey: string
    occurrenceId: string
    request: ContractorMailRequest
  }) => Promise<void>
}>

function includes<TValue extends string>(list: readonly TValue[], value: unknown): value is TValue {
  return (list as readonly unknown[]).includes(value)
}

/**
 * O autor e a identidade vêm da API já decididos (RF16); aqui só a forma mínima que a tela lê. Um
 * autor de contratante com identidade que não se reconhece vira "sem identidade", não reprova.
 */
function isAuthor(value: unknown): value is OccurrenceConversationMessage['author'] {
  if (!isRecord(value)) return false
  if (value.kind === 'operation' || value.kind === 'driver') {
    return isString(value.userId) && (value.name === null || isString(value.name))
  }
  return value.kind === 'contractor' && (value.userId === null || isString(value.userId))
}

function isIdentity(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.arrivedAs)) return false
  if (value.kind === 'contact') {
    return (
      isRecord(value.contact) &&
      isString(value.contact.email) &&
      isString(value.contact.name) &&
      Array.isArray(value.contact.types) &&
      typeof value.inactive === 'boolean'
    )
  }
  return value.kind === 'unknown' && isRecord(value.suggestion)
}

function toMessage(value: unknown): null | OccurrenceConversationMessage {
  if (
    !isRecord(value) ||
    !isAuthor(value.author) ||
    !isString(value.bodyText) ||
    !includes(OCCURRENCE_CONVERSATION_CHANNELS, value.channel) ||
    !isString(value.createdAt) ||
    (value.direction !== 'inbound' && value.direction !== 'outbound') ||
    !isString(value.id) ||
    !(value.status === null || includes(OCCURRENCE_CONVERSATION_MESSAGE_STATUSES, value.status))
  ) {
    return null
  }
  const author =
    value.author.kind === 'contractor'
      ? {
          ...value.author,
          identity: isIdentity(value.author.identity) ? value.author.identity : null,
        }
      : value.author
  const statusTimes = isRecord(value.statusTimes)
    ? Object.fromEntries(
        Object.entries(value.statusTimes).filter((entry): entry is [string, string] =>
          isString(entry[1]),
        ),
      )
    : {}
  return {
    attachments: toConversationAttachments(value.attachments),
    author,
    bodyText: value.bodyText,
    channel: value.channel,
    createdAt: value.createdAt,
    direction: value.direction,
    id: value.id,
    status: value.status,
    statusTimes,
  }
}

function toConversation(value: unknown): null | OccurrenceConversation {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    (value.participant !== 'contractor' && value.participant !== 'driver') ||
    !Array.isArray(value.messages)
  ) {
    return null
  }
  return {
    id: value.id,
    messages: value.messages.flatMap((message) => toMessage(message) ?? []),
    participant: value.participant,
    status: isString(value.status) ? value.status : 'open',
    unreadCount: typeof value.unreadCount === 'number' ? value.unreadCount : 0,
  }
}

function toCandidate(value: unknown): null | UnassignedCandidate {
  if (
    !isRecord(value) ||
    !isString(value.contractorName) ||
    !isString(value.conversationId) ||
    !isString(value.occurrenceId) ||
    (value.occurrenceKind !== 'document' && value.occurrenceKind !== 'stop')
  ) {
    return null
  }
  const last = value.lastOutbound
  return {
    contractorName: value.contractorName,
    conversationId: value.conversationId,
    lastOutbound:
      isRecord(last) && isString(last.at) && isString(last.preview)
        ? { at: last.at, preview: last.preview }
        : null,
    occurrenceId: value.occurrenceId,
    occurrenceKind: value.occurrenceKind,
  }
}

function toUnassigned(value: unknown): null | UnassignedMessage {
  if (
    !isRecord(value) ||
    !isString(value.bodyText) ||
    (value.channel !== 'email' && value.channel !== 'whatsapp') ||
    !isString(value.id) ||
    !isString(value.receivedAt) ||
    !isString(value.senderAddress) ||
    !Array.isArray(value.candidates)
  ) {
    return null
  }
  const contact = value.contact
  return {
    bodyText: value.bodyText,
    candidates: value.candidates.flatMap((candidate) => toCandidate(candidate) ?? []),
    channel: value.channel,
    contact:
      isRecord(contact) && isString(contact.contactId) && isString(contact.name)
        ? { contactId: contact.contactId, name: contact.name }
        : null,
    id: value.id,
    receivedAt: value.receivedAt,
    senderAddress: value.senderAddress,
  }
}

function isRecipient(value: unknown): value is OccurrenceMailRecipient {
  return (
    isRecord(value) &&
    typeof value.approvesCharges === 'boolean' &&
    isString(value.contactId) &&
    isString(value.email) &&
    isString(value.name) &&
    typeof value.preselected === 'boolean' &&
    isString(value.roleLabel)
  )
}

function readPreview(payload: unknown): OccurrenceMailPreview {
  const data = isRecord(payload) ? payload.data : undefined
  if (
    !isRecord(data) ||
    !isString(data.bodyText) ||
    !isString(data.subject) ||
    !isString(data.text) ||
    typeof data.suggested !== 'boolean'
  ) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return {
    bodyText: data.bodyText,
    contractorName: isString(data.contractorName) ? data.contractorName : '',
    recipients: Array.isArray(data.recipients) ? data.recipients.filter(isRecipient) : [],
    subject: data.subject,
    suggested: data.suggested,
    text: data.text,
  }
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return OCCURRENCE_CONVERSATION_ERROR.REQUEST_FAILED
}

export async function requestJson(
  dependencies: ClientDependencies,
  path: string,
  init?: Readonly<{
    body?: object
    headers?: Record<string, string>
    method?: 'GET' | 'PATCH' | 'POST' | 'PUT'
  }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init?.headers,
        },
        method: init?.method ?? 'GET',
      }),
    )
  } catch {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new OccurrenceConversationRequestError(
      response.ok
        ? OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID
        : OCCURRENCE_CONVERSATION_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw new OccurrenceConversationRequestError(readErrorCode(payload))
  return payload
}

/**
 * Spec 183 T702b: o PUT do arquivo direto ao armazenamento. Sem o token: a URL assinada já é a
 * autorização, e o token da API não tem por que sair para outro host.
 */
export async function putConversationUpload(
  dependencies: ClientDependencies,
  input: Readonly<{ file: File; url: string }>,
): Promise<void> {
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(input.url, {
        body: input.file,
        headers: { 'content-type': input.file.type },
        method: 'PUT',
      }),
    )
  } catch {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.UPLOAD_FAILED)
  }
  if (!response.ok) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.UPLOAD_FAILED)
  }
}

/** A resposta do pedido de upload: só o id e a URL interessam à tela. */
export function readConversationUpload(
  payload: unknown,
): Readonly<{ uploadId: string; uploadUrl: string }> {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || !isString(data.uploadId) || !isString(data.uploadUrl)) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return { uploadId: data.uploadId, uploadUrl: data.uploadUrl }
}

/** Os anexos só entram no corpo quando há: o envio sem anexo segue igual ao de antes. */
export function withAttachments(
  body: Record<string, unknown>,
  attachmentIds: readonly string[] | undefined,
): Record<string, unknown> {
  return attachmentIds === undefined || attachmentIds.length === 0
    ? body
    : { attachmentIds, ...body }
}

const occurrencePath = (occurrenceId: string): string =>
  `/trip-occurrences/${encodeURIComponent(occurrenceId)}/conversations`

export function createOccurrenceConversationClient(
  dependencies: ClientDependencies,
): OccurrenceConversationClient {
  return {
    async assignUnassigned({ conversationId, unassignedId }) {
      await requestJson(
        dependencies,
        `/occurrence-conversations/unassigned/${encodeURIComponent(unassignedId)}/assign`,
        { body: { conversationId }, method: 'POST' },
      )
    },
    async listUnassigned() {
      const payload = await requestJson(dependencies, '/occurrence-conversations/unassigned')
      const data = isRecord(payload) ? payload.data : undefined
      if (!Array.isArray(data)) {
        throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
      }
      return data.flatMap((item) => toUnassigned(item) ?? [])
    },
    async listConversations({ occurrenceId }) {
      const payload = await requestJson(dependencies, occurrencePath(occurrenceId))
      const data = isRecord(payload) ? payload.data : undefined
      if (!isRecord(data) || !Array.isArray(data.conversations)) {
        throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
      }
      const portal = isRecord(data.contractorPortal) ? data.contractorPortal : {}
      return {
        contractorPortal: { available: portal.available === true },
        conversations: data.conversations.flatMap(
          (conversation) => toConversation(conversation) ?? [],
        ),
      }
    },
    async markConversationRead({ conversationId }) {
      await requestJson(
        dependencies,
        `/occurrence-conversations/${encodeURIComponent(conversationId)}/read`,
        { method: 'POST' },
      )
    },
    async previewContractorMail({ body, occurrenceId, subject }) {
      const payload = await requestJson(
        dependencies,
        `${occurrencePath(occurrenceId)}/contractor/mail-preview`,
        {
          body: {
            ...(body === undefined ? {} : { body }),
            ...(subject === undefined ? {} : { subject }),
          },
          method: 'POST',
        },
      )
      return readPreview(payload)
    },
    putConversationUpload: (input) => putConversationUpload(dependencies, input),
    async requestConversationUpload({ occurrenceId, participant, ...declared }) {
      const payload = await requestJson(
        dependencies,
        `${occurrencePath(occurrenceId)}/${participant}/uploads`,
        { body: declared, method: 'POST' },
      )
      return readConversationUpload(payload)
    },
    async sendDriverAppMessage({ attachmentIds, body, idempotencyKey, occurrenceId }) {
      await requestJson(dependencies, `${occurrencePath(occurrenceId)}/driver/messages`, {
        body: withAttachments({ body, channel: 'app' }, attachmentIds),
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
    },
    async sendContractorPortalMessage({ attachmentIds, body, idempotencyKey, occurrenceId }) {
      await requestJson(dependencies, `${occurrencePath(occurrenceId)}/contractor/messages`, {
        body: withAttachments({ body, channel: 'portal' }, attachmentIds),
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
    },
    async sendContractorMail({ idempotencyKey, occurrenceId, request }) {
      await requestJson(dependencies, `${occurrencePath(occurrenceId)}/contractor/messages`, {
        body: request,
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
    },
  }
}
