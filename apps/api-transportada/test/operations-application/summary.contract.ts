import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  NO_OPERATIONS_CONTEXT,
  OperationsRepositoryFixture,
  captureApiError,
  createOperationsUseCaseForTest,
  stringify,
} from './support.js'

describe('operations application summary contract', () => {
  test('aggregates operational status using only the authenticated tenant scope', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const result = await useCase.getSummary({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      filters: {
        correlationId: CORRELATION_ID,
        from: '2026-07-23T00:00:00.000Z',
        module: 'cte_issuance',
        status: 'retry_scheduled',
        to: '2026-07-23T23:59:59.999Z',
      },
    })

    expect(result).toEqual(repository.summary)
    expect(repository.summaryQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        filters: {
          correlationId: CORRELATION_ID,
          from: '2026-07-23T00:00:00.000Z',
          module: 'cte_issuance',
          status: 'retry_scheduled',
          to: '2026-07-23T23:59:59.999Z',
        },
      },
    ])
    expect(stringify(result)).not.toContain('secret')
    expect(stringify(result)).not.toContain('<cteProc>')
  })

  test('denies summary before repository access when operations.read is missing', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const error = await captureApiError(() =>
      useCase.getSummary({
        context: NO_OPERATIONS_CONTEXT,
        filters: {
          module: '<xml>expensive-filter</xml>',
        },
      }),
    )

    expect(error).toMatchObject({
      code: 'OPERATIONS_READ_FORBIDDEN',
      message: 'Operations access denied',
      status: 403,
    })
    expect(repository.summaryQueries).toHaveLength(0)
    expect(stringify(error)).not.toContain('expensive-filter')
  })
})
