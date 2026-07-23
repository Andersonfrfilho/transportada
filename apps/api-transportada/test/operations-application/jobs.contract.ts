import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  OperationsRepositoryFixture,
  createOperationsUseCaseForTest,
  stringify,
} from './support.js'

describe('operations application jobs contract', () => {
  test('lists retry and dead-letter jobs without triggering external effects', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const result = await useCase.listJobs({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      cursor: null,
      filters: {
        correlationId: CORRELATION_ID,
        module: 'cte_issuance',
        status: 'retry_scheduled',
      },
      limit: 500,
    })

    expect(repository.jobQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: null,
        filters: {
          correlationId: CORRELATION_ID,
          module: 'cte_issuance',
          status: 'retry_scheduled',
        },
        limit: 100,
      },
    ])
    expect(repository.reprocessRequests).toEqual([])
    expect(stringify(result)).toContain('retry_scheduled')
    expect(stringify(result)).toContain('dead_letter')
    expect(stringify(result)).not.toContain('certificatePassword')
    expect(stringify(result)).not.toContain('secret-password')
  })
})
