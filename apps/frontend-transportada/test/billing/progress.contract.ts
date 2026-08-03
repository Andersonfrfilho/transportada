/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { BILLING_INVOICE_ID, loadFutureModule } from './billing.fixture'

const SELECTION_MODULE = '../../src/modules/billing/shared/billingFromSelection.service'
const PROGRESS_MODULE = '../../src/modules/shared/progress.service'

const DUE_DATE = '2026-08-05'

type PreviewGroupContract = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  totalAmount: string
}>

function previewGroup(index: number): PreviewGroupContract {
  return {
    cteCount: 1,
    cteIds: [`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`],
    customerDocument: String(10000000000000 + index),
    customerName: `Tomador ${index}`,
    totalAmount: '10.05',
  }
}

const TEN_GROUPS = Array.from({ length: 10 }, (_unused, index) => previewGroup(index + 1))

function issuedInvoice(invoiceNumber: number) {
  return { id: BILLING_INVOICE_ID, invoiceNumber }
}

describe('billing progress contract', () => {
  test('turns completed over total into a whole percentage a bar can render', async () => {
    const { resolveProgressPercent } = await loadFutureModule<ProgressModule>(PROGRESS_MODULE)

    expect(resolveProgressPercent({ completed: 0, total: 3 })).toBe(0)
    expect(resolveProgressPercent({ completed: 1, total: 3 })).toBe(33)
    expect(resolveProgressPercent({ completed: 2, total: 3 })).toBe(67)
    expect(resolveProgressPercent({ completed: 3, total: 3 })).toBe(100)
    /** Nada de barra vazando: total zero ou contagem fora da faixa não viram NaN nem 120%. */
    expect(resolveProgressPercent({ completed: 0, total: 0 })).toBe(0)
    expect(resolveProgressPercent({ completed: 5, total: 3 })).toBe(100)
    expect(resolveProgressPercent({ completed: -1, total: 3 })).toBe(0)
  })

  test('reports success and failure counts alongside the percentage', async () => {
    const { resolveBillingProgress } =
      await loadFutureModule<BillingProgressModule>(SELECTION_MODULE)

    expect(
      resolveBillingProgress({
        completed: 1,
        outcomes: [{ customerDocument: '10000000000001', invoiceNumber: 17 }],
        total: 4,
      }),
    ).toEqual({ errorCount: 0, isComplete: false, percent: 25, successCount: 1 })
    expect(
      resolveBillingProgress({
        completed: 2,
        outcomes: [
          { customerDocument: '10000000000001', invoiceNumber: 17 },
          { customerDocument: '10000000000002', errorCode: 'BILLING_CTE_NOT_ELIGIBLE' },
        ],
        total: 2,
      }),
    ).toEqual({ errorCount: 1, isComplete: true, percent: 100, successCount: 1 })
    /** Sem grupo nenhum não existe conclusão a comemorar. */
    expect(resolveBillingProgress({ completed: 0, outcomes: [], total: 0 })).toEqual({
      errorCount: 0,
      isComplete: false,
      percent: 0,
      successCount: 0,
    })
  })

  test('announces every finished group while the rest is still running', async () => {
    const { submitBillingGroups } = await loadFutureModule<BillingProgressModule>(SELECTION_MODULE)
    const progress: { completed: number; total: number }[] = []
    let issued = 0

    const outcomes = await submitBillingGroups({
      client: {
        createInvoice: () => {
          issued += 1
          return Promise.resolve(issuedInvoice(issued))
        },
      },
      dueDate: DUE_DATE,
      groups: TEN_GROUPS,
      onProgress: (event) => progress.push(event),
    })

    expect(progress.map((event) => event.completed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(progress.every((event) => event.total === TEN_GROUPS.length)).toBeTrue()
    expect(outcomes.map((outcome) => outcome.customerDocument)).toEqual(
      TEN_GROUPS.map((group) => group.customerDocument),
    )
  })

  test('keeps at most the declared number of invoices in flight', async () => {
    const { submitBillingGroups, BILLING_GROUP_CONCURRENCY } =
      await loadFutureModule<BillingProgressModule>(SELECTION_MODULE)

    expect(BILLING_GROUP_CONCURRENCY).toBe(4)

    let inFlight = 0
    let peakInFlight = 0
    let issued = 0
    await submitBillingGroups({
      client: {
        createInvoice: async () => {
          inFlight += 1
          peakInFlight = Math.max(peakInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 0))
          inFlight -= 1
          issued += 1
          return issuedInvoice(issued)
        },
      },
      dueDate: DUE_DATE,
      groups: TEN_GROUPS,
    })

    expect(peakInFlight).toBeLessThanOrEqual(BILLING_GROUP_CONCURRENCY)
    expect(issued).toBe(TEN_GROUPS.length)
  })

  test('a refused group neither stops the queue nor loses its place in the result', async () => {
    const { submitBillingGroups } = await loadFutureModule<BillingProgressModule>(SELECTION_MODULE)
    const progress: { completed: number; total: number }[] = []
    let issued = 0

    const outcomes = await submitBillingGroups({
      client: {
        createInvoice: (input) => {
          if (input.cteIds.includes(TEN_GROUPS[2]?.cteIds[0] ?? '')) {
            return Promise.reject(new Error('BILLING_CTE_NOT_ELIGIBLE'))
          }
          issued += 1
          return Promise.resolve(issuedInvoice(issued))
        },
      },
      dueDate: DUE_DATE,
      groups: TEN_GROUPS,
      onProgress: (event) => progress.push(event),
    })

    expect(progress).toHaveLength(TEN_GROUPS.length)
    expect(outcomes).toHaveLength(TEN_GROUPS.length)
    expect(outcomes[2]).toEqual({
      customerDocument: TEN_GROUPS[2]?.customerDocument ?? '',
      errorCode: 'BILLING_CTE_NOT_ELIGIBLE',
    })
    expect(outcomes.filter((outcome) => outcome.errorCode !== undefined)).toHaveLength(1)
  })
})

type ProgressModule = {
  readonly resolveProgressPercent: (input: Readonly<{ completed: number; total: number }>) => number
}

type BillingGroupOutcomeContract = Readonly<{
  customerDocument: string
  errorCode?: string
  invoiceNumber?: number
}>

type BillingProgressModule = {
  readonly BILLING_GROUP_CONCURRENCY: number
  readonly resolveBillingProgress: (
    input: Readonly<{
      completed: number
      outcomes: readonly BillingGroupOutcomeContract[]
      total: number
    }>,
  ) => Readonly<{
    errorCount: number
    isComplete: boolean
    percent: number
    successCount: number
  }>
  readonly submitBillingGroups: (
    input: Readonly<{
      client: Readonly<{
        createInvoice: (
          input: Readonly<{ cteIds: readonly string[]; dueDate: string; idempotencyKey: string }>,
        ) => Promise<Readonly<{ id: string; invoiceNumber: number }>>
      }>
      dueDate: string
      groups: readonly PreviewGroupContract[]
      onProgress?: (event: Readonly<{ completed: number; total: number }>) => void
    }>,
  ) => Promise<readonly BillingGroupOutcomeContract[]>
}
