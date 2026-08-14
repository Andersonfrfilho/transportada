/**
 * Contrato do cancelamento em massa de NFS-e. A seleção existia só para informar contagem e total;
 * aqui ela passa a agir. Quem entra no lote é decisão pura — mesma tabela de transições da API,
 * `authorized` → `cancellation_requested` —, e o que a prefeitura recusa fica de fora com o motivo à
 * mostra, em vez de virar 409 silencioso.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_INVOICE_LIST_ITEM,
  INVOICE_LIST_ITEM,
  loadFutureModule,
  SECOND_INVOICE_ID,
} from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const BULK_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceBulkCancel.service'
const ACTIONS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'

const BAR_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceSelectionBar.component.tsx'
const DIALOG_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceBulkCancelDialog.component.tsx'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkCancel.hook.ts'
const TABLE_HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceTable.hook.ts'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** A API aceita `^[A-Za-z0-9._:-]{16,256}$` no cabeçalho — chave fora disso é 400 antes do domínio. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

const READ_ONLY = ['nfse.read'] as const
const READ_AND_CANCEL = ['nfse.read', 'nfse.cancel'] as const

const CANCELLED_INVOICE = { ...INVOICE_LIST_ITEM, status: 'cancelled' } as const
const IN_FLIGHT_INVOICE = {
  ...INVOICE_LIST_ITEM,
  status: 'cancellation_requested',
} as const

type BulkCancelBlock = Readonly<{
  invoiceId: string
  reason: string
}>

type BulkCancelPlan = Readonly<{
  blocked: readonly BulkCancelBlock[]
  eligible: readonly Readonly<{ id: string }>[]
  isAllowed: boolean
}>

type BulkCancelSummary = Readonly<{
  cancelled: number
  failed: number
  total: number
}>

type BulkCancelModule = {
  planNfseBulkCancellation: (
    input: Readonly<{
      invoices: readonly unknown[]
      permissions: readonly string[]
    }>,
  ) => BulkCancelPlan
  summarizeNfseBulkCancellation: (
    outcomes: readonly Readonly<{ invoiceId: string; isCancelled: boolean }>[],
  ) => BulkCancelSummary
}

type ActionsModule = {
  buildNfseCancellationIdempotencyKey: (
    input: Readonly<{ invoiceId: string; token: string }>,
  ) => string
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocaleSection(filePath: string): Promise<Record<string, unknown>> {
  const locale = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return (locale['bulkCancel'] ?? {}) as Record<string, unknown>
}

describe('nfse bulk cancellation plan contract', () => {
  test('só a nota autorizada entra no lote', async () => {
    const { planNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const plan = planNfseBulkCancellation({
      invoices: [INVOICE_LIST_ITEM, AUTHORIZED_INVOICE_LIST_ITEM],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.eligible.map((invoice) => invoice.id)).toEqual([SECOND_INVOICE_ID])
  })

  test('a nota fora do lote diz por que ficou de fora', async () => {
    const { planNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const plan = planNfseBulkCancellation({
      invoices: [CANCELLED_INVOICE, AUTHORIZED_INVOICE_LIST_ITEM],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.blocked).toEqual([{ invoiceId: CANCELLED_INVOICE.id, reason: 'alreadyCancelled' }])
  })

  test('cancelamento já em andamento não é reenviado', async () => {
    const { planNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const plan = planNfseBulkCancellation({
      invoices: [IN_FLIGHT_INVOICE],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.eligible).toEqual([])
    expect(plan.blocked).toEqual([
      { invoiceId: IN_FLIGHT_INVOICE.id, reason: 'cancellationInFlight' },
    ])
  })

  test('a nota que nunca foi autorizada fica de fora pelo motivo dela', async () => {
    const { planNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const plan = planNfseBulkCancellation({
      invoices: [INVOICE_LIST_ITEM],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.blocked).toEqual([{ invoiceId: INVOICE_LIST_ITEM.id, reason: 'notAuthorized' }])
  })

  test('sem `nfse.cancel` o lote não é oferecido', async () => {
    const { planNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const plan = planNfseBulkCancellation({
      invoices: [AUTHORIZED_INVOICE_LIST_ITEM],
      permissions: READ_ONLY,
    })

    expect(plan.isAllowed).toBe(false)
    expect(plan.eligible).toEqual([])
  })
})

describe('nfse bulk cancellation summary contract', () => {
  test('o resumo conta o que cancelou e o que falhou', async () => {
    const { summarizeNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    const summary = summarizeNfseBulkCancellation([
      { invoiceId: INVOICE_LIST_ITEM.id, isCancelled: true },
      { invoiceId: SECOND_INVOICE_ID, isCancelled: false },
    ])

    expect(summary).toEqual({ cancelled: 1, failed: 1, total: 2 })
  })

  test('lote vazio não inventa resultado', async () => {
    const { summarizeNfseBulkCancellation } = await loadFutureModule<BulkCancelModule>(BULK_MODULE)

    expect(summarizeNfseBulkCancellation([])).toEqual({ cancelled: 0, failed: 0, total: 0 })
  })
})

describe('nfse bulk cancellation idempotency contract', () => {
  test('cada nota do lote leva a própria chave', async () => {
    const { buildNfseCancellationIdempotencyKey } =
      await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    const first = buildNfseCancellationIdempotencyKey({
      invoiceId: INVOICE_LIST_ITEM.id,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })
    const second = buildNfseCancellationIdempotencyKey({
      invoiceId: SECOND_INVOICE_ID,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })

    expect(first).not.toBe(second)
    expect(first).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(second).toMatch(IDEMPOTENCY_KEY_PATTERN)
  })
})

describe('nfse bulk cancellation rendering contract', () => {
  test('a barra de seleção oferece o cancelamento do lote', async () => {
    const bar = await readApplicationFile(BAR_PATH)

    expect(bar).toContain("t('bulkCancel.action')")
    expect(bar).toContain('bulkCancel.isAllowed')
  })

  test('a justificativa do lote passa pela mesma validação da nota avulsa', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('validateNfseCancellationReason')
    expect(hook).toContain('buildNfseCancellationIdempotencyKey')
  })

  test('o lote é sequencial de propósito: a prefeitura é um terceiro', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('for (const invoice of')
    expect(hook).not.toContain('Promise.all')
  })

  test('o diálogo mostra quem ficou de fora com o motivo já traduzido', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('feedback.${')
    expect(dialog).toContain('plan.blocked')
  })

  test('a tela monta o diálogo do lote e a tabela o alimenta', async () => {
    const [page, tableHook] = await Promise.all([
      readApplicationFile(PAGE_PATH),
      readApplicationFile(TABLE_HOOK_PATH),
    ])

    expect(page).toContain('NfseInvoiceBulkCancelDialog')
    expect(tableHook).toContain('useNfseInvoiceBulkCancel')
    expect(tableHook).toContain('selectedInvoices')
  })
})

describe('nfse bulk cancellation locale contract', () => {
  test('pt e en descrevem o lote com as mesmas chaves', async () => {
    const [pt, en] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH),
      readLocaleSection(EN_LOCALE_PATH),
    ])

    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(pt)).toContain('action')
  })
})
