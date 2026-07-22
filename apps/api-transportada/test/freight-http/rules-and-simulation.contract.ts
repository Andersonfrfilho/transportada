/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPANY_CONTEXT,
  CREATE_RULE_BODY,
  createFreightHttpFixture,
  responseApiError,
  RULE_ID,
  RULE_SUMMARY,
  RULES_PATH,
  RULE_VERSION_VALID_FROM,
  simulateFreightRequest,
  SIMULATION_IDEMPOTENCY_KEY,
  SIMULATION_RESULT,
  FREIGHT_SIMULATIONS_PATH,
  createRuleRequest,
} from '../fixtures/freight-http.fixture'

describe('freight http rules and simulation contract', () => {
  test('creates one strict freight rule dto with authenticated tenant and generated metadata only', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(
      createRuleRequest({
        body: {
          ...CREATE_RULE_BODY,
          companyId: 'forbidden-company',
        },
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.createRuleCalls).toEqual([])
  })

  test('posts a persistent simulation with idempotency key and tenant-scoped document only', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(simulateFreightRequest())

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      data: {
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
    })
    expect(fixture.simulationCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'freight-http-correlation',
        documentId: SIMULATION_RESULT.nfeDocumentId,
        idempotencyKey: SIMULATION_IDEMPOTENCY_KEY,
      },
    ])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects unknown top-level simulation fields and safe cross-tenant not-found errors', async () => {
    const invalidFixture = await createFreightHttpFixture()
    const invalidResponse = await invalidFixture.handle(
      simulateFreightRequest({
        body: {
          documentId: SIMULATION_RESULT.nfeDocumentId,
          invoiceTotalAmount: '10000.0000',
        },
      }),
    )

    expect(invalidResponse.status).toBe(400)
    expect((await responseApiError(invalidResponse)).error.code).toBe('INVALID_REQUEST')
    expect(invalidFixture.simulationCalls).toEqual([])

    const missingFixture = await createFreightHttpFixture({
      simulationError: new ApiError({
        code: 'FREIGHT_CALCULATION_NOT_FOUND',
        message: 'Freight calculation not found',
        status: 404,
      }),
    })
    const missingResponse = await missingFixture.handle(simulateFreightRequest())
    expect(missingResponse.status).toBe(404)
    expect((await responseApiError(missingResponse)).error.code).toBe(
      'FREIGHT_CALCULATION_NOT_FOUND',
    )
  })

  test('documents the freight rules and simulation routes explicitly', () => {
    expect(RULES_PATH).toBe('/freight-rules')
    expect(`${RULES_PATH}/${RULE_ID}`).toBe('/freight-rules/00000000-0000-4000-8000-000000000301')
    expect(FREIGHT_SIMULATIONS_PATH).toBe('/freight-calculations')
    expect(RULE_SUMMARY.currentVersion).toBe('1')
    expect(RULE_VERSION_VALID_FROM).toBe('2026-07-01T00:00:00.000Z')
  })
})
