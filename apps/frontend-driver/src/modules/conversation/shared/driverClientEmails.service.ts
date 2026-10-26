/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { CURRENT_TRIP_PATH } from './driverConversation.constant'
import { createDriverConversationHttp } from './driverConversationsHttp.service'

/** Spec 279 T6c (RF13): o e-mail do cliente guardado, sempre na forma mascarada (RF2). */
export type DriverClientEmail = Readonly<{ addressMasked: string; emailId: string; label: string }>

/**
 * Spec 279 T6b (RF12): o estado do envio por endereço. `skipped` (sem endereço) é o envio automático que não achou
 * e-mail do cliente (T3c). Só leitura: o motorista não tenta de novo daqui.
 */
export type DriverClientEmailDelivery = Readonly<{
  address: null | string
  id: string
  sentAt: null | string
  status: 'failed' | 'queued' | 'sent' | 'skipped'
}>

export type DriverClientEmailsView = Readonly<{
  deliveries: readonly DriverClientEmailDelivery[]
  emails: readonly DriverClientEmail[]
}>

const DELIVERY_STATUSES = ['failed', 'queued', 'sent', 'skipped'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Descarta o item malformado: a seção é leitura, e um item ruim não derruba a folha. */
export function parseDriverClientEmails(payload: unknown): readonly DriverClientEmail[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.clientEmails)) {
    return []
  }
  const emails: DriverClientEmail[] = []
  for (const item of payload.data.clientEmails as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.addressMasked === 'string' &&
      typeof item.emailId === 'string' &&
      typeof item.label === 'string'
    ) {
      emails.push({ addressMasked: item.addressMasked, emailId: item.emailId, label: item.label })
    }
  }
  return emails
}

/** Resposta anterior à T6b não traz `deliveries`; o item malformado é descartado, como na lista de e-mails. */
export function parseDriverClientEmailDeliveries(
  payload: unknown,
): readonly DriverClientEmailDelivery[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.deliveries)) {
    return []
  }
  const deliveries: DriverClientEmailDelivery[] = []
  for (const item of payload.data.deliveries as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const status = DELIVERY_STATUSES.find((known) => known === item.status)
    const address = item.address
    const sentAt = item.sentAt
    if (status === undefined) continue
    if (address !== null && typeof address !== 'string') continue
    if (sentAt !== null && typeof sentAt !== 'string') continue
    deliveries.push({ address, id: item.id, sentAt, status })
  }
  return deliveries
}

/** `GET /me/trips/current/occurrences/:id/client-boleto-emails` (T4); a recusa (`409`, tipo `off`) vira erro. */
export async function readDriverClientEmails(
  occurrenceId: string,
): Promise<DriverClientEmailsView> {
  const http = createDriverConversationHttp({
    baseUrl: getDriverEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  const payload: unknown = await http.getJson(
    `${CURRENT_TRIP_PATH}/occurrences/${occurrenceId}/client-boleto-emails`,
  )
  return {
    deliveries: parseDriverClientEmailDeliveries(payload),
    emails: parseDriverClientEmails(payload),
  }
}
