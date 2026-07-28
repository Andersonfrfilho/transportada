import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  NEXT_CURSOR,
  OTHER_COMPANY_ID,
  TARGET_ID,
  OperationsRepositoryFixture,
  captureApiError,
  createOperationsUseCaseForTest,
  stringify,
} from './support.js'

describe('operations application timeline contract', () => {
  test('lists an ordered tenant-scoped timeline with safe metadata only', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const result = await useCase.listTimeline({
      companyId: OTHER_COMPANY_ID,
      context: COMPANY_CONTEXT,
      cursor: '2026-07-23T14:00:00.000Z::00000000-0000-4000-8000-000000000001',
      filters: {
        correlationId: CORRELATION_ID,
        entityId: TARGET_ID,
        entityType: 'nfe_import',
        module: 'nfe',
      },
      limit: 25,
    })

    expect(repository.timelineQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: '2026-07-23T14:00:00.000Z::00000000-0000-4000-8000-000000000001',
        filters: {
          correlationId: CORRELATION_ID,
          entityId: TARGET_ID,
          entityType: 'nfe_import',
          module: 'nfe',
        },
        limit: 25,
      },
    ])
    expect(result).toMatchObject({
      nextCursor: NEXT_CURSOR,
    })
    expect(stringify(result)).not.toContain('<cteProc>')
    expect(stringify(result)).not.toContain('storageKey')
    expect(stringify(result)).not.toContain('secret')
  })

  test('returns the same safe absence for missing and cross-tenant timeline targets', async () => {
    const repository = new OperationsRepositoryFixture()
    repository.timelinePage = null
    const useCase = await createOperationsUseCaseForTest(repository)

    const error = await captureApiError(() =>
      useCase.listTimeline({
        companyId: OTHER_COMPANY_ID,
        context: COMPANY_CONTEXT,
        filters: {
          entityId: TARGET_ID,
          entityType: 'billing_invoice',
        },
        limit: 20,
      }),
    )

    expect(error).toMatchObject({
      code: 'OPERATIONS_TIMELINE_NOT_FOUND',
      message: 'Operations timeline not found',
      status: 404,
    })
    expect(repository.timelineQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: null,
        filters: {
          entityId: TARGET_ID,
          entityType: 'billing_invoice',
        },
        limit: 20,
      },
    ])
    expect(stringify(error)).not.toContain(OTHER_COMPANY_ID)
    expect(stringify(error)).not.toContain(TARGET_ID)
  })
})
