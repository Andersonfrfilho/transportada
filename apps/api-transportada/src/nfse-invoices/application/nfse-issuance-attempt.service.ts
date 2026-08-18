/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type {
  NfseAttemptKind,
  NfseCancellationMotive,
  NfseFiscalEnvironment,
  NfseIssuanceEvent,
  NfseIssuanceOutboxEventType,
  NfseServiceInvoiceStatus,
} from '../../database/nfse.schema.js'
import { NfseIdempotencyKeyReusedError } from '../domain/nfse-issuance.error.js'
import type { NfseInvoicePreviewItem } from './nfse-invoice-preview.service.js'
import type {
  NfseInvoiceCredential,
  NfseInvoiceProfile,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'

export const NFSE_ISSUE_EVENT_NAME: NfseIssuanceEvent = 'issue_requested'
export const NFSE_ISSUE_OUTBOX_EVENT: NfseIssuanceOutboxEventType =
  'transportada.nfse.invoice.issue.requested'
export const NFSE_CANCEL_EVENT_NAME: NfseIssuanceEvent = 'cancel_requested'
export const NFSE_CANCEL_OUTBOX_EVENT: NfseIssuanceOutboxEventType =
  'transportada.nfse.invoice.cancel.requested'

const CANCEL_ATTEMPT_KIND: NfseAttemptKind = 'cancel'
const CANCEL_OPERATION = 'nfse.invoice.cancel'
const CREATE_OPERATION = 'nfse.invoice.create'
const ISSUE_ATTEMPT_KIND: NfseAttemptKind = 'issue'

export type NfseInvoiceSummary = {
  readonly attemptId: string
  readonly documentIds: readonly string[]
  readonly invoiceId: string
  readonly replayed: boolean
  readonly requestedAt: string
  readonly status: NfseServiceInvoiceStatus
}

/** A digital do pedido separa uma repetição de rede de um pedido novo com a mesma chave. */
export function createRequestFingerprint(request: Readonly<Record<string, unknown>>): string {
  const canonical = Object.keys(request)
    .sort()
    .map((key) => [key, request[key]])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function createInvoiceFingerprint(input: {
  readonly descriptionTemplate: string
  readonly documentIds: readonly string[]
  readonly period: string
  readonly profileId: string
}): string {
  return createRequestFingerprint({
    descriptionTemplate: input.descriptionTemplate,
    documentIds: [...input.documentIds].sort(),
    operation: CREATE_OPERATION,
    // O período é digitado: corrigi-lo e repetir a chave tem de ser pedido novo, não replay.
    period: input.period,
    profileId: input.profileId,
  })
}

/** Os dois entram: corrigir o código ou o texto e repetir a chave é pedido novo, não replay. */
export function createCancellationFingerprint(input: {
  readonly cancellationMotive: NfseCancellationMotive
  readonly cancellationReason: string
  readonly invoiceId: string
}): string {
  return createRequestFingerprint({
    cancellationMotive: input.cancellationMotive,
    cancellationReason: input.cancellationReason,
    invoiceId: input.invoiceId,
    operation: CANCEL_OPERATION,
  })
}

export async function findReplaySummary(params: {
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly status: NfseServiceInvoiceStatus
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceSummary | null> {
  const attempt = await params.transaction.findAttemptByIdempotencyKey({
    idempotencyKey: params.idempotencyKey,
  })
  if (attempt === null) return null
  if (attempt.requestFingerprint !== params.requestFingerprint) {
    throw new NfseIdempotencyKeyReusedError()
  }

  return {
    attemptId: attempt.attemptId,
    documentIds: [],
    invoiceId: attempt.invoiceId,
    replayed: true,
    requestedAt: attempt.createdAt,
    status: params.status,
  }
}

export type FreezeNfseIssuancePayloadParams = {
  readonly attemptId: string
  readonly credential: NfseInvoiceCredential
  readonly invoice: NfseInvoicePreviewItem
  readonly invoiceId: string
  readonly profile: NfseInvoiceProfile
}

/**
 * O payload é congelado aqui e nunca mais recalculado: o worker transmite exatamente o que a
 * empresa viu na prévia, mesmo que o perfil ou a regra de frete mudem depois.
 */
export function freezeNfseIssuancePayload({
  attemptId,
  credential,
  invoice,
  invoiceId,
  profile,
}: FreezeNfseIssuancePayloadParams): {
  readonly attemptId: string
  readonly invoiceId: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly payloadSha256: string
  readonly providerConfig: Readonly<Record<string, unknown>>
} {
  const payload = {
    cnaeCode: profile.cnaeCode,
    description: invoice.description,
    documents: invoice.documents.map((document) => ({
      accessKey: document.accessKey,
      documentId: document.documentId,
      number: document.number,
      series: document.series,
      totalAmount: document.totalAmount,
    })),
    issAmount: invoice.issAmount,
    issExigibility: profile.issExigibility,
    issRate: invoice.issRate,
    issWithheld: profile.issWithheld,
    municipalityIbgeCode: profile.municipalityIbgeCode,
    municipalTaxationCode: profile.municipalTaxationCode,
    nbsCode: profile.nbsCode,
    serviceAmount: invoice.serviceAmount,
    serviceListItem: profile.serviceListItem,
    taker: { legalName: invoice.takerLegalName, taxId: invoice.takerTaxId },
  }

  return {
    attemptId,
    invoiceId,
    payload,
    payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    // Sem segredo: o token continua selado na credencial e só o worker o abre para transmitir.
    providerConfig: {
      credentialId: credential.credentialId,
      fiscalEnvironment: credential.fiscalEnvironment,
      municipalRegistration: credential.municipalRegistration,
      provider: credential.provider,
      taxId: credential.taxId,
    },
  }
}

export type ScheduleNfseIssuanceParams = {
  readonly attemptId: string
  readonly correlationId: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly invoiceId: string
  readonly occurredAt: string
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
  readonly userId: string
}

/** A prefeitura nunca é chamada aqui: o request só deixa o pedido no outbox para o worker executar. */
export async function scheduleNfseIssuance(params: ScheduleNfseIssuanceParams): Promise<void> {
  await params.transaction.appendEvent({
    attemptId: params.attemptId,
    eventName: NFSE_ISSUE_EVENT_NAME,
    invoiceId: params.invoiceId,
    occurredAt: params.occurredAt,
    payload: { fiscalEnvironment: params.fiscalEnvironment },
  })
  await params.transaction.pushOutbox({
    actorUserId: params.userId,
    attemptFingerprint: params.requestFingerprint,
    attemptId: params.attemptId,
    attemptKind: ISSUE_ATTEMPT_KIND,
    correlationId: params.correlationId,
    eventType: NFSE_ISSUE_OUTBOX_EVENT,
    invoiceId: params.invoiceId,
    payload: { invoiceId: params.invoiceId },
  })
}

export type ScheduleNfseCancellationParams = ScheduleNfseIssuanceParams & {
  readonly cancellationMotive: NfseCancellationMotive
}

/**
 * O cancelamento sai pelo mesmo trilho da emissão. No payload vai o **código** do motivo, que é o
 * que a prefeitura lê; o texto livre do operador fica na nota e não é registrado aqui.
 */
export async function scheduleNfseCancellation(
  params: ScheduleNfseCancellationParams,
): Promise<void> {
  await params.transaction.appendEvent({
    attemptId: params.attemptId,
    eventName: NFSE_CANCEL_EVENT_NAME,
    invoiceId: params.invoiceId,
    occurredAt: params.occurredAt,
    payload: { fiscalEnvironment: params.fiscalEnvironment },
  })
  await params.transaction.pushOutbox({
    actorUserId: params.userId,
    attemptFingerprint: params.requestFingerprint,
    attemptId: params.attemptId,
    attemptKind: CANCEL_ATTEMPT_KIND,
    correlationId: params.correlationId,
    eventType: NFSE_CANCEL_OUTBOX_EVENT,
    invoiceId: params.invoiceId,
    payload: { cancellationMotive: params.cancellationMotive, invoiceId: params.invoiceId },
  })
}
