/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { CURRENT_TRIP_PATH } from './driverConversation.constant'
import {
  createDriverConversationHttp,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'

/** Spec 279 T4b (RF8): o e-mail que o motorista escreveu na conversa e ainda não saiu; só a forma mascarada. */
export type DriverDetectedClientEmail = Readonly<{ addressMasked: string; messageId: string }>

export type DriverDetectedEmailResult = Readonly<{
  addressMasked: string
  kind: 'already_queued' | 'failed' | 'queued' | 'skipped'
}>

export type DriverDetectedEmailOutcome = Readonly<{
  results: readonly DriverDetectedEmailResult[]
  savedEmailId: null | string
}>

const RESULT_KINDS = ['already_queued', 'failed', 'queued', 'skipped'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Nada pendente, ou forma estranha, é `null`: o cartão nunca aparece com dado errado. */
export function parseDriverDetectedClientEmail(payload: unknown): DriverDetectedClientEmail | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (
    !isRecord(data) ||
    typeof data.addressMasked !== 'string' ||
    typeof data.messageId !== 'string'
  ) {
    return null
  }
  return { addressMasked: data.addressMasked, messageId: data.messageId }
}

/** O resultado por endereço (mascarado); forma inesperada é erro, nunca "enviado". */
export function parseDriverDetectedEmailOutcome(payload: unknown): DriverDetectedEmailOutcome {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || !Array.isArray(data.results))
    throw new Error('DETECTED_EMAIL_RESPONSE_INVALID')
  const results = data.results.map((item: unknown) => {
    const kind = isRecord(item) ? RESULT_KINDS.find((known) => known === item.kind) : undefined
    if (!isRecord(item) || kind === undefined || typeof item.addressMasked !== 'string') {
      throw new Error('DETECTED_EMAIL_RESPONSE_INVALID')
    }
    return { addressMasked: item.addressMasked, kind }
  })
  return { results, savedEmailId: typeof data.savedEmailId === 'string' ? data.savedEmailId : null }
}

export function isDriverDetectedEmailSent(outcome: DriverDetectedEmailOutcome): boolean {
  return outcome.results.some(
    (result) => result.kind === 'queued' || result.kind === 'already_queued',
  )
}

const detectedPath = (occurrenceId: string): string =>
  `${CURRENT_TRIP_PATH}/occurrences/${encodeURIComponent(occurrenceId)}/client-boleto-emails/detected`

export function createDriverDetectedClientEmailApi(http: DriverConversationHttp) {
  return {
    async read(occurrenceId: string): Promise<DriverDetectedClientEmail | null> {
      return parseDriverDetectedClientEmail(await http.getJson(detectedPath(occurrenceId)))
    },
    async send(
      input: Readonly<{
        idempotencyKey: string
        messageId: string
        occurrenceId: string
        save: boolean
      }>,
    ): Promise<DriverDetectedEmailOutcome> {
      const payload = await http.postJson(
        `${detectedPath(input.occurrenceId)}/${encodeURIComponent(input.messageId)}/send`,
        { body: { idempotencyKey: input.idempotencyKey, ...(input.save ? { save: true } : {}) } },
      )
      return parseDriverDetectedEmailOutcome(payload)
    },
  }
}

export function getDriverDetectedClientEmailApi() {
  return createDriverDetectedClientEmailApi(
    createDriverConversationHttp({
      baseUrl: getDriverEnvironment().apiBaseUrl,
      fetch: (request) => fetch(request),
      getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    }),
  )
}
