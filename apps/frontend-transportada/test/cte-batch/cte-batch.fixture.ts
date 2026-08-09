/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_MANAGE = 'cte.manage'
export const CTE_SUBMIT = 'cte.submit'
export const CTE_CANCEL = 'cte.cancel'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTA3LTIyVDIwOjAwOjAwLjAwMFoiLCIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDA1MDEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'cte-batch-contract-key-0001'
export const SYNTHETIC_SUBMIT_KEY = 'cte-submit-contract-key-0001'

export type CteBatchSummaryContract = Readonly<{
  correlationId: string
  createdAt: string
  id: string
  itemCount: number
  name: string
  status: 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'
  updatedAt: string
  version: string
}>

export type CteBatchEventContract = Readonly<{
  batchId: string
  createdAt: string
  eventName: 'cancelled' | 'created' | 'done' | 'error' | 'in_flight' | 'submitted' | 'updated'
  id: string
  payload: Record<string, unknown>
}>

export type CteBatchPageContract = Readonly<{
  items: readonly CteBatchSummaryContract[]
  nextCursor: null | string
}>

export type CteBatchEventPageContract = Readonly<{
  items: readonly CteBatchEventContract[]
  nextCursor: null | string
}>

export type CteBatchCreateRequestContract = Readonly<{
  documentIds: readonly string[]
  emissionProfileId?: string
  groupingMode?: 'per_invoice' | 'sender_recipient'
  name: string
}>

export const CTE_BATCH_ID = '00000000-0000-4000-8000-000000000501'
export const CTE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'
export const CTE_BLOCKED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000504'
export const CTE_PROFILE_ID = '00000000-0000-4000-8000-000000000505'
export const CTE_REFERENCE_ACCESS_KEY = '35260761156864000191550010000000022000000022'
export const CTE_SUGGESTED_BATCH_NAME = 'CT-e 2026-07-30 #2'

export const CTE_BATCH = {
  correlationId: 'cte-batch-http-correlation',
  createdAt: '2026-07-22T20:00:00.000Z',
  id: CTE_BATCH_ID,
  itemCount: 1,
  name: 'Lote CT-e julho',
  status: 'draft',
  updatedAt: '2026-07-22T20:00:00.000Z',
  version: '1',
} as const satisfies CteBatchSummaryContract

export const CTE_SUBMITTED_BATCH = {
  ...CTE_BATCH,
  status: 'submitted',
} as const satisfies CteBatchSummaryContract

export const CTE_DONE_BATCH_ID = '00000000-0000-4000-8000-000000000509'
export const CTE_DONE_BATCH = {
  correlationId: 'cte-batch-http-correlation-done',
  createdAt: '2026-08-02T11:00:00.000Z',
  id: CTE_DONE_BATCH_ID,
  itemCount: 4,
  name: 'Lote CT-e agosto',
  status: 'done',
  updatedAt: '2026-08-03T09:30:00.000Z',
  version: '3',
} as const satisfies CteBatchSummaryContract

export const CTE_BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000506'
export const CTE_BATCH_REJECTED_ITEM_ID = '00000000-0000-4000-8000-000000000507'
export const CTE_SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-000000000508'
export const CTE_FISCAL_DOCUMENT_ID = '00000000-0000-4000-8000-000000000509'
export const CTE_SECOND_ACCESS_KEY = '35260761156864000191550010000000023000000023'
export const CTE_ISSUED_ACCESS_KEY = '35260761156864000191570010000000011000000010'

export const CTE_BATCH_AUTHORIZED_ITEM = {
  accessKey: CTE_ISSUED_ACCESS_KEY,
  authorizationProtocol: '135260000000001',
  authorizedAt: '2026-07-22T21:00:00.000Z',
  baseAmount: '1058.4800',
  billingStatus: 'invoiced',
  charges: [
    {
      amount: '47.6316',
      baseAmount: '1058.4800',
      calculationType: 'percentage_of_cargo',
      label: 'Frete',
      ordinal: '1',
      rate: '0.045000',
    },
  ],
  documents: [
    {
      accessKey: CTE_REFERENCE_ACCESS_KEY,
      id: CTE_DOCUMENT_ID,
      number: '000000022',
      position: '1',
      series: '001',
      totalAmount: '958.4800',
    },
    {
      accessKey: CTE_SECOND_ACCESS_KEY,
      id: CTE_SECOND_DOCUMENT_ID,
      number: '000000023',
      position: '2',
      series: '001',
      totalAmount: '100.0000',
    },
  ],
  fiscalAmount: '47.63',
  fiscalDocumentId: CTE_FISCAL_DOCUMENT_ID,
  fiscalNumber: '000000011',
  fiscalNumberChange: null,
  fiscalSeries: '001',
  id: CTE_BATCH_ITEM_ID,
  lastErrorCode: null,
  position: '1',
  status: 'authorized',
  totalAmount: '47.6316',
} as const

