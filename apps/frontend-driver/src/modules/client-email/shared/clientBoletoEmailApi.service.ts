/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from '@/modules/conversation/shared/driverConversationsHttp.service'
import { DRIVER_CONVERSATION_ERROR } from '@/modules/conversation/shared/driverConversation.constant'

import {
  CLIENT_BOLETO_EMAIL_DELIVERY_STATUSES,
  CLIENT_BOLETO_EMAIL_RESULT_KINDS,
  CLIENT_BOLETO_EMAILS_PATH,
  type ClientBoletoEmailDelivery,
  type ClientBoletoEmailOptions,
  type ClientBoletoEmailOutcome,
  type ClientBoletoEmailResultKind,
  type ClientBoletoEmailSendRequest,
} from './clientBoletoEmail.types'

export type ClientBoletoEmailApi = Readonly<{
  list: (occurrenceId: string) => Promise<ClientBoletoEmailOptions>
  send: (request: ClientBoletoEmailSendRequest) => Promise<ClientBoletoEmailOutcome>
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

function isResultKind(value: unknown): value is ClientBoletoEmailResultKind {
  return (CLIENT_BOLETO_EMAIL_RESULT_KINDS as readonly unknown[]).includes(value)
}

/** Descarta o item malformado: o estado é leitura, e um item ruim não derruba a folha. */
export function parseClientBoletoEmailDeliveries(
  value: unknown,
): readonly ClientBoletoEmailDelivery[] {
  if (!Array.isArray(value)) return []
  const deliveries: ClientBoletoEmailDelivery[] = []
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Readonly<Record<string, unknown>>
    const status = CLIENT_BOLETO_EMAIL_DELIVERY_STATUSES.find((known) => known === item.status)
    const { address, sentAt } = item
    if (typeof item.id !== 'string' || status === undefined) continue
    if (address !== null && typeof address !== 'string') continue
    if (sentAt !== null && typeof sentAt !== 'string') continue
    deliveries.push({ address, id: item.id, sentAt, status })
  }
  return deliveries
}

export function parseClientBoletoEmailOptions(payload: unknown): ClientBoletoEmailOptions {
  const data = readData(payload)
  const { clientEmailType, clientEmails, sentCount, sentLimit } = data
  if (
    typeof clientEmailType !== 'string' ||
    !Array.isArray(clientEmails) ||
    typeof sentCount !== 'number' ||
    typeof sentLimit !== 'number'
  ) {
    invalidResponse()
  }
  return {
    clientEmailType,
    clientEmails: (clientEmails as readonly unknown[]).map((entry) => {
      const option = entry as Readonly<Record<string, unknown>>
      if (
        typeof option.addressMasked !== 'string' ||
        typeof option.emailId !== 'string' ||
        typeof option.label !== 'string'
      ) {
        invalidResponse()
      }
      return { addressMasked: option.addressMasked, emailId: option.emailId, label: option.label }
    }),
    deliveries: parseClientBoletoEmailDeliveries(data.deliveries),
    sentCount,
    sentLimit,
  }
}

export function parseClientBoletoEmailOutcome(payload: unknown): ClientBoletoEmailOutcome {
  const data = readData(payload)
  if (!Array.isArray(data.results)) invalidResponse()
  return {
    results: (data.results as readonly unknown[]).map((entry) => {
      const result = entry as Readonly<Record<string, unknown>>
      if (typeof result.addressMasked !== 'string' || !isResultKind(result.kind)) invalidResponse()
      return { addressMasked: result.addressMasked, kind: result.kind }
    }),
    savedEmailId: typeof data.savedEmailId === 'string' ? data.savedEmailId : null,
  }
}

export function createClientBoletoEmailApi(http: DriverConversationHttp): ClientBoletoEmailApi {
  return {
    async list(occurrenceId) {
      return parseClientBoletoEmailOptions(
        await http.getJson(CLIENT_BOLETO_EMAILS_PATH(occurrenceId)),
      )
    },
    async send(request) {
      return parseClientBoletoEmailOutcome(
        await http.postJson(`${CLIENT_BOLETO_EMAILS_PATH(request.occurrenceId)}/send`, {
          body: {
            ...(request.emailIds === undefined || request.emailIds.length === 0
              ? {}
              : { emailIds: request.emailIds }),
            idempotencyKey: request.idempotencyKey,
            ...(request.newAddress === undefined ? {} : { newAddress: request.newAddress }),
            ...(request.save === true ? { save: true } : {}),
          },
        }),
      )
    },
  }
}
