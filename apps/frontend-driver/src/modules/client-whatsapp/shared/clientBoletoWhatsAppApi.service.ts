/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_CONVERSATION_ERROR } from '@/modules/conversation/shared/driverConversation.constant'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from '@/modules/conversation/shared/driverConversationsHttp.service'

import {
  CLIENT_BOLETO_WHATSAPP_DELIVERY_STATUSES,
  CLIENT_BOLETO_WHATSAPP_FAILURE_REASONS,
  CLIENT_BOLETO_WHATSAPP_PATH,
  CLIENT_BOLETO_WHATSAPP_RESEND_PATH,
  CLIENT_BOLETO_WHATSAPP_RESULT_KINDS,
  type ClientBoletoWhatsAppDelivery,
  type ClientBoletoWhatsAppFailureReason,
  type ClientBoletoWhatsAppOptions,
  type ClientBoletoWhatsAppOutcome,
  type ClientBoletoWhatsAppResultKind,
  type ClientBoletoWhatsAppSendRequest,
} from './clientBoletoWhatsApp.types'

export type ClientBoletoWhatsAppApi = Readonly<{
  list: (occurrenceId: string) => Promise<ClientBoletoWhatsAppOptions>
  resend: (input: {
    readonly deliveryId: string
    readonly idempotencyKey: string
    readonly occurrenceId: string
  }) => Promise<ClientBoletoWhatsAppOutcome>
  send: (request: ClientBoletoWhatsAppSendRequest) => Promise<ClientBoletoWhatsAppOutcome>
}>

function invalidResponse(): never {
  throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
}

function readData(payload: unknown): Readonly<Record<string, unknown>> {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) invalidResponse()
  const { data } = payload
  if (typeof data !== 'object' || data === null) invalidResponse()
  return data as Readonly<Record<string, unknown>>
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : invalidResponse()
}

/** Motivo desconhecido (API mais nova) vira falha genérica: a tela não quebra, só perde a frase específica. */
function parseReason(value: unknown): ClientBoletoWhatsAppFailureReason | null {
  if (value === null || value === undefined) return null
  return CLIENT_BOLETO_WHATSAPP_FAILURE_REASONS.find((known) => known === value) ?? 'send_failed'
}

function isResultKind(value: unknown): value is ClientBoletoWhatsAppResultKind {
  return (CLIENT_BOLETO_WHATSAPP_RESULT_KINDS as readonly unknown[]).includes(value)
}

/** Descarta o item malformado: o estado é leitura, e um item ruim não derruba a folha. */
export function parseClientBoletoWhatsAppDeliveries(
  value: unknown,
): readonly ClientBoletoWhatsAppDelivery[] {
  if (!Array.isArray(value)) return []
  const deliveries: ClientBoletoWhatsAppDelivery[] = []
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Readonly<Record<string, unknown>>
    const status = CLIENT_BOLETO_WHATSAPP_DELIVERY_STATUSES.find((known) => known === item.status)
    const { createdAt, numberMasked, sentAt } = item
    if (typeof item.id !== 'string' || typeof createdAt !== 'string' || status === undefined) {
      continue
    }
    if (numberMasked !== null && typeof numberMasked !== 'string') continue
    if (sentAt !== null && typeof sentAt !== 'string') continue
    deliveries.push({
      createdAt,
      id: item.id,
      numberMasked,
      reason: parseReason(item.reason),
      sentAt,
      status,
    })
  }
  return deliveries
}

export function parseClientBoletoWhatsAppOptions(payload: unknown): ClientBoletoWhatsAppOptions {
  const data = readData(payload)
  const { clientChannel, contacts, sentCount, sentLimit } = data
  if (
    typeof clientChannel !== 'string' ||
    !Array.isArray(contacts) ||
    typeof sentCount !== 'number' ||
    typeof sentLimit !== 'number'
  ) {
    invalidResponse()
  }
  const evolution = asRecord(data.evolution)
  return {
    clientChannel,
    contacts: (contacts as readonly unknown[]).map((entry) => {
      const contact = asRecord(entry)
      if (
        typeof contact.contactId !== 'string' ||
        typeof contact.label !== 'string' ||
        typeof contact.numberMasked !== 'string'
      ) {
        invalidResponse()
      }
      return {
        contactId: contact.contactId,
        label: contact.label,
        numberMasked: contact.numberMasked,
      }
    }),
    deliveries: parseClientBoletoWhatsAppDeliveries(data.deliveries),
    evolutionReady: evolution.ready === true,
    sentCount,
    sentLimit,
  }
}

export function parseClientBoletoWhatsAppOutcome(payload: unknown): ClientBoletoWhatsAppOutcome {
  const data = readData(payload)
  if (!Array.isArray(data.results)) invalidResponse()
  return {
    results: (data.results as readonly unknown[]).map((entry) => {
      const result = asRecord(entry)
      if (
        typeof result.deliveryId !== 'string' ||
        typeof result.numberMasked !== 'string' ||
        !isResultKind(result.kind)
      ) {
        invalidResponse()
      }
      return {
        deliveryId: result.deliveryId,
        kind: result.kind,
        numberMasked: result.numberMasked,
        reason: parseReason(result.reason),
      }
    }),
    savedContactId: typeof data.savedContactId === 'string' ? data.savedContactId : null,
  }
}

export function createClientBoletoWhatsAppApi(
  http: DriverConversationHttp,
): ClientBoletoWhatsAppApi {
  return {
    async list(occurrenceId) {
      return parseClientBoletoWhatsAppOptions(
        await http.getJson(CLIENT_BOLETO_WHATSAPP_PATH(occurrenceId)),
      )
    },
    async resend(input) {
      return parseClientBoletoWhatsAppOutcome(
        await http.postJson(
          CLIENT_BOLETO_WHATSAPP_RESEND_PATH(input.occurrenceId, input.deliveryId),
          { body: { idempotencyKey: input.idempotencyKey } },
        ),
      )
    },
    async send(request) {
      return parseClientBoletoWhatsAppOutcome(
        await http.postJson(`${CLIENT_BOLETO_WHATSAPP_PATH(request.occurrenceId)}/send`, {
          body: {
            ...(request.contactIds === undefined || request.contactIds.length === 0
              ? {}
              : { contactIds: request.contactIds }),
            idempotencyKey: request.idempotencyKey,
            ...(request.number === undefined ? {} : { number: request.number }),
            ...(request.save === true ? { save: true } : {}),
          },
        }),
      )
    },
  }
}
