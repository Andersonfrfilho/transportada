/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'
import {
  NFSE_INVOICE_ACTION,
  checkNfseInvoiceTransition,
} from '../domain/nfse-invoice-state.policy.js'
import {
  NfseCredentialMissingError,
  NfseFiscalSettingsMissingError,
  NfseIdempotencyKeyReusedError,
  NfseInvoiceNotFoundError,
  NfseInvoiceTransitionBlockedError,
} from '../domain/nfse-issuance.error.js'
import type {
  NfseInvoiceCancellationTarget,
  NfseInvoiceCompanyContext,
  NfseInvoiceCredential,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'
import {
  createCancellationFingerprint,
  scheduleNfseCancellation,
} from './nfse-issuance-attempt.service.js'

const CANCEL_ATTEMPT_KIND = 'cancel'

export type CancelNfseInvoiceInput = {
  readonly cancellationReason: string
  readonly context: NfseInvoiceCompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly invoiceId: string
}

export type NfseInvoiceCancellationSummary = {
  readonly attemptId: string
  readonly invoiceId: string
  readonly releasedDocumentIds: readonly string[]
  readonly replayed: boolean
  readonly requestedAt: string
  readonly status: NfseServiceInvoiceStatus
}

export type NfseInvoiceCancellationUseCase = {
  execute(input: CancelNfseInvoiceInput): Promise<NfseInvoiceCancellationSummary>
}

/**
 * Cancelar devolve as NF-e na mesma transação que registra o pedido: o vínculo ganha `cancelled_at`
 * e o índice parcial único libera o documento para outra nota e para lote de CT-e. A nota vai a
 * `cancellation_requested` — quem a leva a `cancelled` é o write-back da prefeitura, que é quem
 * cancela um documento fiscal.
 */
export function createNfseInvoiceCancellationUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceCancellationUseCase {
  const { now, repository } = dependencies

  return {
    async execute(input) {
      const requestFingerprint = createCancellationFingerprint({
        cancellationReason: input.cancellationReason,
        invoiceId: input.invoiceId,
      })

      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const replay = await findCancellationReplay({ input, requestFingerprint, transaction })
        if (replay !== null) return replay

        const { invoice, nextStatus } = await loadCancellableInvoice(transaction, input.invoiceId)
        const credential = await loadCredential(transaction, input.context.companyId)

        return requestCancellation({
          credential,
          input,
          invoice,
          nextStatus,
          now,
          requestFingerprint,
          transaction,
        })
      })
    },
  }
}

async function findCancellationReplay({
  input,
  requestFingerprint,
  transaction,
}: {
  readonly input: CancelNfseInvoiceInput
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceCancellationSummary | null> {
  const attempt = await transaction.findAttemptByIdempotencyKey({
    idempotencyKey: input.idempotencyKey,
  })
  if (attempt === null) return null
  if (attempt.requestFingerprint !== requestFingerprint) throw new NfseIdempotencyKeyReusedError()

  const invoice = await transaction.findInvoiceForUpdate({ invoiceId: attempt.invoiceId })
  if (invoice === null) throw new NfseInvoiceNotFoundError()

  return {
    attemptId: attempt.attemptId,
    invoiceId: attempt.invoiceId,
    releasedDocumentIds: [],
    replayed: true,
    requestedAt: attempt.createdAt,
    status: invoice.status,
  }
}

/** O status seguinte vem da tabela de transições, nunca de um literal aqui. */
async function loadCancellableInvoice(
  transaction: NfseInvoiceTransactionPort,
  invoiceId: string,
): Promise<{
  readonly invoice: NfseInvoiceCancellationTarget
  readonly nextStatus: NfseServiceInvoiceStatus
}> {
  const invoice = await transaction.findInvoiceForUpdate({ invoiceId })
  if (invoice === null) throw new NfseInvoiceNotFoundError()

  const transition = checkNfseInvoiceTransition({
    action: NFSE_INVOICE_ACTION.cancel,
    status: invoice.status,
  })
  if (!transition.allowed) throw new NfseInvoiceTransitionBlockedError(transition.reason)
  return { invoice, nextStatus: transition.nextStatus }
}

async function loadCredential(
  transaction: NfseInvoiceTransactionPort,
  companyId: string,
): Promise<NfseInvoiceCredential> {
  const fiscalEnvironment = await transaction.findFiscalEnvironment({ companyId })
  if (fiscalEnvironment === null) throw new NfseFiscalSettingsMissingError()

  const credential = await transaction.findActiveCredential({ companyId, fiscalEnvironment })
  if (credential === null) throw new NfseCredentialMissingError()
  return credential
}

async function requestCancellation({
  credential,
  input,
  invoice,
  nextStatus,
  now,
  requestFingerprint,
  transaction,
}: {
  readonly credential: NfseInvoiceCredential
  readonly input: CancelNfseInvoiceInput
  readonly invoice: NfseInvoiceCancellationTarget
  readonly nextStatus: NfseServiceInvoiceStatus
  readonly now: () => Date
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceCancellationSummary> {
  const occurredAt = now().toISOString()

  const releasedDocumentIds = await transaction.releaseDocumentLinks({
    cancelledAt: occurredAt,
    invoiceId: invoice.invoiceId,
  })
  await transaction.markCancellationRequested({
    cancellationReason: input.cancellationReason,
    invoiceId: invoice.invoiceId,
    requestedAt: occurredAt,
    status: nextStatus,
  })

  const attempt = await transaction.createAttempt({
    attemptKind: CANCEL_ATTEMPT_KIND,
    correlationId: input.correlationId,
    fiscalEnvironment: credential.fiscalEnvironment,
    idempotencyKey: input.idempotencyKey,
    invoiceId: invoice.invoiceId,
    requestFingerprint,
  })
  await scheduleNfseCancellation({
    attemptId: attempt.attemptId,
    cancellationReason: input.cancellationReason,
    correlationId: input.correlationId,
    fiscalEnvironment: credential.fiscalEnvironment,
    invoiceId: invoice.invoiceId,
    occurredAt,
    requestFingerprint: attempt.requestFingerprint,
    transaction,
    userId: input.context.userId,
  })

  return {
    attemptId: attempt.attemptId,
    invoiceId: invoice.invoiceId,
    releasedDocumentIds,
    replayed: false,
    requestedAt: occurredAt,
    status: nextStatus,
  }
}
