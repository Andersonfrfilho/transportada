/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407: o cliente das rotas da conversa da ocorrência (T404). A leitura é tolerante — a
 * mensagem que o guard não reconhece sai da lista, e a aba continua de pé —; o envio leva a
 * `Idempotency-Key` do diálogo; o erro da API chega pelo `code`, nunca pelo texto.
 */
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import { toAttachmentsWithAudioFields } from './audioAttachmentFields.service'
import {
  readContractorReplyEmailOptions,
  readClientEmailSendOutcome,
  readContractorReplyEmailOutcome,
  type ClientEmailSendOutcome,
  type ContractorReplyEmailOptions,
  type ContractorReplyEmailOutcome,
  type ContractorReplyEmailTarget,
  CLIENT_BOLETO_EMAILS_TARGET,
} from './contractorReplyEmail.service'

import {
  readContractorReplyWhatsAppOptions,
  readWhatsAppSendOutcome,
  type ContractorReplyWhatsAppOptions,
  type WhatsAppSendOutcome,
} from './contractorReplyWhatsApp.service'

import { type ConversationAttachmentChannel } from './conversationAttachment.service'

import {
  OCCURRENCE_CONVERSATION_CHANNELS,
  OCCURRENCE_CONVERSATION_MESSAGE_STATUSES,
  type ContractorMailRequest,
  type OccurrenceConversation,
  type OccurrenceConversationCopyEntry,
  type OccurrenceConversationsView,
  type OccurrenceConversationMessage,
  type OccurrenceMailCopyEntry,
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
  /** Spec 248 T4.7: o boleto da contratante por e-mail ao cliente da nota ou a um endereço informado. */
  forwardContractorReplyByEmail: (input: {
    address?: string
    attachmentId: string
    idempotencyKey: string
    occurrenceId: string
    target: ContractorReplyEmailTarget
  }) => Promise<ContractorReplyEmailOutcome>
  readContractorReplyEmailOptions: (input: {
    occurrenceId: string
  }) => Promise<ContractorReplyEmailOptions | null>
  /** Spec 279 T3/T5: o boleto aos e-mails do cadastro do cliente e/ou a um novo (`save` o guarda). */
  forwardContractorReplyToClient: (input: {
    address?: string
    attachmentId?: string
    emailIds?: readonly string[]
    idempotencyKey: string
    occurrenceId: string
    save?: boolean
  }) => Promise<ClientEmailSendOutcome>
  /** Spec 279 T6b (RF12): "Tentar de novo" de uma entrega ao cliente que o provedor recusou; a API lê o endereço dela. */
  retryContractorReplyClientDelivery: (input: {
    deliveryId: string
    occurrenceId: string
  }) => Promise<ClientEmailSendOutcome>
  /** Spec 281 T7: o estado do envio por WhatsApp (Evolution) desta ocorrência; tudo mascarado. */
  readContractorReplyWhatsAppOptions: (input: {
    occurrenceId: string
  }) => Promise<ContractorReplyWhatsAppOptions | null>
  /** Spec 281 T7: o boleto aos números do cadastro do cliente e/ou a um novo (`save` o guarda). */
  forwardContractorReplyToClientWhatsApp: (input: {
    attachmentId?: string
    contactIds?: readonly string[]
    idempotencyKey: string
    number?: string
    occurrenceId: string
    save?: boolean
  }) => Promise<WhatsAppSendOutcome>
  /** Spec 281 T7: "Tentar de novo" (falhou) e "Reenviar" (já saiu); o número e o anexo vêm da entrega. */
  resendContractorReplyWhatsAppDelivery: (input: {
    deliveryId: string
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<WhatsAppSendOutcome>
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
  /** Spec 274 D1: o chat da contratante vai por e-mail (`mode: 'chat'`), sem diálogo nem assunto. */
  sendContractorChatMessage: (input: {
    attachmentIds?: readonly string[]
    body: string
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<SentMessageReceipt>
  /** Spec 183 T654 (RF21): à contratante pelo portal — o texto e, desde a T702b, os anexos. */
  sendContractorPortalMessage: (input: {
    attachmentIds?: readonly string[]
    body: string
    /** Spec 183 T702d: anexos da conversa do motorista, encaminhados com o mesmo objeto. */
    forwardAttachmentIds?: readonly string[]
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<SentMessageReceipt>
  /** Spec 248 T4.6: leva o boleto da contratante ao motorista pelo chat do app. */
  deliverContractorReplyToDriver: (input: {
    attachmentId: string
    occurrenceId: string
  }) => Promise<'already_delivered' | 'delivered' | 'skipped'>
  sendDriverAppMessage: (input: {
    attachmentIds?: readonly string[]
    body: string
    idempotencyKey: string
    occurrenceId: string
  }) => Promise<SentMessageReceipt>
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
  if (value.kind === 'automatic') return true
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
  if (value.kind === 'internal') {
    return (
      isString(value.name) && isString(value.userId) && typeof value.reachedContractor === 'boolean'
    )
  }
  return value.kind === 'unknown' && isRecord(value.suggestion)
}

function toCopy(value: unknown): readonly OccurrenceConversationCopyEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): OccurrenceConversationCopyEntry[] =>
    isRecord(entry) && isString(entry.maskedEmail) && (entry.name === null || isString(entry.name))
      ? [{ maskedEmail: entry.maskedEmail, name: entry.name }]
      : [],
  )
}

const SYSTEM_NOTICE_ACTOR_KINDS = ['driver', 'office', 'system'] as const

/** Forma desconhecida some: a mensagem segue lida como a automática comum, nunca como balão enganoso. */
function toSystemNotice(value: unknown): OccurrenceConversationMessage['systemNotice'] {
  if (!isRecord(value) || value.kind !== 'client_boleto_email_sent') return undefined
  const actorKind = SYSTEM_NOTICE_ACTOR_KINDS.find((known) => known === value.actorKind)
  if (actorKind === undefined || !isString(value.deliveryId)) return undefined
  return {
    actorKind,
    actorName: isString(value.actorName) && value.actorName !== '' ? value.actorName : null,
    deliveryId: value.deliveryId,
    kind: 'client_boleto_email_sent',
  }
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
  const copy = toCopy(value.copy)
  const systemNotice = toSystemNotice(value.systemNotice)
  return {
    /** O áudio traz a duração e a transcrição (264); campo que o painel não conhece some, nunca o anexo. */
    attachments: toAttachmentsWithAudioFields(value.attachments),
    author,
    bodyText: value.bodyText,
    channel: value.channel,
    ...(copy.length === 0 ? {} : { copy }),
    createdAt: value.createdAt,
    direction: value.direction,
    ...(isString(value.emailFullText) && value.emailFullText.trim() !== ''
      ? { emailFullText: value.emailFullText }
      : {}),
    id: value.id,
    status: value.status,
    statusTimes,
    ...(systemNotice === undefined ? {} : { systemNotice }),
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

function toCopyEntry(value: unknown): null | OccurrenceMailCopyEntry {
  if (!isRecord(value) || !isString(value.userId) || !isString(value.name)) return null
  if (!isString(value.maskedEmail)) return null
  return { maskedEmail: value.maskedEmail, name: value.name, userId: value.userId }
}

function readCcSource(value: unknown): OccurrenceMailPreview['ccSource'] {
  return value === 'company' || value === 'contractor' || value === 'occurrence_type' ? value : null
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
    cc: Array.isArray(data.cc) ? data.cc.flatMap((entry) => toCopyEntry(entry) ?? []) : [],
    ccSource: readCcSource(data.ccSource),
    contractorName: isString(data.contractorName) ? data.contractorName : '',
    missingNotificationTemplate: data.missingNotificationTemplate === true,
    recipients: Array.isArray(data.recipients) ? data.recipients.filter(isRecipient) : [],
    subject: data.subject,
    suggested: data.suggested,
    notificationTemplateKey: isString(data.notificationTemplateKey)
      ? data.notificationTemplateKey
      : null,
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
    method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
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

const contractorReplyPath = (occurrenceId: string): string =>
  `/trip-occurrences/${encodeURIComponent(occurrenceId)}/contractor-reply`

const occurrencePath = (occurrenceId: string): string =>
  `/trip-occurrences/${encodeURIComponent(occurrenceId)}/conversations`

/** O recibo do envio: a API responde `{ data: { conversationMessageId } }`; sem ele (resposta antiga) o envio vale igual. */
export type SentMessageReceipt = Readonly<{ conversationMessageId: null | string }>

function readSentMessageReceipt(payload: unknown): SentMessageReceipt {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  const id =
    typeof data === 'object' && data !== null && 'conversationMessageId' in data
      ? data.conversationMessageId
      : undefined
  return { conversationMessageId: typeof id === 'string' && id !== '' ? id : null }
}

function readDeliveryKind(payload: unknown): 'already_delivered' | 'delivered' | 'skipped' {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  const kind = typeof data === 'object' && data !== null && 'kind' in data ? data.kind : undefined
  if (kind === 'delivered' || kind === 'already_delivered' || kind === 'skipped') return kind
  throw new Error('OCCURRENCE_CONVERSATION_RESPONSE_INVALID')
}

export function createOccurrenceConversationClient(
  dependencies: ClientDependencies,
): OccurrenceConversationClient {
  return {
    async forwardContractorReplyByEmail({
      address,
      attachmentId,
      idempotencyKey,
      occurrenceId,
      target,
    }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/email-delivery`,
        {
          body: { attachmentId, target, ...(address === undefined ? {} : { address }) },
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        },
      )
      return readContractorReplyEmailOutcome(payload)
    },
    async forwardContractorReplyToClient({
      address,
      attachmentId,
      emailIds,
      idempotencyKey,
      occurrenceId,
      save,
    }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/email-delivery`,
        {
          body: {
            target: CLIENT_BOLETO_EMAILS_TARGET,
            ...(address === undefined ? {} : { address }),
            ...(attachmentId === undefined ? {} : { attachmentId }),
            ...(emailIds === undefined || emailIds.length === 0 ? {} : { emailIds }),
            ...(save === true ? { save } : {}),
          },
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        },
      )
      return readClientEmailSendOutcome(payload)
    },
    async retryContractorReplyClientDelivery({ deliveryId, occurrenceId }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/email-deliveries/${encodeURIComponent(deliveryId)}/retry`,
        { method: 'POST' },
      )
      return readClientEmailSendOutcome(payload)
    },
    async readContractorReplyEmailOptions({ occurrenceId }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/email-options`,
      )
      return readContractorReplyEmailOptions(payload)
    },
    async readContractorReplyWhatsAppOptions({ occurrenceId }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/whatsapp-options`,
      )
      return readContractorReplyWhatsAppOptions(payload)
    },
    async forwardContractorReplyToClientWhatsApp({
      attachmentId,
      contactIds,
      idempotencyKey,
      number,
      occurrenceId,
      save,
    }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/whatsapp-delivery`,
        {
          body: {
            ...(attachmentId === undefined ? {} : { attachmentId }),
            ...(contactIds === undefined || contactIds.length === 0 ? {} : { contactIds }),
            ...(number === undefined ? {} : { number }),
            ...(save === true ? { save } : {}),
          },
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        },
      )
      return readWhatsAppSendOutcome(payload)
    },
    async resendContractorReplyWhatsAppDelivery({ deliveryId, idempotencyKey, occurrenceId }) {
      const payload = await requestJson(
        dependencies,
        `${contractorReplyPath(occurrenceId)}/whatsapp-deliveries/${encodeURIComponent(deliveryId)}/resend`,
        { headers: { 'idempotency-key': idempotencyKey }, method: 'POST' },
      )
      return readWhatsAppSendOutcome(payload)
    },
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
    async deliverContractorReplyToDriver({ attachmentId, occurrenceId }) {
      const payload = await requestJson(
        dependencies,
        `/trip-occurrences/${encodeURIComponent(occurrenceId)}/contractor-reply/driver-delivery`,
        { body: { attachmentId }, method: 'POST' },
      )
      return readDeliveryKind(payload)
    },
    async sendDriverAppMessage({ attachmentIds, body, idempotencyKey, occurrenceId }) {
      return readSentMessageReceipt(
        await requestJson(dependencies, `${occurrencePath(occurrenceId)}/driver/messages`, {
          body: withAttachments({ body, channel: 'app' }, attachmentIds),
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        }),
      )
    },
    async sendContractorPortalMessage({
      attachmentIds,
      body,
      forwardAttachmentIds,
      idempotencyKey,
      occurrenceId,
    }) {
      return readSentMessageReceipt(
        await requestJson(dependencies, `${occurrencePath(occurrenceId)}/contractor/messages`, {
          body: withAttachments(
            {
              body,
              channel: 'portal',
              ...(forwardAttachmentIds === undefined || forwardAttachmentIds.length === 0
                ? {}
                : { forwardAttachmentIds }),
            },
            attachmentIds,
          ),
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        }),
      )
    },
    async sendContractorChatMessage({ attachmentIds = [], body, idempotencyKey, occurrenceId }) {
      return readSentMessageReceipt(
        await requestJson(dependencies, `${occurrencePath(occurrenceId)}/contractor/messages`, {
          body: { attachmentIds, body, channel: 'email', mode: 'chat' },
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        }),
      )
    },
    async sendContractorMail({ idempotencyKey, occurrenceId, request }) {
      const { attachmentIds = [], ...rest } = request
      await requestJson(dependencies, `${occurrencePath(occurrenceId)}/contractor/messages`, {
        body: attachmentIds.length === 0 ? rest : { ...rest, attachmentIds },
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
    },
  }
}
