/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_MANAGE = 'cte.manage'
export const CTE_SUBMIT = 'cte.submit'
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
  name: string
}>

export const CTE_BATCH_ID = '00000000-0000-4000-8000-000000000501'
export const CTE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'

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

export const CTE_BATCH_EVENTS_PAGE = {
  items: [CTE_BATCH_EVENT],
  nextCursor: null,
} as const satisfies CteBatchEventPageContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
