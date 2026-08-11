import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  ELIGIBLE_CTE,
  BillingUnitOfWorkFixture,
  createBillingUseCaseForTest,
} from './support.js'

describe('billing application eligibility contract', () => {
  test('lists only authorized unbilled CT-e from the authenticated tenant', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.listEligible({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      cursor: null,
      filters: {
        batchId: 'cte-batch-001',
        cteNumber: '1001',
        customerDocument: ELIGIBLE_CTE.customerDocument,
        from: '2026-07-01T00:00:00.000Z',
        maxAmount: '500.00',
        minAmount: '300.00',
        to: '2026-07-31T23:59:59.999Z',
      },
      limit: 50,
    })

    expect(result).toEqual({ items: [ELIGIBLE_CTE], nextCursor: null })
    expect(unitOfWork.eligibilityQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: null,
        excludeActiveInvoice: true,
        filters: {
          batchId: 'cte-batch-001',
          cteNumber: '1001',
          customerDocument: ELIGIBLE_CTE.customerDocument,
          from: '2026-07-01T00:00:00.000Z',
          maxAmount: '500.00',
          minAmount: '300.00',
          to: '2026-07-31T23:59:59.999Z',
        },
        limit: 50,
        status: 'authorized',
      },
    ])
  })

  test('returns an empty tenant-scoped result without falling back to a global query', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.eligibleCtes = []
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.listEligible({
      context: COMPANY_CONTEXT,
      cursor: null,
      filters: {},
      limit: 20,
    })

    expect(result).toEqual({ items: [], nextCursor: null })
    expect(unitOfWork.eligibilityQueries).toHaveLength(1)
    expect(unitOfWork.eligibilityQueries[0]?.['companyId']).toBe(COMPANY_CONTEXT.companyId)
  })

  /**
   * O cursor precisa atravessar use case e repositório: enquanto a rota devolvia o cursor recebido,
   * a varredura de um lote parava na primeira página e faturava só parte dos CT-es.
   */
  test('carrega o cursor recebido até o repositório e devolve o cursor da própria página', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.eligibleNextCursor = '2026-08-11T13:45:00.000Z::cte-901'
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.listEligible({
      context: COMPANY_CONTEXT,
      cursor: '2026-08-11T10:00:00.000Z::cte-800',
      filters: {},
      limit: 100,
    })

    expect(result).toEqual({
      items: [ELIGIBLE_CTE],
      nextCursor: '2026-08-11T13:45:00.000Z::cte-901',
    })
    expect(unitOfWork.eligibilityQueries[0]?.['cursor']).toBe('2026-08-11T10:00:00.000Z::cte-800')
  })
})
