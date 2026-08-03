/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  accumulateCteItemAmounts,
  type CteItemAmounts,
} from '@/modules/cte-batch/shared/cteBatchItemSelection.service'
import type { CompanyCteItem } from '@/modules/cte-batch/shared/cteBatchItem.types'

import { CTE_BATCH_ID, CTE_DONE_BATCH_ID, loadFutureModule } from './cte-batch.fixture'

const BILLING_MODULE = '../../src/modules/cte-batch/shared/cteBatchBilling.service'

const BILLING_CREATE_PERMISSION = 'billing.create'
const BILLING_READ_PERMISSION = 'billing.read'

const AUTHORIZED_ITEM_ID = '00000000-0000-4000-8000-000000000701'
const SECOND_ITEM_ID = '00000000-0000-4000-8000-000000000702'
const PENDING_ITEM_ID = '00000000-0000-4000-8000-000000000703'
const DOCUMENTLESS_ITEM_ID = '00000000-0000-4000-8000-000000000704'
const UNKNOWN_ITEM_ID = '00000000-0000-4000-8000-000000000705'

const FIRST_FISCAL_DOCUMENT_ID = '00000000-0000-4000-8000-000000000801'
const SECOND_FISCAL_DOCUMENT_ID = '00000000-0000-4000-8000-000000000802'

const AUTHORIZED_ROW = {
  accessKey: null,
  authorizationProtocol: '135260000000001',
  authorizedAt: '2026-07-22T21:00:00.000Z',
  baseAmount: '1058.4800',
  batchId: CTE_BATCH_ID,
  batchName: 'Lote CT-e julho',
  billingStatus: 'pending',
  charges: [],
  createdAt: '2026-07-22T20:10:00.000Z',
  documents: [],
  fiscalAmount: '47.63',
  fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID,
  fiscalNumber: '000000011',
  fiscalSeries: '001',
  id: AUTHORIZED_ITEM_ID,
  lastErrorCode: null,
  position: '1',
  status: 'authorized',
  totalAmount: '47.6316',
} as const satisfies CompanyCteItem

const SECOND_AUTHORIZED_ROW = {
  ...AUTHORIZED_ROW,
  batchId: CTE_DONE_BATCH_ID,
  batchName: 'Lote CT-e agosto',
  baseAmount: '958.4800',
  fiscalDocumentId: SECOND_FISCAL_DOCUMENT_ID,
  id: SECOND_ITEM_ID,
  totalAmount: '43.1316',
} as const satisfies CompanyCteItem

/** Pendente ainda não tem documento fiscal — o bloqueio tem de ser pelo status, não pelo id ausente. */
const PENDING_ROW = {
  ...AUTHORIZED_ROW,
  authorizationProtocol: null,
  authorizedAt: null,
  fiscalDocumentId: null,
  fiscalNumber: null,
  fiscalSeries: null,
  id: PENDING_ITEM_ID,
  status: 'pending',
} as const satisfies CompanyCteItem

/** Autorizado sem documento fiscal projetado: a API não teria id para faturar. */
const DOCUMENTLESS_ROW = {
  ...AUTHORIZED_ROW,
  fiscalDocumentId: null,
  id: DOCUMENTLESS_ITEM_ID,
} as const satisfies CompanyCteItem

type CteBillingBlockReason = 'missing_document' | 'not_authorized' | 'unknown_item'

type BillableCte = Readonly<{ fiscalDocumentId: string; itemId: string }>

type CteBillingModule = Readonly<{
  CTE_BILLING_BLOCK_REASON: Readonly<{
    MISSING_DOCUMENT: 'missing_document'
    NOT_AUTHORIZED: 'not_authorized'
    UNKNOWN_ITEM: 'unknown_item'
  }>
  canBillSelection: (
    input: Readonly<{ billable: readonly BillableCte[]; permissions: readonly string[] }>,
  ) => boolean
  collectBillableCtes: (
    input: Readonly<{
      amounts: ReadonlyMap<string, CteItemAmounts>
      selectedIds: readonly string[]
    }>,
  ) => Readonly<{
    billable: readonly BillableCte[]
    blocked: readonly Readonly<{ itemId: string; reason: CteBillingBlockReason }>[]
  }>
}>

function amountsFor(items: readonly CompanyCteItem[]): ReadonlyMap<string, CteItemAmounts> {
  return accumulateCteItemAmounts({ items, known: new Map() })
}

