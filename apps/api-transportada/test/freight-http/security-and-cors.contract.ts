/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { READ_ONLY_CONTEXT } from '../fixtures/freight-http.fixture'
import {
  createFreightHttpFixture,
  freightRulesListRequest,
  responseApiError,
  simulateFreightRequest,
  unauthenticatedError,
} from '../fixtures/freight-http.fixture'

describe('freight http security and cors contract', () => {
  test('rejects unauthenticated freight simulation and keeps no-store headers', async () => {
    const fixture = await createFreightHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(simulateFreightRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.simulationCalls).toEqual([])
  })

  test('requires settings.manage before freight rules listing work', async () => {
    const fixture = await createFreightHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(freightRulesListRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.listRulesCalls).toEqual([])
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
  })

  test('requires freight.simulate before simulation body parsing and keeps cors headers', async () => {
    const events: string[] = []
    const fixture = await createFreightHttpFixture({
      permissions: new Set(['settings.manage']),
    })

    const response = await fixture.handle(
      simulateFreightRequest({ events, origin: 'http://localhost:53000' }),
    )

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:53000')
    expect(fixture.simulationCalls).toEqual([])
  })
})
