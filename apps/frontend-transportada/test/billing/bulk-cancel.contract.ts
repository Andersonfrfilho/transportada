/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './billing.fixture'

const BULK_CANCEL_MODULE = '../../src/modules/billing/shared/billingBulkCancel.service'

const REASON = 'Fatura emitida em duplicidade'

type InvoiceContract = Readonly<{ id: string; invoiceNumber: number; status: string }>

function invoice(
  invoiceNumber: number,
  status: 'cancelled' | 'issued' = 'issued',
): InvoiceContract {
  return {
    id: `00000000-0000-4000-8000-${String(invoiceNumber).padStart(12, '0')}`,
    invoiceNumber,
    status,
  }
}

describe('billing bulk cancel contract', () => {
  /** Cancelar de novo devolve 409: a fatura já cancelada sai da fila antes de virar requisição. */
  test('splits the selection into what can be cancelled and what already was', async () => {
    const { selectCancellableInvoices } =
      await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)
    const invoices = [invoice(1), invoice(2, 'cancelled'), invoice(3)]

    const selection = selectCancellableInvoices({
      invoices,
      selectedIds: [invoices[0]!.id, invoices[1]!.id],
    })

    expect(selection.cancellable.map((item) => item.invoiceNumber)).toEqual([1])
    expect(selection.alreadyCancelled.map((item) => item.invoiceNumber)).toEqual([2])
  })

  /** Id selecionado que não está mais na página não vira requisição às cegas. */
  test('ignores selected ids missing from the loaded page', async () => {
    const { selectCancellableInvoices } =
      await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)

    const selection = selectCancellableInvoices({
      invoices: [invoice(1)],
      selectedIds: ['00000000-0000-4000-8000-000000000999'],
    })

    expect(selection.cancellable).toEqual([])
    expect(selection.alreadyCancelled).toEqual([])
  })

  /** Cancelamento é irreversível: sem motivo escrito o botão não pode nem ficar clicável. */
  test('demands a reason long enough to explain the cancellation', async () => {
    const { validateBillingCancelReason, BILLING_CANCEL_REASON_ERROR } =
      await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)

    expect(validateBillingCancelReason('   ')).toBe(BILLING_CANCEL_REASON_ERROR.REQUIRED)
    expect(validateBillingCancelReason('ab')).toBe(BILLING_CANCEL_REASON_ERROR.TOO_SHORT)
    expect(validateBillingCancelReason(REASON)).toBeNull()
  })

  /** Uma falha no meio não pode abortar as outras — cada fatura responde por si. */
  test('cancels every invoice and keeps going after a failure', async () => {
    const { cancelBillingInvoices } = await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)
    const invoices = [invoice(1), invoice(2), invoice(3)]
    const requested: string[] = []
    const events: number[] = []

    const outcomes = await cancelBillingInvoices({
      client: {
        cancelInvoice: (input) => {
          requested.push(input.reason)
          if (input.invoiceId === invoices[1]!.id) {
            return Promise.reject(new Error('BILLING_INVOICE_NOT_CANCELLABLE'))
          }
          return Promise.resolve({ id: input.invoiceId, invoiceNumber: 0, status: 'cancelled' })
        },
      },
      invoices,
      onProgress: (event) => events.push(event.completed),
      reason: `  ${REASON}  `,
    })

    expect(outcomes).toHaveLength(3)
    expect(outcomes[0]?.errorCode).toBeUndefined()
    expect(outcomes[1]?.errorCode).toBe('BILLING_INVOICE_NOT_CANCELLABLE')
    expect(outcomes[2]?.errorCode).toBeUndefined()
    /** O motivo chega aparado: espaço em volta não é justificativa. */
    expect(requested).toEqual([REASON, REASON, REASON])
    expect(events).toEqual([1, 2, 3])
  })

  /** O número da fatura é o que o operador reconhece no relatório de falhas, não o uuid. */
  test('reports each outcome by invoice number', async () => {
    const { cancelBillingInvoices } = await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)

    const outcomes = await cancelBillingInvoices({
      client: {
        cancelInvoice: (input) =>
          Promise.resolve({ id: input.invoiceId, invoiceNumber: 0, status: 'cancelled' }),
      },
      invoices: [invoice(17)],
      reason: REASON,
    })

    expect(outcomes[0]?.invoiceNumber).toBe(17)
  })

  test('measures progress in invoices and closes only when every one answered', async () => {
    const { resolveBillingCancelProgress } =
      await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)

    const partial = resolveBillingCancelProgress({
      completed: 1,
      outcomes: [{ invoiceId: invoice(1).id, invoiceNumber: 1 }],
      total: 4,
    })
    expect(partial).toEqual({
      errorCount: 0,
      isComplete: false,
      percent: 25,
      successCount: 1,
      total: 4,
    })

    const finished = resolveBillingCancelProgress({
      completed: 2,
      outcomes: [
        { invoiceId: invoice(1).id, invoiceNumber: 1 },
        {
          errorCode: 'BILLING_INVOICE_NOT_CANCELLABLE',
          invoiceId: invoice(2).id,
          invoiceNumber: 2,
        },
      ],
      total: 2,
    })
    expect(finished).toEqual({
      errorCount: 1,
      isComplete: true,
      percent: 100,
      successCount: 1,
      total: 2,
    })
  })

  /** Sem seleção não há progresso a mostrar — e nem barra que divida por zero. */
  test('reports no progress for an empty selection', async () => {
    const { resolveBillingCancelProgress } =
      await loadFutureModule<BulkCancelModule>(BULK_CANCEL_MODULE)

    expect(resolveBillingCancelProgress({ completed: 0, outcomes: [], total: 0 })).toEqual({
      errorCount: 0,
      isComplete: false,
      percent: 0,
      successCount: 0,
      total: 0,
    })
  })
})

type BulkCancelOutcomeContract = Readonly<{
  errorCode?: string
  invoiceId: string
  invoiceNumber: number
}>

type BulkCancelModule = {
  readonly BILLING_CANCEL_REASON_ERROR: Readonly<{ REQUIRED: string; TOO_SHORT: string }>
  readonly cancelBillingInvoices: (
    input: Readonly<{
      client: Readonly<{
        cancelInvoice: (
          input: Readonly<{ invoiceId: string; reason: string }>,
        ) => Promise<InvoiceContract>
      }>
      invoices: readonly InvoiceContract[]
      onProgress?: (event: Readonly<{ completed: number; total: number }>) => void
      reason: string
    }>,
  ) => Promise<readonly BulkCancelOutcomeContract[]>
  readonly resolveBillingCancelProgress: (
    input: Readonly<{
      completed: number
      outcomes: readonly BulkCancelOutcomeContract[]
      total: number
    }>,
  ) => Readonly<{
    errorCount: number
    isComplete: boolean
    percent: number
    successCount: number
    total: number
  }>
  readonly selectCancellableInvoices: (
    input: Readonly<{ invoices: readonly InvoiceContract[]; selectedIds: readonly string[] }>,
  ) => Readonly<{
    alreadyCancelled: readonly InvoiceContract[]
    cancellable: readonly InvoiceContract[]
  }>
  readonly validateBillingCancelReason: (value: string) => null | string
}
