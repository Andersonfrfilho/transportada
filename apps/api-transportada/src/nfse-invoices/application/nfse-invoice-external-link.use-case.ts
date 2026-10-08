/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseAttemptKind } from '../../database/nfse.schema.js'
import { NFSE_NATIONAL_PROVIDER_API_VERSION } from '../../shared/nfse-provider-api-version.constant.js'
import {
  NFSE_INVOICE_ACTION,
  checkNfseInvoiceTransition,
} from '../domain/nfse-invoice-state.policy.js'
import {
  NfseIdempotencyKeyReusedError,
  NfseInvoiceNotFoundError,
  NfseInvoiceTransitionBlockedError,
  NfseIssuancePayloadMissingError,
} from '../domain/nfse-issuance.error.js'
import type {
  NfseInvoiceCancellationTarget,
  NfseInvoiceCompanyContext,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'
import {
  buildNfseProviderConfig,
  createExternalLinkFingerprint,
  loadNfseCredential,
} from './nfse-issuance-attempt.service.js'

const ISSUE_ATTEMPT_KIND: NfseAttemptKind = 'issue'
const EXTERNAL_LINK_AUDIT_ACTION = 'nfse.invoice.external_link'
const EXTERNAL_LINK_PERMISSION = 'nfse.issue'
const EXTERNAL_LINK_SOURCE = 'external_link'
const LINKED_STATUS = 'pending_authorization'

export type LinkNfseInvoiceExternallyInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly invoiceId: string
  readonly providerDocumentId: string
}

export type NfseInvoiceExternalLinkSummary = {
  readonly attemptId: string
  readonly invoiceId: string
  readonly replayed: boolean
  readonly status: typeof LINKED_STATUS
}

export type NfseInvoiceExternalLinkUseCase = {
  execute(input: LinkNfseInvoiceExternallyInput): Promise<NfseInvoiceExternalLinkSummary>
}

/**
 * Liga a nota rejeitada ou falha a uma nota que já existe no portal da Nota RP. Nada é transmitido:
 * a tentativa nasce `accepted` e sem outbox, e o status pull autoriza a nota pelo `id_nota`.
 */
export function createNfseInvoiceExternalLinkUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceExternalLinkUseCase {
  const { now, repository } = dependencies

  return {
    async execute(input) {
      const requestFingerprint = createExternalLinkFingerprint({
        invoiceId: input.invoiceId,
        providerDocumentId: input.providerDocumentId,
      })

      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const replay = await findLinkReplay({ input, requestFingerprint, transaction })
        if (replay !== null) return replay

        const invoice = await transaction.findInvoiceForUpdate({ invoiceId: input.invoiceId })
        if (invoice === null) throw new NfseInvoiceNotFoundError()
        assertLinkable(invoice)

        const credential = await loadNfseCredential(transaction, input.context.companyId)
        const frozen = await transaction.findLatestPayload({
          companyId: input.context.companyId,
          invoiceId: invoice.invoiceId,
        })
        if (frozen === null) throw new NfseIssuancePayloadMissingError()

        const occurredAt = now().toISOString()
        const attempt = await transaction.createAttempt({
          attemptKind: ISSUE_ATTEMPT_KIND,
          correlationId: input.correlationId,
          externalLink: true,
          fiscalEnvironment: credential.fiscalEnvironment,
          idempotencyKey: input.idempotencyKey,
          invoiceId: invoice.invoiceId,
          requestFingerprint,
        })
        await transaction.savePayload({
          attemptId: attempt.attemptId,
          invoiceId: invoice.invoiceId,
          payload: frozen.payload,
          payloadSha256: frozen.payloadSha256,
          providerConfig: {
            ...buildNfseProviderConfig(credential, NFSE_NATIONAL_PROVIDER_API_VERSION),
            externalLink: true,
          },
        })
        await transaction.markExternallyLinked({
          invoiceId: invoice.invoiceId,
          providerDocumentId: input.providerDocumentId,
          requestedAt: occurredAt,
          status: LINKED_STATUS,
        })
        await transaction.appendEvent({
          attemptId: attempt.attemptId,
          eventName: 'accepted',
          invoiceId: invoice.invoiceId,
          occurredAt,
          payload: { source: EXTERNAL_LINK_SOURCE },
        })
        await transaction.appendAudit({
          action: EXTERNAL_LINK_AUDIT_ACTION,
          actorUserId: input.context.userId,
          after: { providerDocumentId: input.providerDocumentId, status: LINKED_STATUS },
          before: { status: invoice.status },
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          invoiceId: invoice.invoiceId,
          permission: EXTERNAL_LINK_PERMISSION,
        })

        return {
          attemptId: attempt.attemptId,
          invoiceId: invoice.invoiceId,
          replayed: false,
          status: LINKED_STATUS,
        }
      })
    },
  }
}

function assertLinkable(invoice: NfseInvoiceCancellationTarget): void {
  const transition = checkNfseInvoiceTransition({
    action: NFSE_INVOICE_ACTION.link,
    status: invoice.status,
  })
  if (!transition.allowed) throw new NfseInvoiceTransitionBlockedError(transition.reason)
}

async function findLinkReplay({
  input,
  requestFingerprint,
  transaction,
}: {
  readonly input: LinkNfseInvoiceExternallyInput
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceExternalLinkSummary | null> {
  const attempt = await transaction.findAttemptByIdempotencyKey({
    idempotencyKey: input.idempotencyKey,
  })
  if (attempt === null) return null
  if (attempt.requestFingerprint !== requestFingerprint) throw new NfseIdempotencyKeyReusedError()

  return {
    attemptId: attempt.attemptId,
    invoiceId: attempt.invoiceId,
    replayed: true,
    status: LINKED_STATUS,
  }
}
