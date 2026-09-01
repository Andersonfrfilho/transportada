/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  changeRuleStatusRequest,
  COMPANY_CONTEXT,
  createFreightHttpFixture,
  READ_ONLY_CONTEXT,
  responseApiError,
  RULE_ID,
  RULE_SUMMARY,
  UPDATE_RULE_BODY,
  updateRuleRequest,
} from '../fixtures/freight-http.fixture'

const EXPECTED_UPDATE_CALL = {
  context: COMPANY_CONTEXT,
  correlationId: 'freight-http-correlation',
  expectedCurrentVersion: '1',
  filters: {
    destinationCityCodes: [],
    destinationStates: ['MG'],
    senderTaxIds: ['61084018000109'],
  },
  freightRuleId: RULE_ID,
  maximumAmount: '900.0000',
  minimumAmount: '120.0000',
  percentage: '0.060000',
  validFrom: '2026-08-01T00:00:00.000Z',
  validUntil: null,
} as const

function updateBodyWithout(
  omittedKey: 'expectedCurrentVersion' | 'filters',
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...UPDATE_RULE_BODY }
  delete body[omittedKey]
  return body
}

describe('freight http rules mutation contract', () => {
  test('versions a rule with the destination state exception carried in the filters', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(updateRuleRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        createdAt: RULE_SUMMARY.createdAt,
        currentVersion: RULE_SUMMARY.currentVersion,
        description: RULE_SUMMARY.description,
        id: RULE_SUMMARY.id,
        name: RULE_SUMMARY.name,
        priority: RULE_SUMMARY.priority,
        status: RULE_SUMMARY.status,
        type: RULE_SUMMARY.type,
        updatedAt: RULE_SUMMARY.updatedAt,
      },
    })
    expect(fixture.updateRuleCalls).toEqual([EXPECTED_UPDATE_CALL])
  })

  test('defaults the filters to the empty selector when the payload omits them', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(updateRuleRequest({ body: updateBodyWithout('filters') }))

    expect(response.status).toBe(200)
    expect(fixture.updateRuleCalls).toEqual([
      {
        ...EXPECTED_UPDATE_CALL,
        filters: { destinationCityCodes: [], destinationStates: [], senderTaxIds: [] },
      },
    ])
  })

  test('refuses an update without the expected version and a malformed destination state', async () => {
    const missingVersionFixture = await createFreightHttpFixture()
    const missingVersionResponse = await missingVersionFixture.handle(
      updateRuleRequest({ body: updateBodyWithout('expectedCurrentVersion') }),
    )

    expect(missingVersionResponse.status).toBe(400)
    expect((await responseApiError(missingVersionResponse)).error.code).toBe('INVALID_REQUEST')
    expect(missingVersionFixture.updateRuleCalls).toEqual([])

    const malformedStateFixture = await createFreightHttpFixture()
    const malformedStateResponse = await malformedStateFixture.handle(
      updateRuleRequest({
        body: { ...UPDATE_RULE_BODY, filters: { destinationStates: ['Minas Gerais'] } },
      }),
    )

    expect(malformedStateResponse.status).toBe(400)
    expect(malformedStateFixture.updateRuleCalls).toEqual([])
  })

  test('propagates the rule version conflict as 409 without leaking the tenant', async () => {
    const fixture = await createFreightHttpFixture({
      updateRuleError: new ApiError({
        code: 'FREIGHT_RULE_VERSION_CONFLICT',
        message: 'Freight rule version conflict',
        status: 409,
      }),
    })

    const response = await fixture.handle(updateRuleRequest())
    const body = await responseApiError(response)

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('FREIGHT_RULE_VERSION_CONFLICT')
    expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('routes the status transition to activate or deactivate', async () => {
    const fixture = await createFreightHttpFixture()

    const activateResponse = await fixture.handle(changeRuleStatusRequest({ status: 'active' }))
    const deactivateResponse = await fixture.handle(changeRuleStatusRequest({ status: 'inactive' }))

    expect(activateResponse.status).toBe(200)
    expect(deactivateResponse.status).toBe(200)
    expect(fixture.activateRuleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'freight-http-correlation',
        freightRuleId: RULE_ID,
      },
    ])
    expect(fixture.deactivateRuleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'freight-http-correlation',
        freightRuleId: RULE_ID,
      },
    ])
  })

  test('rejects a status the transition endpoint does not accept', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(changeRuleStatusRequest({ status: 'draft' }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.activateRuleCalls).toEqual([])
    expect(fixture.deactivateRuleCalls).toEqual([])
  })

  test('denies both mutations without the settings management permission', async () => {
    const fixture = await createFreightHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const updateResponse = await fixture.handle(updateRuleRequest())
    const statusResponse = await fixture.handle(changeRuleStatusRequest({ status: 'active' }))

    expect(updateResponse.status).toBe(403)
    expect((await responseApiError(updateResponse)).error.code).toBe('FORBIDDEN')
    expect(statusResponse.status).toBe(403)
    expect(fixture.updateRuleCalls).toEqual([])
    expect(fixture.activateRuleCalls).toEqual([])
  })

  /**
   * Spec 065 D6: sem dimensão de município não há como precificar a entrega urbana — que é a que tem
   * outro documento, outro imposto e outra margem.
   */
  test('carries the destination municipality exception in the filters', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(
      updateRuleRequest({
        body: { ...UPDATE_RULE_BODY, filters: { destinationCityCodes: ['3543402'] } },
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateRuleCalls[0]).toMatchObject({
      filters: { destinationCityCodes: ['3543402'], destinationStates: [], senderTaxIds: [] },
    })
  })

  /** Nome de cidade tem três grafias; o IBGE tem uma, e só ele entra. */
  test('refuses a municipality that is not a seven-digit IBGE code', async () => {
    const fixture = await createFreightHttpFixture()

    const response = await fixture.handle(
      updateRuleRequest({
        body: { ...UPDATE_RULE_BODY, filters: { destinationCityCodes: ['RIBEIRAO PRETO'] } },
      }),
    )

    expect(response.status).toBe(400)
  })
})
