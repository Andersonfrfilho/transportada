/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AUDIT_EVENTS,
  AUDIT_READ,
  OPERATIONS_JOBS,
  OPERATIONS_READ,
  OPERATIONS_SUMMARY,
  OPERATIONS_TIMELINE,
  loadFutureModule,
} from './operations.fixture'

describe('operations permissions and states contract', () => {
  test('exposes operations and audit capabilities separately', async () => {
    const { createOperationsController } = await loadFutureModule<OperationsHookModule>(
      '../../src/modules/operations/hooks/useOperationsDashboard.hook',
    )
    const client = createRecordingClient()

    const forbidden = createOperationsController({ client, permissions: [] })
    expect(forbidden.canReadOperations).toBe(false)
    expect(forbidden.canReadAudit).toBe(false)
    expect(await forbidden.refresh().catch((caught: unknown) => caught)).toEqual(
      expect.objectContaining({ message: 'OPERATIONS_FORBIDDEN' }),
    )
    expect(client.queryCount).toBe(0)

    const operationsOnly = createOperationsController({ client, permissions: [OPERATIONS_READ] })
    expect(operationsOnly.canReadOperations).toBe(true)
    expect(operationsOnly.canReadAudit).toBe(false)

    const auditor = createOperationsController({
      client,
      permissions: [OPERATIONS_READ, AUDIT_READ],
    })
    expect(auditor.canReadOperations).toBe(true)
    expect(auditor.canReadAudit).toBe(true)
  })

  test('maps dashboard states without persisting sensitive payloads', async () => {
    const { createOperationsViewModel } = await loadFutureModule<OperationsViewModelModule>(
      '../../src/modules/operations/shared/operationsViewModel.service',
    )

    expect(
      createOperationsViewModel({
        permissions: [],
        status: 'success',
      }),
    ).toEqual({ canReadAudit: false, canReadOperations: false, status: 'forbidden' })

    const ready = createOperationsViewModel({
      audit: AUDIT_EVENTS,
      jobs: OPERATIONS_JOBS,
      permissions: [OPERATIONS_READ, AUDIT_READ],
      status: 'success',
      summary: OPERATIONS_SUMMARY,
      timeline: OPERATIONS_TIMELINE,
    })
    expect(ready.status).toBe('ready')
    expect(ready.failedModules).toEqual(['nfe'])
    expect(ready.retryJobCount).toBe(1)
    expect(JSON.stringify(ready)).not.toContain('<cteProc')
    expect(JSON.stringify(ready)).not.toContain('token')
    expect(JSON.stringify(ready)).not.toContain('certificate')
  })
})

function createRecordingClient(): OperationsClient & { readonly queryCount: number } {
  let queryCount = 0
  const record = <TValue>(value: TValue): Promise<TValue> => {
    queryCount += 1
    return Promise.resolve(value)
  }
  return {
    get queryCount(): number {
      return queryCount
    },
    getSummary: () => record(OPERATIONS_SUMMARY),
    listAuditEvents: () => record(AUDIT_EVENTS),
    listJobs: () => record(OPERATIONS_JOBS),
    listTimeline: () => record(OPERATIONS_TIMELINE),
  }
}

type OperationsClient = {
  readonly getSummary: (input: Record<string, unknown>) => Promise<unknown>
  readonly listAuditEvents: (input: Record<string, unknown>) => Promise<unknown>
  readonly listJobs: (input: Record<string, unknown>) => Promise<unknown>
  readonly listTimeline: (input: Record<string, unknown>) => Promise<unknown>
}

type OperationsHookModule = {
  readonly createOperationsController: (input: {
    readonly client: OperationsClient
    readonly permissions: readonly string[]
  }) => {
    readonly canReadAudit: boolean
    readonly canReadOperations: boolean
    readonly refresh: () => Promise<void>
  }
}

type OperationsViewModelModule = {
  readonly createOperationsViewModel: (input: {
    readonly audit?: unknown
    readonly jobs?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
    readonly summary?: unknown
    readonly timeline?: unknown
  }) => {
    readonly canReadAudit: boolean
    readonly canReadOperations: boolean
    readonly failedModules?: readonly string[]
    readonly retryJobCount?: number
    readonly status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
  }
}
