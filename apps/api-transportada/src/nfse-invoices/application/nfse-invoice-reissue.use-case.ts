/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseAttemptKind, NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'
import {
  NFSE_INVOICE_ACTION,
  checkNfseInvoiceTransition,
} from '../domain/nfse-invoice-state.policy.js'
import { applyNfseIssuanceCorrection } from '../domain/nfse-issuance-correction.policy.js'
import type { NfseInvoiceCorrectionInput } from '../domain/nfse-issuance-correction.policy.js'
import {
  NfseIdempotencyKeyReusedError,
  NfseInvoiceNotFoundError,
  NfseInvoiceTransitionBlockedError,
  NfseIssuancePayloadMissingError,
} from '../domain/nfse-issuance.error.js'
import type {
  NfseFrozenIssuancePayload,
  NfseInvoiceCancellationTarget,
  NfseInvoiceCompanyContext,
  NfseInvoiceCredential,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'
import {
  buildNfseProviderConfig,
  createReissueFingerprint,
  loadNfseCredential,
  scheduleNfseIssuance,
} from './nfse-issuance-attempt.service.js'

const ISSUE_ATTEMPT_KIND: NfseAttemptKind = 'issue'

export type { NfseInvoiceCorrectionInput }

export type ReissueNfseInvoiceInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly correction?: NfseInvoiceCorrectionInput
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly invoiceId: string
}

export type NfseInvoiceReissueSummary = {
  readonly attemptId: string
  readonly attemptNumber: number
  readonly invoiceId: string
  readonly payloadSha256: string
  readonly replayed: boolean
  readonly requestedAt: string
  readonly status: NfseServiceInvoiceStatus
}

export type NfseInvoiceReissueUseCase = {
  execute(input: ReissueNfseInvoiceInput): Promise<NfseInvoiceReissueSummary>
}

/**
 * Reemitir é a saída da nota rejeitada: uma tentativa nova sobre o **mesmo** RPS congelado, com o
 * mesmo `payload_sha256`. Nada é recalculado — perfil e regra de frete podem ter mudado desde a
 * prévia, e recalcular transmitiria à prefeitura um documento que ninguém aprovou.
 *
 * Os vínculos com as NF-e permanecem: a nota continua sendo a mesma, e devolver os documentos à
 * seleção aqui abriria a porta para eles entrarem noutra nota enquanto esta ainda tenta.
 */
export function createNfseInvoiceReissueUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceReissueUseCase {
  const { now, repository } = dependencies

  return {
    async execute(input) {
      const requestFingerprint = createReissueFingerprint({
        invoiceId: input.invoiceId,
        ...(input.correction === undefined ? {} : { correction: input.correction }),
      })

      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const replay = await findReissueReplay({ input, requestFingerprint, transaction })
        if (replay !== null) return replay

        const { invoice, nextStatus } = await loadReissuableInvoice(transaction, input.invoiceId)
        const credential = await loadNfseCredential(transaction, input.context.companyId)
        const frozen = await loadFrozenPayload(
          transaction,
          input.context.companyId,
          invoice.invoiceId,
        )

        return requestReissue({
          credential,
          frozen,
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

async function findReissueReplay({
  input,
  requestFingerprint,
  transaction,
}: {
  readonly input: ReissueNfseInvoiceInput
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceReissueSummary | null> {
  const attempt = await transaction.findAttemptByIdempotencyKey({
    idempotencyKey: input.idempotencyKey,
  })
  if (attempt === null) return null
  if (attempt.requestFingerprint !== requestFingerprint) throw new NfseIdempotencyKeyReusedError()

  const invoice = await transaction.findInvoiceForUpdate({ invoiceId: attempt.invoiceId })
  if (invoice === null) throw new NfseInvoiceNotFoundError()
  const frozen = await loadFrozenPayload(transaction, input.context.companyId, attempt.invoiceId)

  return {
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    invoiceId: attempt.invoiceId,
    payloadSha256: frozen.payloadSha256,
    replayed: true,
    requestedAt: attempt.createdAt,
    status: invoice.status,
  }
}

/** O status seguinte vem da tabela de transições, nunca de um literal aqui. */
async function loadReissuableInvoice(
  transaction: NfseInvoiceTransactionPort,
  invoiceId: string,
): Promise<{
  readonly invoice: NfseInvoiceCancellationTarget
  readonly nextStatus: NfseServiceInvoiceStatus
}> {
  const invoice = await transaction.findInvoiceForUpdate({ invoiceId })
  if (invoice === null) throw new NfseInvoiceNotFoundError()

  const transition = checkNfseInvoiceTransition({
    action: NFSE_INVOICE_ACTION.issue,
    status: invoice.status,
  })
  if (!transition.allowed) throw new NfseInvoiceTransitionBlockedError(transition.reason)
  return { invoice, nextStatus: transition.nextStatus }
}

async function loadFrozenPayload(
  transaction: NfseInvoiceTransactionPort,
  companyId: string,
  invoiceId: string,
): Promise<NfseFrozenIssuancePayload> {
  const frozen = await transaction.findLatestPayload({ companyId, invoiceId })
  if (frozen === null) throw new NfseIssuancePayloadMissingError()
  return frozen
}

async function requestReissue({
  credential,
  frozen,
  input,
  invoice,
  nextStatus,
  now,
  requestFingerprint,
  transaction,
}: {
  readonly credential: NfseInvoiceCredential
  readonly frozen: NfseFrozenIssuancePayload
  readonly input: ReissueNfseInvoiceInput
  readonly invoice: NfseInvoiceCancellationTarget
  readonly nextStatus: NfseServiceInvoiceStatus
  readonly now: () => Date
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceReissueSummary> {
  const occurredAt = now().toISOString()
  const corrected = applyNfseIssuanceCorrection({
    previousPayload: frozen.payload,
    previousPayloadSha256: frozen.payloadSha256,
    ...(input.correction === undefined ? {} : { correction: input.correction }),
  })

  await transaction.markIssuing({
    invoiceId: invoice.invoiceId,
    requestedAt: occurredAt,
    status: nextStatus,
    ...(input.correction?.description === undefined
      ? {}
      : { description: input.correction.description }),
    ...(corrected.issAmount === undefined ? {} : { issAmount: corrected.issAmount }),
  })

  const attempt = await transaction.createAttempt({
    attemptKind: ISSUE_ATTEMPT_KIND,
    correlationId: input.correlationId,
    fiscalEnvironment: credential.fiscalEnvironment,
    idempotencyKey: input.idempotencyKey,
    invoiceId: invoice.invoiceId,
    requestFingerprint,
  })
  await transaction.savePayload({
    attemptId: attempt.attemptId,
    invoiceId: invoice.invoiceId,
    payload: corrected.payload,
    payloadSha256: corrected.payloadSha256,
    providerConfig: buildNfseProviderConfig(credential),
  })
  await scheduleNfseIssuance({
    attemptId: attempt.attemptId,
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
    attemptNumber: attempt.attemptNumber,
    invoiceId: invoice.invoiceId,
    payloadSha256: corrected.payloadSha256,
    replayed: false,
    requestedAt: occurredAt,
    status: nextStatus,
  }
}
