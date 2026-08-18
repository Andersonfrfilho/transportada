/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'
import {
  NFSE_INVOICE_ACTION,
  checkNfseInvoiceTransition,
} from '../domain/nfse-invoice-state.policy.js'
import {
  NfseInvoiceNotFoundError,
  NfseInvoiceTransitionBlockedError,
} from '../domain/nfse-issuance.error.js'
import type {
  NfseInvoiceCancellationTarget,
  NfseInvoiceCompanyContext,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'

export type DiscardNfseInvoiceInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly invoiceId: string
}

export type NfseInvoiceDiscardSummary = {
  readonly invoiceId: string
  readonly releasedDocumentIds: readonly string[]
  readonly replayed: boolean
  readonly status: NfseServiceInvoiceStatus
}

export type NfseInvoiceDiscardUseCase = {
  execute(input: DiscardNfseInvoiceInput): Promise<NfseInvoiceDiscardSummary>
}

/**
 * Descartar não chama a prefeitura: sem viagem, sem tentativa, sem outbox — só a liberação dos
 * vínculos e o status terminal na mesma transação. Diferente do cancelamento, não há replay por
 * chave de idempotência aqui: a segunda chamada encontra a nota já `discarded` e cai no bloqueio
 * de transição, que já é idempotência suficiente para uma operação síncrona.
 */
export function createNfseInvoiceDiscardUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceDiscardUseCase {
  const { now, repository } = dependencies

  return {
    async execute(input) {
      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const { invoice, nextStatus } = await loadDiscardableInvoice(transaction, input.invoiceId)
        const discardedAt = now().toISOString()

        const releasedDocumentIds = await transaction.releaseDocumentLinks({
          cancelledAt: discardedAt,
          invoiceId: invoice.invoiceId,
        })
        await transaction.markDiscarded({
          discardedAt,
          invoiceId: invoice.invoiceId,
          status: nextStatus,
        })

        return {
          invoiceId: invoice.invoiceId,
          releasedDocumentIds,
          replayed: false,
          status: nextStatus,
        }
      })
    },
  }
}

/** O status seguinte vem da tabela de transições, nunca de um literal aqui. */
async function loadDiscardableInvoice(
  transaction: NfseInvoiceTransactionPort,
  invoiceId: string,
): Promise<{
  readonly invoice: NfseInvoiceCancellationTarget
  readonly nextStatus: NfseServiceInvoiceStatus
}> {
  const invoice = await transaction.findInvoiceForUpdate({ invoiceId })
  if (invoice === null) throw new NfseInvoiceNotFoundError()

  const transition = checkNfseInvoiceTransition({
    action: NFSE_INVOICE_ACTION.discard,
    status: invoice.status,
  })
  if (!transition.allowed) throw new NfseInvoiceTransitionBlockedError(transition.reason)
  return { invoice, nextStatus: transition.nextStatus }
}
