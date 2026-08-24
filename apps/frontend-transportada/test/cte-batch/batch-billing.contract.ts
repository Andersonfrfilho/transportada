/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { submitBillingGroups } from '@/modules/billing/shared/billingFromSelection.service'
import type { CteBatchSummary } from '@/modules/cte-batch/shared/cteBatchClient.service'

import { CTE_BATCH_ID, loadFutureModule } from './cte-batch.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const BILLING_MODULE = '../../src/modules/cte-batch/shared/cteBatchBilling.service'

const ROW_ACTIONS = 'src/modules/cte-batch/components/CteBatchRowActions.component.tsx'
const SELECTION_BAR = 'src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'
const BILLING_DIALOG = 'src/modules/cte-batch/components/CteBillingDialog.component.tsx'
const BILLING_HOOK = 'src/modules/cte-batch/hooks/useCteBillingDialog.hook.ts'
const ITEMS_PANEL = 'src/modules/cte-batch/components/CteBatchItemsPanel.component.tsx'
const WORKSPACE_PAGE = 'src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'
const PROGRESS_COMPONENT = 'src/components/ui/progress.tsx'
const PROGRESS_STYLES = 'src/components/ui/progress.module.css'

const BILLING_CREATE_PERMISSION = 'billing.create'
const CTE_SUBMIT_PERMISSION = 'cte.submit'

const DONE_BATCH = {
  correlationId: 'cte-batch-http-correlation',
  createdAt: '2026-07-22T20:00:00.000Z',
  id: CTE_BATCH_ID,
  itemCount: 12,
  name: 'Lote CT-e julho',
  status: 'done',
  updatedAt: '2026-07-22T21:00:00.000Z',
  version: '3',
} as const satisfies CteBatchSummary

