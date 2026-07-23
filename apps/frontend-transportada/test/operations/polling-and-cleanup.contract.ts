/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { OPERATIONS_JOBS, loadFutureModule } from './operations.fixture'

describe('operations polling and cleanup contract', () => {
  test('polls conservatively only while there are non-terminal jobs', async () => {
    const { createOperationsPollingState } = await loadFutureModule<OperationsPollingModule>(
      '../../src/modules/operations/shared/operationsClient.service',
    )

    expect(createOperationsPollingState({ jobs: OPERATIONS_JOBS })).toEqual({
      enabled: true,
      intervalMs: 10_000,
    })
    expect(
      createOperationsPollingState({
        jobs: {
          items: [{ ...OPERATIONS_JOBS.items[0], status: 'dead_letter' }],
          nextCursor: null,
        },
      }),
    ).toEqual({ enabled: false, intervalMs: null })
    expect(createOperationsPollingState({ jobs: null })).toEqual({
      enabled: false,
      intervalMs: null,
    })
  })

  test('clears filters and cached sensitive strings on reset and unmount cleanup', async () => {
    const { createOperationsFilterController } =
      await loadFutureModule<OperationsFilterControllerModule>(
        '../../src/modules/operations/hooks/useOperationsDashboard.hook',
      )

    const controller = createOperationsFilterController()
    controller.setFilters({
      correlationId: 'correlation-operations-001',
      metadata: '<cteProc>forbidden</cteProc>',
      module: 'cte_issuance',
    })
    expect(JSON.stringify(controller.filters)).not.toContain('<cteProc>')
    controller.reset()
    expect(controller.filters).toEqual({})
    controller.setFilters({ module: 'billing' })
    controller.cleanup()
    expect(controller.filters).toEqual({})
  })
})

type OperationsPollingModule = {
  readonly createOperationsPollingState: (input: {
    readonly jobs: null | {
      readonly items: readonly { readonly status: string }[]
      readonly nextCursor?: null | string
    }
  }) => {
    readonly enabled: boolean
    readonly intervalMs: null | number
  }
}

type OperationsFilterControllerModule = {
  readonly createOperationsFilterController: () => {
    readonly cleanup: () => void
    readonly filters: Readonly<Record<string, unknown>>
    readonly reset: () => void
    readonly setFilters: (input: Record<string, unknown>) => void
  }
}