export const CTE_BATCH_REJECTED_ITEM = {
  accessKey: null,
  authorizationProtocol: null,
  authorizedAt: null,
  baseAmount: '958.4800',
  billingStatus: 'pending',
  charges: [
    {
      amount: '43.1316',
      baseAmount: '958.4800',
      calculationType: 'percentage_of_cargo',
      label: 'Frete',
      ordinal: '1',
      rate: '0.045000',
    },
  ],
  documents: [
    {
      accessKey: CTE_REFERENCE_ACCESS_KEY,
      id: CTE_DOCUMENT_ID,
      number: '000000022',
      position: '1',
      series: '001',
      totalAmount: '958.4800',
    },
  ],
  fiscalAmount: '43.13',
  fiscalDocumentId: null,
  fiscalNumber: null,
  fiscalNumberChange: null,
  fiscalSeries: null,
  id: CTE_BATCH_REJECTED_ITEM_ID,
  lastErrorCode: '539',
  position: '2',
  status: 'rejected',
  totalAmount: '43.1316',
} as const

export const CTE_BATCH_CANCELLED_ITEM = {
  ...CTE_BATCH_AUTHORIZED_ITEM,
  status: 'cancelled',
} as const

/** CT-e autorizado sem protocolo não pode virar evento 110111 — a SEFAZ exige `nProt`. */
export const CTE_BATCH_UNPROTOCOLED_ITEM = {
  ...CTE_BATCH_AUTHORIZED_ITEM,
  authorizationProtocol: null,
} as const

export const CTE_BATCH_ITEMS = [CTE_BATCH_AUTHORIZED_ITEM, CTE_BATCH_REJECTED_ITEM] as const

/** Retorno de `DELETE /cte-batches/:id/items/:itemId`: o lote encolhe e muda de versão. */
export const CTE_BATCH_WITHOUT_ITEM = {
  ...CTE_BATCH,
  itemCount: 0,
  updatedAt: '2026-07-22T20:30:00.000Z',
  version: '2',
} as const satisfies CteBatchSummaryContract

export const CTE_CANCEL_JUSTIFICATION = 'Prestacao de servico nao realizada pelo tomador'
export const SYNTHETIC_CANCEL_KEY = 'cte-cancel-batch-contract-key-0001'

export const CTE_BATCH_EVENT = {
  batchId: CTE_BATCH_ID,
  createdAt: '2026-07-22T20:00:00.000Z',
  eventName: 'created',
  id: '00000000-0000-4000-8000-000000000503',
  payload: { itemCount: 1, status: 'draft' },
} as const satisfies CteBatchEventContract

export const CTE_BATCH_CREATE = {
  documentIds: [CTE_DOCUMENT_ID],
  name: 'Lote CT-e julho',
} as const satisfies CteBatchCreateRequestContract

export const CTE_BATCH_PAGE = {
  items: [CTE_BATCH],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies CteBatchPageContract

/** Espelha `CteBatchPreviewResult` da API: NF-e de referência 958,48 a 4,5% → 43,13. */
export const CTE_BATCH_PREVIEW = {
  blocked: [
    {
      batchId: CTE_BATCH_ID,
      documentId: CTE_BLOCKED_DOCUMENT_ID,
      reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
    },
  ],
  projections: [
    {
      adjustments: [],
      baseAmount: '958.4800',
      calculatedAmount: '43.1316',
      charges: [
        {
          amount: '43.1316',
          baseAmount: '958.4800',
          calculationType: 'percentage_of_cargo',
          label: 'Frete',
          rate: '0.045000',
        },
      ],
      components: [{ amount: '43.1316', calculationType: 'main', label: 'Frete' }],
      documents: [
        {
          accessKey: CTE_REFERENCE_ACCESS_KEY,
          documentId: CTE_DOCUMENT_ID,
          number: '000000022',
          series: '001',
          totalAmount: '958.4800',
        },
      ],
      fiscalAmount: '43.13',
      fiscalComponents: [{ amount: '43.13', calculationType: 'main', label: 'Frete' }],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: CTE_PROFILE_ID,
        matchedBy: 'sender_tax_id',
        name: 'Perfil Zaragoza',
        resolvedBy: 'auto',
      },
      recipientTaxId: '12345678000199',
      senderTaxId: '61156864000191',
    },
  ],
  suggestedName: CTE_SUGGESTED_BATCH_NAME,
  summary: {
    blockedCount: 1,
    documentCount: 2,
    projectedCount: 1,
    totalAmount: '43.13',
  },
} as const

export const CTE_BATCH_EVENTS_PAGE = {
  items: [CTE_BATCH_EVENT],
  nextCursor: null,
} as const satisfies CteBatchEventPageContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
