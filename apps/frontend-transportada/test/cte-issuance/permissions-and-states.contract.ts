/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_AUTHORIZED_ISSUANCE,
  CTE_BATCH_ID,
  CTE_BATCH_ITEM_ID,
  CTE_CANCEL,
  CTE_CANCELLED_ISSUANCE,
  CTE_CANCEL_JUSTIFICATION,
  CTE_DOCUMENT_PAGE,
  CTE_REJECTED_ISSUANCE,
  CTE_RETRY_ISSUANCE,
  CTE_SUBMIT,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './cte-issuance.fixture'

describe('CT-e issuance permissions and states contract', () => {
  test('only exposes issue and reprocess actions to cte.submit', async () => {
    const { createCteIssuanceController } = await loadFutureModule<CteIssuanceHookModule>(
      '../../src/modules/cte-issuance/hooks/useCteIssuanceStatus.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createCteIssuanceController({ client, permissions: [] })
    expect(forbiddenController.canSubmitCte).toBe(false)
    expect(
      await forbiddenController
        .issueBatch({ batchId: CTE_BATCH_ID, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_ISSUANCE_FORBIDDEN' }))
    expect(
      await forbiddenController
        .reprocessItem({
          batchId: CTE_BATCH_ID,
          batchItemId: CTE_BATCH_ITEM_ID,
          idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
          reason: 'Correção de homologação',
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_ISSUANCE_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const submitterController = createCteIssuanceController({ client, permissions: [CTE_SUBMIT] })
    expect(submitterController.canSubmitCte).toBe(true)
  })

  test('keeps the 110111 cancellation behind cte.cancel even for who can transmit', async () => {
    const { createCteIssuanceController } = await loadFutureModule<CteIssuanceHookModule>(
      '../../src/modules/cte-issuance/hooks/useCteIssuanceStatus.hook',
    )
    const client = createMutationRecordingClient()
    const cancelRequest = {
      batchId: CTE_BATCH_ID,
      batchItemId: CTE_BATCH_ITEM_ID,
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      justification: CTE_CANCEL_JUSTIFICATION,
    }

    const submitterController = createCteIssuanceController({ client, permissions: [CTE_SUBMIT] })
    expect(submitterController.canCancelCte).toBe(false)
    expect(
      await submitterController.cancelItem(cancelRequest).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_ISSUANCE_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const cancellerController = createCteIssuanceController({
      client,
      permissions: [CTE_SUBMIT, CTE_CANCEL],
    })
    expect(cancellerController.canCancelCte).toBe(true)
    expect(await cancellerController.cancelItem(cancelRequest)).toBeUndefined()
    expect(client.mutationCount).toBe(1)
  })

  test('surfaces the cancelled document as a terminal state without polling or reprocess', async () => {
    const { createCteIssuanceViewModel } = await loadFutureModule<CteIssuanceViewModelModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceViewModel.service',
    )

    const cancelled = createCteIssuanceViewModel({
      documents: CTE_DOCUMENT_PAGE,
      issuance: CTE_CANCELLED_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.canReprocess).toBe(false)
    expect(cancelled.shouldPollStatus).toBe(false)
    expect(cancelled.canDownloadXml).toBe(false)
  })

  test('maps authorized, rejected, retry and forbidden states without XML persistence', async () => {
    const { createCteIssuanceViewModel } = await loadFutureModule<CteIssuanceViewModelModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceViewModel.service',
    )

    expect(
      createCteIssuanceViewModel({
        documents: CTE_DOCUMENT_PAGE,
        issuance: CTE_REJECTED_ISSUANCE,
        permissions: [],
        status: 'success',
      }),
    ).toEqual({ canSubmitCte: false, status: 'forbidden' })

    const authorized = createCteIssuanceViewModel({
      documents: CTE_DOCUMENT_PAGE,
      issuance: CTE_AUTHORIZED_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })
    expect(authorized.status).toBe('authorized')
    expect(authorized.canDownloadXml).toBe(true)
    expect(authorized.canReprocess).toBe(false)
    expect(JSON.stringify(authorized)).not.toContain('<cteProc')

    const rejected = createCteIssuanceViewModel({
      documents: { items: [], nextCursor: null },
      issuance: CTE_REJECTED_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })
    expect(rejected.status).toBe('rejected')
    expect(rejected.canReprocess).toBe(true)
    expect(rejected.rejectionCode).toBe('204')

    const retry = createCteIssuanceViewModel({
      documents: { items: [], nextCursor: null },
      issuance: CTE_RETRY_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })
    expect(retry.status).toBe('retry_scheduled')
    expect(retry.canReprocess).toBe(false)
    expect(retry.shouldPollStatus).toBe(true)
  })
})

function createMutationRecordingClient(): CteIssuanceClient & { readonly mutationCount: number } {
  let mutationCount = 0
  return {
    cancelItem: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    getIssuance: () => Promise.resolve(CTE_REJECTED_ISSUANCE),
    get mutationCount(): number {
      return mutationCount
    },
    issueBatch: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    listDocuments: () => Promise.resolve(CTE_DOCUMENT_PAGE),
    reprocessItem: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
  }
}

type CteIssuanceClient = {
  cancelItem(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly idempotencyKey: string
    readonly justification: string
  }): Promise<unknown>
  getIssuance(input: { readonly batchId: string; readonly batchItemId: string }): Promise<unknown>
  issueBatch(input: { readonly batchId: string; readonly idempotencyKey: string }): Promise<unknown>
  listDocuments(input: { readonly batchId: string; readonly batchItemId: string }): Promise<unknown>
  reprocessItem(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly idempotencyKey: string
    readonly reason: string
  }): Promise<unknown>
}

type CteIssuanceHookModule = {
  readonly createCteIssuanceController: (input: {
    readonly client: CteIssuanceClient
    readonly permissions: readonly string[]
  }) => {
    readonly canCancelCte: boolean
    readonly cancelItem: (input: {
      readonly batchId: string
      readonly batchItemId: string
      readonly idempotencyKey: string
      readonly justification: string
    }) => Promise<void>
    readonly canSubmitCte: boolean
    readonly issueBatch: (input: {
      readonly batchId: string
      readonly idempotencyKey: string
    }) => Promise<void>
    readonly reprocessItem: (input: {
      readonly batchId: string
      readonly batchItemId: string
      readonly idempotencyKey: string
      readonly reason: string
    }) => Promise<void>
  }
}

type CteIssuanceViewModel = {
  readonly canDownloadXml?: boolean
  readonly canReprocess?: boolean
  readonly canSubmitCte: boolean
  readonly rejectionCode?: string
  readonly shouldPollStatus?: boolean
  readonly status:
    | 'authorized'
    | 'cancelled'
    | 'error'
    | 'failed'
    | 'forbidden'
    | 'loading'
    | 'rejected'
    | 'requested'
    | 'retry_scheduled'
}

type CteIssuanceViewModelModule = {
  readonly createCteIssuanceViewModel: (input: {
    readonly documents?: unknown
    readonly issuance?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
  }) => CteIssuanceViewModel
}
