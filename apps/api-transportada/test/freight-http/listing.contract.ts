/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  createFreightHttpFixture,
  freightCalculationsListRequest,
  freightRulesListRequest,
  responseApiError,
  SIMULATION_RESULT,
} from '../fixtures/freight-http.fixture'

describe('freight http listing contract', () => {
  test('lists freight rules with validated cursor and stable response serialization', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(
      freightRulesListRequest({
        query: '?cursor=2026-07-22T19:00:00.000Z::00000000-0000-4000-8000-000000000301&limit=25',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [
        {
          createdAt: '2026-07-22T19:00:00.000Z',
          currentVersion: '1',
          description: 'Percentual padrão da operação',
          id: '00000000-0000-4000-8000-000000000301',
          name: 'Regra padrão',
          priority: '10',
          status: 'draft',
          type: 'percentage_of_invoice_total',
          updatedAt: '2026-07-22T19:00:00.000Z',
        },
      ],
      page: { nextCursor: '2026-07-22T19:10:00.000Z::00000000-0000-4000-8000-000000000305' },
    })
    expect(fixture.listRulesCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: '2026-07-22T19:00:00.000Z::00000000-0000-4000-8000-000000000301',
        limit: 25,
      },
    ])
  })

  test('rejects invalid freight rules listing cursors and limits before application work', async () => {
    const fixture = await createFreightHttpFixture()

    for (const query of ['?limit=0', '?limit=101', '?cursor=not-a-cursor']) {
      const response = await fixture.handle(freightRulesListRequest({ query }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    }
    expect(fixture.listRulesCalls).toEqual([])
  })

  test('lists freight calculations for one NF-e only with no fiscal payload leakage', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(
      freightCalculationsListRequest(SIMULATION_RESULT.nfeDocumentId, {
        query: '?cursor=2026-07-22T19:00:00.000Z::00000000-0000-4000-8000-000000000303&limit=10',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      data: [
        {
          adjustments: [],
          baseAmount: '10000.0000',
          calculatedAmount: '350.0000',
          calculationDetails: {
            formula: 'invoiceTotalAmount * percentage',
            roundingMode: 'half_up',
            scale: 4,
          },
          correlationId: 'freight-http-correlation',
          createdAt: '2026-07-22T19:00:00.000Z',
          freightRuleId: '00000000-0000-4000-8000-000000000301',
          freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
          id: '00000000-0000-4000-8000-000000000303',
          maximumAmount: null,
          minimumAmount: null,
          nfeDocumentId: '00000000-0000-4000-8000-000000000304',
          percentage: '0.035000',
          ruleSnapshot: {
            freightRuleId: '00000000-0000-4000-8000-000000000301',
            freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
            maximumAmount: null,
            minimumAmount: null,
            percentage: '0.035000',
            ruleVersion: '1',
            type: 'percentage_of_invoice_total',
            validFrom: '2026-07-01T00:00:00.000Z',
            validUntil: null,
          },
          ruleVersion: '1',
          status: 'snapshotted',
          totalAmount: '350.0000',
          updatedAt: '2026-07-22T19:00:00.000Z',
        },
      ],
      page: { nextCursor: '2026-07-22T19:10:00.000Z::00000000-0000-4000-8000-000000000306' },
    })
    expect(fixture.listCalculationsCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: '2026-07-22T19:00:00.000Z::00000000-0000-4000-8000-000000000303',
        documentId: SIMULATION_RESULT.nfeDocumentId,
        limit: 10,
      },
    ])
    expect(JSON.stringify(body)).not.toContain('"xml"')
    expect(JSON.stringify(body)).not.toContain('"content"')
  })
})
