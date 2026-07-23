import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  NEXT_CURSOR,
  OPERATIONS_ONLY_CONTEXT,
  TARGET_ID,
  OperationsRepositoryFixture,
  captureApiError,
  createOperationsUseCaseForTest,
  stringify,
} from './support.js'

describe('operations application audit contract', () => {
  test('lists audit events only with audit.read and tenant-scoped filters', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const result = await useCase.listAuditEvents({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      cursor: null,
      filters: {
        action: 'billing.invoice.cancel',
        actorUserId: COMPANY_CONTEXT.userId,
        correlationId: CORRELATION_ID,
        result: 'allowed',
        targetId: TARGET_ID,
        targetType: 'billing_invoice',
      },
      limit: 50,
    })

    expect(repository.auditQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: null,
        filters: {
          action: 'billing.invoice.cancel',
          actorUserId: COMPANY_CONTEXT.userId,
          correlationId: CORRELATION_ID,
          result: 'allowed',
          targetId: TARGET_ID,
          targetType: 'billing_invoice',
        },
        limit: 50,
      },
    ])
    expect(result).toMatchObject({ nextCursor: NEXT_CURSOR })
    expect(stringify(result)).not.toContain('secret-token')
    expect(stringify(result)).not.toContain('"token"')
  })

  test('denies audit before parsing expensive filters when audit.read is missing', async () => {
    const repository = new OperationsRepositoryFixture()
    const useCase = await createOperationsUseCaseForTest(repository)

    const error = await captureApiError(() =>
      useCase.listAuditEvents({
        context: OPERATIONS_ONLY_CONTEXT,
        filters: {
          metadata: {
            xml: '<xml>do-not-parse</xml>',
          },
        },
      }),
    )

    expect(error).toMatchObject({
      code: 'AUDIT_READ_FORBIDDEN',
      message: 'Audit access denied',
      status: 403,
    })
    expect(repository.auditQueries).toHaveLength(0)
    expect(stringify(error)).not.toContain('do-not-parse')
  })
})
