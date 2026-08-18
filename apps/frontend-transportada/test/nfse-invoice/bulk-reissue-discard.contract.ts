/**
 * Contrato da reemissão e do descarte em massa de NFS-e. Mesmo desenho de `bulk-cancel.contract.ts`:
 * decisão pura sobre quem entra no lote (`REISSUABLE_STATUSES`/`DISCARDABLE_STATUSES`, as mesmas da
 * ação avulsa), chave de idempotência por nota dentro de um token só de tentativa, e reemissão em
 * lote sem correção nenhuma — o operador não edita treze campos por nota selecionada.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_INVOICE_LIST_ITEM,
  INVOICE_LIST_ITEM,
  loadFutureModule,
  SECOND_INVOICE_ID,
} from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const REISSUE_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceBulkReissue.service'
const DISCARD_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceBulkDiscard.service'
const ACTIONS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'

const BAR_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceSelectionBar.component.tsx'
const REISSUE_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceBulkReissueDialog.component.tsx'
const DISCARD_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceBulkDiscardDialog.component.tsx'
const REISSUE_HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkReissue.hook.ts'
const DISCARD_HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkDiscard.hook.ts'
const TABLE_HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceTable.hook.ts'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** A API aceita `^[A-Za-z0-9._:-]{16,256}$` no cabeçalho — chave fora disso é 400 antes do domínio. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

const READ_ONLY = ['nfse.read'] as const
const READ_AND_ISSUE = ['nfse.read', 'nfse.issue'] as const
const READ_AND_CANCEL = ['nfse.read', 'nfse.cancel'] as const

const REJECTED_INVOICE = { ...INVOICE_LIST_ITEM, status: 'rejected' } as const
const FAILED_INVOICE = {
  ...INVOICE_LIST_ITEM,
  id: SECOND_INVOICE_ID,
  status: 'failed',
} as const

type BulkBlock = Readonly<{
  invoiceId: string
  reason: string
}>

type BulkPlan = Readonly<{
  blocked: readonly BulkBlock[]
  eligible: readonly Readonly<{ id: string }>[]
  isAllowed: boolean
}>

type BulkReissueModule = {
  planNfseBulkReissue: (
    input: Readonly<{ invoices: readonly unknown[]; permissions: readonly string[] }>,
  ) => BulkPlan
  summarizeNfseBulkReissue: (
    outcomes: readonly Readonly<{ invoiceId: string; isReissued: boolean }>[],
  ) => Readonly<{ failed: number; reissued: number; total: number }>
}

type BulkDiscardModule = {
  planNfseBulkDiscard: (
    input: Readonly<{ invoices: readonly unknown[]; permissions: readonly string[] }>,
  ) => BulkPlan
  summarizeNfseBulkDiscard: (
    outcomes: readonly Readonly<{ invoiceId: string; isDiscarded: boolean }>[],
  ) => Readonly<{ discarded: number; failed: number; total: number }>
}

type ActionsModule = {
  buildNfseDiscardIdempotencyKey: (input: Readonly<{ invoiceId: string; token: string }>) => string
  buildNfseReissueIdempotencyKey: (input: Readonly<{ invoiceId: string; token: string }>) => string
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocaleSection(
  filePath: string,
  section: string,
): Promise<Record<string, unknown>> {
  const locale = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return (locale[section] ?? {}) as Record<string, unknown>
}

describe('nfse bulk reissue plan contract', () => {
  test('só a nota rejeitada ou com falha entra no lote', async () => {
    const { planNfseBulkReissue } = await loadFutureModule<BulkReissueModule>(REISSUE_MODULE)

    const plan = planNfseBulkReissue({
      invoices: [AUTHORIZED_INVOICE_LIST_ITEM, REJECTED_INVOICE, FAILED_INVOICE],
      permissions: READ_AND_ISSUE,
    })

    expect(plan.eligible.map((invoice) => invoice.id)).toEqual([
      REJECTED_INVOICE.id,
      FAILED_INVOICE.id,
    ])
  })

  test('a nota fora do lote diz por que ficou de fora', async () => {
    const { planNfseBulkReissue } = await loadFutureModule<BulkReissueModule>(REISSUE_MODULE)

    const plan = planNfseBulkReissue({
      invoices: [AUTHORIZED_INVOICE_LIST_ITEM],
      permissions: READ_AND_ISSUE,
    })

    expect(plan.blocked).toEqual([
      { invoiceId: AUTHORIZED_INVOICE_LIST_ITEM.id, reason: 'notReissuable' },
    ])
  })

  test('sem `nfse.issue` o lote não é oferecido', async () => {
    const { planNfseBulkReissue } = await loadFutureModule<BulkReissueModule>(REISSUE_MODULE)

    const plan = planNfseBulkReissue({
      invoices: [REJECTED_INVOICE],
      permissions: READ_ONLY,
    })

    expect(plan.isAllowed).toBe(false)
    expect(plan.eligible).toEqual([])
  })
})

describe('nfse bulk reissue summary contract', () => {
  test('o resumo conta o que reemitiu e o que falhou', async () => {
    const { summarizeNfseBulkReissue } = await loadFutureModule<BulkReissueModule>(REISSUE_MODULE)

    const summary = summarizeNfseBulkReissue([
      { invoiceId: REJECTED_INVOICE.id, isReissued: true },
      { invoiceId: FAILED_INVOICE.id, isReissued: false },
    ])

    expect(summary).toEqual({ failed: 1, reissued: 1, total: 2 })
  })

  test('lote vazio não inventa resultado', async () => {
    const { summarizeNfseBulkReissue } = await loadFutureModule<BulkReissueModule>(REISSUE_MODULE)

    expect(summarizeNfseBulkReissue([])).toEqual({ failed: 0, reissued: 0, total: 0 })
  })
})

describe('nfse bulk discard plan contract', () => {
  test('só a nota rejeitada ou com falha entra no lote', async () => {
    const { planNfseBulkDiscard } = await loadFutureModule<BulkDiscardModule>(DISCARD_MODULE)

    const plan = planNfseBulkDiscard({
      invoices: [AUTHORIZED_INVOICE_LIST_ITEM, REJECTED_INVOICE, FAILED_INVOICE],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.eligible.map((invoice) => invoice.id)).toEqual([
      REJECTED_INVOICE.id,
      FAILED_INVOICE.id,
    ])
  })

  test('a nota fora do lote diz por que ficou de fora', async () => {
    const { planNfseBulkDiscard } = await loadFutureModule<BulkDiscardModule>(DISCARD_MODULE)

    const plan = planNfseBulkDiscard({
      invoices: [AUTHORIZED_INVOICE_LIST_ITEM],
      permissions: READ_AND_CANCEL,
    })

    expect(plan.blocked).toEqual([
      { invoiceId: AUTHORIZED_INVOICE_LIST_ITEM.id, reason: 'notDiscardable' },
    ])
  })

  test('sem `nfse.cancel` o lote não é oferecido', async () => {
    const { planNfseBulkDiscard } = await loadFutureModule<BulkDiscardModule>(DISCARD_MODULE)

    const plan = planNfseBulkDiscard({
      invoices: [REJECTED_INVOICE],
      permissions: READ_ONLY,
    })

    expect(plan.isAllowed).toBe(false)
    expect(plan.eligible).toEqual([])
  })
})

describe('nfse bulk discard summary contract', () => {
  test('o resumo conta o que descartou e o que falhou', async () => {
    const { summarizeNfseBulkDiscard } = await loadFutureModule<BulkDiscardModule>(DISCARD_MODULE)

    const summary = summarizeNfseBulkDiscard([
      { invoiceId: REJECTED_INVOICE.id, isDiscarded: true },
      { invoiceId: FAILED_INVOICE.id, isDiscarded: false },
    ])

    expect(summary).toEqual({ discarded: 1, failed: 1, total: 2 })
  })

  test('lote vazio não inventa resultado', async () => {
    const { summarizeNfseBulkDiscard } = await loadFutureModule<BulkDiscardModule>(DISCARD_MODULE)

    expect(summarizeNfseBulkDiscard([])).toEqual({ discarded: 0, failed: 0, total: 0 })
  })
})

describe('nfse bulk reissue and discard idempotency contract', () => {
  test('cada nota do lote de reemissão leva a própria chave', async () => {
    const { buildNfseReissueIdempotencyKey } = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    const first = buildNfseReissueIdempotencyKey({
      invoiceId: REJECTED_INVOICE.id,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })
    const second = buildNfseReissueIdempotencyKey({
      invoiceId: FAILED_INVOICE.id,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })

    expect(first).not.toBe(second)
    expect(first).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(second).toMatch(IDEMPOTENCY_KEY_PATTERN)
  })

  test('cada nota do lote de descarte leva a própria chave', async () => {
    const { buildNfseDiscardIdempotencyKey } = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    const first = buildNfseDiscardIdempotencyKey({
      invoiceId: REJECTED_INVOICE.id,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })
    const second = buildNfseDiscardIdempotencyKey({
      invoiceId: FAILED_INVOICE.id,
      token: 'a3f1c8d2-5b60-4e91-9c74-2d8b5a1f6e30',
    })

    expect(first).not.toBe(second)
    expect(first).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(second).toMatch(IDEMPOTENCY_KEY_PATTERN)
  })
})

describe('nfse bulk reissue and discard rendering contract', () => {
  test('a barra de seleção oferece reemitir e descartar em lote', async () => {
    const bar = await readApplicationFile(BAR_PATH)

    expect(bar).toContain("t('bulkReissue.action')")
    expect(bar).toContain('bulkReissue.isAllowed')
    expect(bar).toContain("t('bulkDiscard.action')")
    expect(bar).toContain('bulkDiscard.isAllowed')
  })

  test('a reemissão em lote é sequencial e não leva correção', async () => {
    const hook = await readApplicationFile(REISSUE_HOOK_PATH)

    expect(hook).toContain('for (const invoice of')
    expect(hook).not.toContain('Promise.all')
    expect(hook).not.toContain('correction')
  })

  test('o descarte em lote é sequencial de propósito', async () => {
    const hook = await readApplicationFile(DISCARD_HOOK_PATH)

    expect(hook).toContain('for (const invoice of')
    expect(hook).not.toContain('Promise.all')
  })

  test('os diálogos mostram quem ficou de fora com o motivo já traduzido', async () => {
    const [reissueDialog, discardDialog] = await Promise.all([
      readApplicationFile(REISSUE_DIALOG_PATH),
      readApplicationFile(DISCARD_DIALOG_PATH),
    ])

    expect(reissueDialog).toContain('plan.blocked')
    expect(discardDialog).toContain('plan.blocked')
    expect(discardDialog).toContain('role="alert"')
  })

  test('a tela monta os dois diálogos do lote e a tabela os alimenta', async () => {
    const [page, tableHook] = await Promise.all([
      readApplicationFile(PAGE_PATH),
      readApplicationFile(TABLE_HOOK_PATH),
    ])

    expect(page).toContain('NfseInvoiceBulkReissueDialog')
    expect(page).toContain('NfseInvoiceBulkDiscardDialog')
    expect(tableHook).toContain('useNfseInvoiceBulkReissue')
    expect(tableHook).toContain('useNfseInvoiceBulkDiscard')
  })
})

describe('nfse bulk reissue and discard locale contract', () => {
  test('pt e en descrevem a reemissão em lote com as mesmas chaves', async () => {
    const [pt, en] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH, 'bulkReissue'),
      readLocaleSection(EN_LOCALE_PATH, 'bulkReissue'),
    ])

    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(pt)).toContain('action')
  })

  test('pt e en descrevem o descarte em lote com as mesmas chaves', async () => {
    const [pt, en] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH, 'bulkDiscard'),
      readLocaleSection(EN_LOCALE_PATH, 'bulkDiscard'),
    ])

    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(pt)).toContain('action')
  })

  test('o feedback traz o motivo de bloqueio das duas ações', async () => {
    const [pt, en] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH, 'feedback'),
      readLocaleSection(EN_LOCALE_PATH, 'feedback'),
    ])

    expect(pt).toHaveProperty('notReissuable')
    expect(pt).toHaveProperty('notDiscardable')
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
  })
})