function batchWithStatus(status: CteBatchSummary['status']): CteBatchSummary {
  return { ...DONE_BATCH, status }
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('cte batch billing contract', () => {
  test('only a transmitted batch can be invoiced, and only with the billing permission', async () => {
    const { canBillBatch } = await loadFutureModule<CteBatchBillingModule>(BILLING_MODULE)
    const permissions = [BILLING_CREATE_PERMISSION, CTE_SUBMIT_PERMISSION]

    expect(canBillBatch({ batch: DONE_BATCH, permissions })).toBeTrue()
    expect(canBillBatch({ batch: batchWithStatus('submitted'), permissions })).toBeTrue()
    expect(canBillBatch({ batch: batchWithStatus('error'), permissions })).toBeTrue()
    /** Rascunho e transmissão em curso ainda não têm CT-e autorizado para faturar. */
    expect(canBillBatch({ batch: batchWithStatus('draft'), permissions })).toBeFalse()
    expect(canBillBatch({ batch: batchWithStatus('in_flight'), permissions })).toBeFalse()
    expect(canBillBatch({ batch: batchWithStatus('cancelled'), permissions })).toBeFalse()
    expect(canBillBatch({ batch: DONE_BATCH, permissions: [CTE_SUBMIT_PERMISSION] })).toBeFalse()
    expect(canBillBatch({ batch: DONE_BATCH, permissions: [] })).toBeFalse()
  })

  test('the bulk bar bills only the selected batches that accept it', async () => {
    const { collectBillableBatches } = await loadFutureModule<CteBatchBillingModule>(BILLING_MODULE)

    expect(
      collectBillableBatches({
        batches: [DONE_BATCH, batchWithStatus('draft'), batchWithStatus('submitted')],
        permissions: [BILLING_CREATE_PERMISSION],
      }).map((batch) => batch.status),
    ).toEqual(['done', 'submitted'])
    expect(
      collectBillableBatches({ batches: [DONE_BATCH], permissions: [CTE_SUBMIT_PERMISSION] }),
    ).toEqual([])
  })

  test('each finished group is announced with its own result, not only with a counter', async () => {
    const events: { completed: number; customerDocument: string; total: number }[] = []

    await submitBillingGroups({
      client: {
        createInvoice: () => Promise.reject(new Error('BILLING_CTE_NOT_ELIGIBLE')),
      },
      dueDate: '2026-08-05',
      groups: [
        {
          cteCount: 1,
          cteIds: ['00000000-0000-4000-8000-000000000901'],
          customerDocument: '11222333000181',
          customerName: 'Cliente Alfa Ltda',
          totalAmount: '10.05',
        },
      ],
      onProgress: (event) => {
        events.push({
          completed: event.completed,
          customerDocument: event.outcome.customerDocument,
          total: event.total,
        })
      },
    })

    expect(events).toEqual([{ completed: 1, customerDocument: '11222333000181', total: 1 }])
  })

  test('the batch row and the bulk bar both offer the invoice action', async () => {
    const [rowActions, selectionBar] = await Promise.all([
      readModule(ROW_ACTIONS),
      readModule(SELECTION_BAR),
    ])

    expect(rowActions).toContain('canBillBatch')
    expect(rowActions).toContain('onBill')
    expect(rowActions).toContain('actions.bill')
    expect(selectionBar).toContain('collectBillableBatches')
    expect(selectionBar).toContain('onBill')
    expect(selectionBar).toContain('actions.bill')
  })

  test('the batch mode resolves the eligible CT-es itself instead of previewing beyond the cap', async () => {
    const hook = await readModule(BILLING_HOOK)

    expect(hook).toContain('collectBillableCtesForBatches')
    expect(hook).toContain('groupEligibleCtesByCustomer')
    expect(hook).toContain('listBillableCtesForBatches')
    expect(hook).toContain('resolveBillingProgress')
    expect(hook).toContain('onProgress')
    /** O modal continua sem falar HTTP na mão — quem fala com a API é o client do módulo. */
    expect(hook).not.toContain('fetch(')
  })

  /**
   * `isPending` do TanStack Query só cai quando a promise do `onSuccess` resolve. Esperar a
   * revalidação ali prendia "Gerando..." depois do 100%, com as faturas já emitidas — e o operador
   * lia trabalho pendente onde havia só cache esfriando.
   */
  test('does not hold the submit button while the invalidated lists refetch', async () => {
    const hook = await readModule(BILLING_HOOK)

    expect(hook).toContain('void invalidateMutationEffect(')
    expect(hook).not.toContain('await invalidateMutationEffect(')
    expect(hook).not.toMatch(/onSuccess:\s*async/)
  })

  test('the dialog shows an accessible progress bar with the percentage in text', async () => {
    const [dialog, progress] = await Promise.all([
      readModule(BILLING_DIALOG),
      readModule(PROGRESS_COMPONENT),
    ])

    expect(dialog).toContain('ProgressBar')
    expect(dialog).toContain('billing.progress')
    expect(progress).toContain('role="progressbar"')
    expect(progress).toContain('aria-valuenow')
    expect(progress).toContain('aria-valuemin')
    expect(progress).toContain('aria-valuemax')
    expect(progress).toContain('aria-valuetext')
    expect(progress).toContain('resolveProgressPercent')
    expect(dialog).not.toContain('<select')
  })

  /**
   * Faturar a seleção congelada e faturar o lote inteiro são intenções diferentes: a barra de
   * seleção continua com a primeira, e o painel do lote ganha a segunda ao lado de transmitir.
   */
  test('the batch panel offers billing the whole batch, gated by the same permission', async () => {
    const [panel, page] = await Promise.all([readModule(ITEMS_PANEL), readModule(WORKSPACE_PAGE)])

    expect(panel).toContain('canBillBatch')
    expect(panel).toContain('actions.billBatch')
    expect(panel).toContain('onBill')
    /** O painel não abre o modal sozinho: quem guarda `billingBatchIds` é a página. */
    expect(panel).not.toContain('useCteBillingDialog')
    expect(page).toContain('onBill={() => handleBill([openBatch])}')
  })

  test('the progress bar counts CT-e, not invoice requests', async () => {
    const dialog = await readModule(BILLING_DIALOG)

    expect(dialog).toContain('dialog.progress.completedCteCount')
    expect(dialog).toContain('dialog.progress.totalCteCount')
    expect(dialog).not.toContain('total={dialog.groups.length}')
  })

  test('the animated bar respects who asked for less motion and stays on the design tokens', async () => {
    const styles = await readModule(PROGRESS_STYLES)

    expect(styles).toContain('prefers-reduced-motion: reduce')
    expect(styles).toContain('var(--color-')
    /** Hexadecimal novo é dívida de design system: a barra vive dos tokens do `:root`. */
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

type CteBatchBillingModule = {
  readonly canBillBatch: (
    input: Readonly<{ batch: CteBatchSummary; permissions: readonly string[] }>,
  ) => boolean
  readonly collectBillableBatches: (
    input: Readonly<{ batches: readonly CteBatchSummary[]; permissions: readonly string[] }>,
  ) => readonly CteBatchSummary[]
}