describe('cte item billing selection contract', () => {
  test('keeps the fiscal document and the status in the accumulated map', () => {
    const amounts = amountsFor([AUTHORIZED_ROW, PENDING_ROW])

    expect(amounts.get(AUTHORIZED_ITEM_ID)).toEqual({
      batchId: CTE_BATCH_ID,
      baseAmount: '1058.4800',
      fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID,
      status: 'authorized',
      totalAmount: '47.6316',
    })
    expect(amounts.get(PENDING_ITEM_ID)?.fiscalDocumentId).toBeNull()
    expect(amounts.get(PENDING_ITEM_ID)?.status).toBe('pending')
  })

  test('bills an item whose page was already discarded, reading only the accumulated map', async () => {
    const { collectBillableCtes } = await loadFutureModule<CteBillingModule>(BILLING_MODULE)

    const firstPage = accumulateCteItemAmounts({ items: [AUTHORIZED_ROW], known: new Map() })
    const bothPages = accumulateCteItemAmounts({ items: [SECOND_AUTHORIZED_ROW], known: firstPage })

    expect(
      collectBillableCtes({
        amounts: bothPages,
        selectedIds: [AUTHORIZED_ITEM_ID, SECOND_ITEM_ID],
      }),
    ).toEqual({
      billable: [
        { fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID, itemId: AUTHORIZED_ITEM_ID },
        { fiscalDocumentId: SECOND_FISCAL_DOCUMENT_ID, itemId: SECOND_ITEM_ID },
      ],
      blocked: [],
    })
  })

  test('blocks locally what the API would refuse, keeping the selected order', async () => {
    const { CTE_BILLING_BLOCK_REASON, collectBillableCtes } =
      await loadFutureModule<CteBillingModule>(BILLING_MODULE)

    const amounts = amountsFor([AUTHORIZED_ROW, PENDING_ROW, DOCUMENTLESS_ROW])

    expect(
      collectBillableCtes({
        amounts,
        selectedIds: [PENDING_ITEM_ID, AUTHORIZED_ITEM_ID, DOCUMENTLESS_ITEM_ID, UNKNOWN_ITEM_ID],
      }),
    ).toEqual({
      billable: [{ fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID, itemId: AUTHORIZED_ITEM_ID }],
      blocked: [
        { itemId: PENDING_ITEM_ID, reason: CTE_BILLING_BLOCK_REASON.NOT_AUTHORIZED },
        { itemId: DOCUMENTLESS_ITEM_ID, reason: CTE_BILLING_BLOCK_REASON.MISSING_DOCUMENT },
        { itemId: UNKNOWN_ITEM_ID, reason: CTE_BILLING_BLOCK_REASON.UNKNOWN_ITEM },
      ],
    })
    expect(CTE_BILLING_BLOCK_REASON).toEqual({
      MISSING_DOCUMENT: 'missing_document',
      NOT_AUTHORIZED: 'not_authorized',
      UNKNOWN_ITEM: 'unknown_item',
    })
  })

  test('never repeats a fiscal document when the same item appears twice in the selection', async () => {
    const { collectBillableCtes } = await loadFutureModule<CteBillingModule>(BILLING_MODULE)

    expect(
      collectBillableCtes({
        amounts: amountsFor([AUTHORIZED_ROW]),
        selectedIds: [AUTHORIZED_ITEM_ID, AUTHORIZED_ITEM_ID],
      }).billable,
    ).toEqual([{ fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID, itemId: AUTHORIZED_ITEM_ID }])
  })

  test('requires the billing create permission and at least one billable CT-e', async () => {
    const { canBillSelection } = await loadFutureModule<CteBillingModule>(BILLING_MODULE)

    const billable = [{ fiscalDocumentId: FIRST_FISCAL_DOCUMENT_ID, itemId: AUTHORIZED_ITEM_ID }]

    expect(canBillSelection({ billable, permissions: [BILLING_CREATE_PERMISSION] })).toBeTrue()
    expect(canBillSelection({ billable, permissions: [BILLING_READ_PERMISSION] })).toBeFalse()
    expect(canBillSelection({ billable, permissions: [] })).toBeFalse()
    expect(canBillSelection({ billable: [], permissions: [BILLING_CREATE_PERMISSION] })).toBeFalse()
  })
})
