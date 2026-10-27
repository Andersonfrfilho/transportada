/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T4b (RF8): o e-mail que o motorista escreveu na conversa da ocorrência e ainda não saiu. O painel lê o
 * pendente (só mascarado) e envia pelo id da mensagem, com `save` para guardar no cadastro do cliente; o endereço em
 * claro nunca chega aqui.
 */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  type ClientEmailSendOutcome,
  readClientEmailSendOutcome,
} from './contractorReplyEmail.service'
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import { type ClientDependencies, requestJson } from './occurrenceConversationClient.service'

export type PendingDetectedClientEmail = Readonly<{
  addressMasked: string
  createdAt: string
  messageId: string
}>

export const DETECTED_CLIENT_EMAIL_NOT_FOUND = 'DETECTED_CLIENT_EMAIL_NOT_FOUND'

/** `null` é "nada pendente"; forma inesperada também, para o cartão nunca aparecer com dado errado. */
export function readPendingDetectedClientEmail(
  payload: unknown,
): PendingDetectedClientEmail | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (
    !isRecord(data) ||
    !isString(data.addressMasked) ||
    !isString(data.createdAt) ||
    !isString(data.messageId)
  ) {
    return null
  }
  return { addressMasked: data.addressMasked, createdAt: data.createdAt, messageId: data.messageId }
}

/** Saiu (ou já tinha saído) para o endereço: o cartão fecha; senão mostra o motivo. */
export function isDetectedEmailSent(outcome: ClientEmailSendOutcome): boolean {
  return outcome.results.some(
    (result) => result.kind === 'queued' || result.kind === 'already_queued',
  )
}

export type DetectedClientEmailClient = Readonly<{
  read: (occurrenceId: string) => Promise<PendingDetectedClientEmail | null>
  send: (
    input: Readonly<{
      idempotencyKey: string
      messageId: string
      occurrenceId: string
      save: boolean
    }>,
  ) => Promise<ClientEmailSendOutcome>
}>

const detectedPath = (occurrenceId: string): string =>
  `/trip-occurrences/${encodeURIComponent(occurrenceId)}/contractor-reply/detected-client-email`

export function createDetectedClientEmailClient(
  dependencies: ClientDependencies,
): DetectedClientEmailClient {
  return {
    async read(occurrenceId) {
      return readPendingDetectedClientEmail(
        await requestJson(dependencies, detectedPath(occurrenceId)),
      )
    },
    async send({ idempotencyKey, messageId, occurrenceId, save }) {
      const payload = await requestJson(
        dependencies,
        `${detectedPath(occurrenceId)}/${encodeURIComponent(messageId)}/send`,
        {
          body: save ? { save } : {},
          headers: { 'idempotency-key': idempotencyKey },
          method: 'POST',
        },
      )
      return readClientEmailSendOutcome(payload)
    },
  }
}

export function getDetectedClientEmailClient(): DetectedClientEmailClient {
  return createDetectedClientEmailClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
