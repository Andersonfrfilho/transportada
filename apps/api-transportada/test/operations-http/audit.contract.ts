/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  AUDIT_PAGE,
  COMPANY_CONTEXT,
  createOperationsHttpFixture,
  listAuditEventsRequest,
  responseApiError,
} from '../fixtures/operations-http.fixture.js'

describe('Operations HTTP audit contract', () => {
  test('returns audit events with audit.read, filters and safe pagination', async () => {
    const fixture = await createOperationsHttpFixture()

    const response = await fixture.handle(listAuditEventsRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ data: AUDIT_PAGE.items, page: { nextCursor: AUDIT_PAGE.nextCursor } })
    expect(JSON.stringify(body)).not.toContain('secret-token')
    expect(fixture.auditCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: {
          action: 'billing.invoice.cancel',
          actorUserId: COMPANY_CONTEXT.userId,
          correlationId: 'correlation-operations-001',
          result: 'allowed',
          targetId: '00000000-0000-4000-8000-000000000010',
          targetType: 'billing_invoice',
        },
        limit: 50,
      },
    ])
  })

  test('propagates safe timeline and audit errors without tenant leakage', async () => {
    const fixture = await createOperationsHttpFixture({
      auditError: new ApiError({
        code: 'AUDIT_EVENTS_NOT_FOUND',
        message: 'Audit events not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(listAuditEventsRequest())
    const body = await responseApiError(response)

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('AUDIT_EVENTS_NOT_FOUND')
    expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
  })
})
