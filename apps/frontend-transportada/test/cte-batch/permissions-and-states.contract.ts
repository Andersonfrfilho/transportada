/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH,
  CTE_BATCH_CREATE,
  CTE_BATCH_EVENTS_PAGE,
  CTE_BATCH_ITEM_ID,
  CTE_BATCH_PAGE,
  CTE_BATCH_WITHOUT_ITEM,
  CTE_MANAGE,
  CTE_SUBMIT,
  loadFutureModule,
} from './cte-batch.fixture'

describe('CT-e batch permissions and states contract', () => {
  test('exposes draft controls only to cte.manage and submit/status controls only to cte.submit', async () => {
    const { createCteBatchController } = await loadFutureModule<CteBatchHookModule>(
      '../../src/modules/cte-batch/hooks/useCteBatchWorkspace.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createCteBatchController({ client, permissions: [] })
    expect(forbiddenController.canManageBatches).toBe(false)
    expect(forbiddenController.canSubmitBatches).toBe(false)
    expect(
      await forbiddenController.createBatch(CTE_BATCH_CREATE).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_BATCH_FORBIDDEN' }))
    expect(
      await forbiddenController.submitBatch(CTE_BATCH.id).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_BATCH_FORBIDDEN' }))
    expect(
      await forbiddenController
        .removeItem({ batchId: CTE_BATCH.id, itemId: CTE_BATCH_ITEM_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_BATCH_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const managerController = createCteBatchController({ client, permissions: [CTE_MANAGE] })
    expect(managerController.canManageBatches).toBe(true)
    expect(managerController.canSubmitBatches).toBe(false)

    expect(
      await managerController.removeItem({ batchId: CTE_BATCH.id, itemId: CTE_BATCH_ITEM_ID }),
    ).toEqual(CTE_BATCH_WITHOUT_ITEM)
    expect(client.mutationCount).toBe(1)

    const submitterController = createCteBatchController({ client, permissions: [CTE_SUBMIT] })
    expect(submitterController.canManageBatches).toBe(false)
    expect(submitterController.canSubmitBatches).toBe(true)
    expect(
      await submitterController
        .removeItem({ batchId: CTE_BATCH.id, itemId: CTE_BATCH_ITEM_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_BATCH_FORBIDDEN' }))
    expect(client.mutationCount).toBe(1)
  })

  test('maps empty, draft, processing, terminal and forbidden states without fiscal payload', async () => {
    const { createCteBatchViewModel } = await loadFutureModule<CteBatchViewModelModule>(
      '../../src/modules/cte-batch/shared/cteBatchViewModel.service',
    )

    expect(
      createCteBatchViewModel({
        batches: CTE_BATCH_PAGE,
        permissions: [],
        status: 'success',
      }),
    ).toEqual({
      canManageBatches: false,
      canSubmitBatches: false,
      status: 'forbidden',
    })

    expect(
      createCteBatchViewModel({
        batches: { items: [], nextCursor: null },
        events: { items: [], nextCursor: null },
        permissions: [CTE_MANAGE, CTE_SUBMIT],
        status: 'success',
      }),
    ).toEqual({
      canManageBatches: true,
      canSubmitBatches: true,
      status: 'empty',
    })

    const readyViewModel = createCteBatchViewModel({
      batches: CTE_BATCH_PAGE,
      events: CTE_BATCH_EVENTS_PAGE,
      permissions: [CTE_MANAGE, CTE_SUBMIT],
      selectedBatch: CTE_BATCH,
      status: 'success',
    })
    expect(readyViewModel.status).toBe('draft')
    expect(readyViewModel.selectedBatchId).toBe(CTE_BATCH.id)
    expect(readyViewModel.canSubmitSelectedBatch).toBe(true)
    expect(JSON.stringify(readyViewModel)).not.toContain('<cteProc')

    const processingViewModel = createCteBatchViewModel({
      batches: CTE_BATCH_PAGE,
      events: CTE_BATCH_EVENTS_PAGE,
      permissions: [CTE_SUBMIT],
      selectedBatch: { ...CTE_BATCH, status: 'in_flight' },
      status: 'success',
    })
    expect(processingViewModel.status).toBe('processing')
    expect(processingViewModel.canSubmitSelectedBatch).toBe(false)
  })
})

function createMutationRecordingClient(): CteBatchClient & { readonly mutationCount: number } {
  let mutationCount = 0

  return {
    cancelBatch: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    createBatch: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    get mutationCount(): number {
      return mutationCount
    },
    getBatch: () => Promise.resolve(CTE_BATCH),
    listBatches: () => Promise.resolve(CTE_BATCH_PAGE),
    listEvents: () => Promise.resolve(CTE_BATCH_EVENTS_PAGE),
    removeItem: () => {
      mutationCount += 1
      return Promise.resolve(CTE_BATCH_WITHOUT_ITEM)
    },
    submitBatch: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
  }
}

type CteBatchClient = {
  cancelBatch(batchId: string): Promise<unknown>
  createBatch(input: typeof CTE_BATCH_CREATE): Promise<unknown>
  getBatch(batchId: string): Promise<unknown>
  listBatches(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  listEvents(input: {
    readonly batchId: string
    readonly cursor: null | string
    readonly limit: number
  }): Promise<unknown>
  removeItem(input: { readonly batchId: string; readonly itemId: string }): Promise<unknown>
  submitBatch(batchId: string): Promise<unknown>
}

type CteBatchHookModule = {
  readonly createCteBatchController: (input: {
    readonly client: CteBatchClient
    readonly permissions: readonly string[]
  }) => {
    readonly canManageBatches: boolean
    readonly canSubmitBatches: boolean
    readonly createBatch: (input: typeof CTE_BATCH_CREATE) => Promise<void>
    readonly removeItem: (input: {
      readonly batchId: string
      readonly itemId: string
    }) => Promise<unknown>
    readonly submitBatch: (batchId: string) => Promise<void>
  }
}

type CteBatchViewModelModule = {
  readonly createCteBatchViewModel: (input: {
    readonly batches?: unknown
    readonly events?: unknown
    readonly permissions: readonly string[]
    readonly selectedBatch?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => {
    readonly canManageBatches: boolean
    readonly canSubmitBatches: boolean
    readonly canSubmitSelectedBatch?: boolean
    readonly selectedBatchId?: string
    readonly status:
      | 'draft'
      | 'empty'
      | 'error'
      | 'forbidden'
      | 'loading'
      | 'processing'
      | 'terminal'
  }
}
