/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ChargeBatch,
  ChargeBatchItem,
  Delivery,
  DeliveryLocation,
  DeliverySchedule,
  Occurrence,
  OccurrenceAttachment,
  OccurrenceDecisionKind,
  OccurrenceDecisionResult,
  PortalConversation,
  PortalConversationAttachment,
  PortalConversationChannel,
  PortalConversationMessage,
} from './portal.types'

/**
 * A resposta da API é **entrada não confiável** como qualquer outra fronteira (`security.md` §3), e
 * este app não usa zod — a validação é type guard escrito à mão, igual ao painel.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

export function toDeliveries(payload: unknown): readonly Delivery[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return payload.data.filter(isRecord).map((row) => ({
    accessKey: readString(row, 'accessKey'),
    deliveredAt: readNullableString(row, 'deliveredAt'),
    estimatedArrivalAt: readNullableString(row, 'estimatedArrivalAt'),
    issuedAt: readString(row, 'issuedAt'),
    number: readString(row, 'number'),
    returnReason: readNullableString(row, 'returnReason'),
    separationStatus: readNullableString(row, 'separationStatus'),
    series: readString(row, 'series'),
    tripStatus: readNullableString(row, 'tripStatus'),
  }))
}

/** `data: null` é ausência de posição agora — e é o caso normal, não erro. */
export function toDeliveryLocation(payload: unknown): DeliveryLocation | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const row = payload.data
  const latitude = readString(row, 'latitude')
  const longitude = readString(row, 'longitude')
  if (latitude === '' || longitude === '') return null

  return { latitude, longitude, recordedAt: readString(row, 'recordedAt') }
}

export function toDeliverySchedule(payload: unknown): DeliverySchedule | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const row = payload.data

  return {
    divergedAt: readNullableString(row, 'divergedAt'),
    notes: readString(row, 'notes'),
    protocol: readString(row, 'protocol'),
    scheduledAt: readNullableString(row, 'scheduledAt'),
    status: readString(row, 'status'),
  }
}

function toChargeBatchItem(row: Record<string, unknown>): ChargeBatchItem {
  return {
    amount: readString(row, 'amount'),
    chargedOn: readString(row, 'chargedOn'),
    chargeType: readString(row, 'chargeType'),
    clientName: readString(row, 'clientName'),
    id: readString(row, 'id'),
    notes: readString(row, 'notes'),
    rejectionReason: readString(row, 'rejectionReason'),
    status: readString(row, 'status'),
  }
}

function toChargeBatch(row: Record<string, unknown>): ChargeBatch | null {
  if (!isRecord(row.batch)) return null
  const batch = row.batch

  return {
    batch: {
      closedAt: readString(batch, 'closedAt'),
      id: readString(batch, 'id'),
      periodEnd: readString(batch, 'periodEnd'),
      periodStart: readString(batch, 'periodStart'),
      status: readString(batch, 'status'),
      totalAmount: readString(batch, 'totalAmount'),
    },
    items: Array.isArray(row.items) ? row.items.filter(isRecord).map(toChargeBatchItem) : [],
    itemsTotal: readString(row, 'itemsTotal'),
  }
}

export function toChargeBatches(payload: unknown): readonly ChargeBatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return payload.data
    .filter(isRecord)
    .map(toChargeBatch)
    .filter((batch): batch is ChargeBatch => batch !== null)
}

export function toSingleChargeBatch(payload: unknown): ChargeBatch | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null

  return toChargeBatch(payload.data)
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' ? value : 0
}

const OCCURRENCE_DECISION_KINDS: readonly OccurrenceDecisionKind[] = [
  'goods_paid',
  'other',
  'redelivery_authorized',
]

function toOccurrenceDecisionKind(value: unknown): OccurrenceDecisionKind | null {
  return typeof value === 'string' &&
    (OCCURRENCE_DECISION_KINDS as readonly string[]).includes(value)
    ? (value as OccurrenceDecisionKind)
    : null
}

function toOccurrenceAttachment(row: Record<string, unknown>): OccurrenceAttachment {
  return {
    downloadUrl: readNullableString(row, 'downloadUrl'),
    expired: readBoolean(row, 'expired'),
    id: readString(row, 'id'),
    position: readNumber(row, 'position'),
    thumbnailUrl: readNullableString(row, 'thumbnailUrl'),
  }
}

/** O formato da `public_ref` na API; qualquer outra coisa não vira caminho de requisição. */
const CONVERSATION_REF_PATTERN = /^[A-Za-z0-9_-]{22,64}$/u

function readConversationRef(value: unknown): string | null {
  return typeof value === 'string' && CONVERSATION_REF_PATTERN.test(value) ? value : null
}

function toOccurrence(row: Record<string, unknown>): Occurrence {
  return {
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter(isRecord).map(toOccurrenceAttachment)
      : [],
    caseStatus: readString(row, 'caseStatus'),
    conversationRef: readConversationRef(row.conversationRef),
    conversationUnreadCount: readNumber(row, 'conversationUnreadCount'),
    decidedAt: readNullableString(row, 'decidedAt'),
    decisionKind: toOccurrenceDecisionKind(row.decisionKind),
    occurrenceId: readString(row, 'occurrenceId'),
    occurrenceTypeName: readString(row, 'occurrenceTypeName'),
    openedAt: readString(row, 'openedAt'),
    stage: readString(row, 'stage'),
  }
}

export function toOccurrences(payload: unknown): readonly Occurrence[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return payload.data.filter(isRecord).map(toOccurrence)
}

export function toOccurrenceDecisionResult(payload: unknown): OccurrenceDecisionResult | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const row = payload.data
  const kind = row.kind
  if (kind !== 'changed' && kind !== 'unchanged') return null

  return { kind, status: readString(row, 'status') }
}

const CONVERSATION_CHANNELS: readonly PortalConversationChannel[] = ['email', 'portal', 'whatsapp']

/** Spec 183 T702b: campo a campo — o id que viesse a mais não chega à tela. */
function toConversationAttachments(value: unknown): PortalConversationAttachment[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((row) => {
    const { contentType, fileName, sizeBytes, url } = row
    return typeof contentType === 'string' &&
      typeof fileName === 'string' &&
      typeof sizeBytes === 'number' &&
      typeof url === 'string'
      ? [{ contentType, fileName, sizeBytes, url }]
      : []
  })
}

function toConversationMessage(row: Record<string, unknown>): PortalConversationMessage | null {
  const { channel, side } = row
  if (side !== 'carrier' && side !== 'contractor') return null
  if (!CONVERSATION_CHANNELS.includes(channel as PortalConversationChannel)) return null
  return {
    attachments: toConversationAttachments(row.attachments),
    body: readString(row, 'body'),
    channel: channel as PortalConversationChannel,
    createdAt: readString(row, 'createdAt'),
    mine: readBoolean(row, 'mine'),
    side,
  }
}

/**
 * Spec 183 T653: a conversa lida campo a campo — o que a API mandar a mais (id, autor) não chega à
 * tela, e mensagem de lado ou canal desconhecido fica de fora em vez de ser adivinhada.
 */
export function toConversation(payload: unknown): PortalConversation {
  if (!isRecord(payload) || !isRecord(payload.data)) return { messages: [], unreadCount: 0 }
  const row = payload.data
  const messages = Array.isArray(row.messages)
    ? row.messages.filter(isRecord).flatMap((item) => toConversationMessage(item) ?? [])
    : []
  return { messages, unreadCount: readNumber(row, 'unreadCount') }
}
