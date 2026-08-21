/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  captureRouterError,
  createRouterFixture,
  ROUTER_COMPANY_ID,
  ROUTER_NOW,
  ROUTER_PROTECTED_PATH,
  ROUTER_USER_ID,
  routerRequest,
} from './fixtures/router.fixture'
import { createHeterogeneousRouterFixture } from './fixtures/router-heterogeneous.fixture'

describe('modular router contract', () => {
  test('runs authentication, tenant resolution and RBAC before parser and handler', async () => {
    const fixture = createRouterFixture()

    const response = await fixture.router.handle({
      correlationId: 'router-contract',
      method: 'POST',
      pathname: ROUTER_PROTECTED_PATH,
      request: routerRequest(ROUTER_PROTECTED_PATH),
    })

    expect(response.status).toBe(204)
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize', 'parse', 'handle'])
  })

  for (const scenario of [
    {
      code: 'UNAUTHENTICATED',
      events: ['authenticate'],
      failAt: 'authentication',
      status: 401,
    },
    {
      code: 'FORBIDDEN',
      events: ['authenticate', 'tenant'],
      failAt: 'tenant',
      status: 403,
    },
    {
      code: 'FORBIDDEN',
      events: ['authenticate', 'tenant', 'authorize'],
      failAt: 'authorization',
      status: 403,
    },
  ] as const) {
    test(`stops protected work when ${scenario.failAt} fails`, async () => {
      const fixture = createRouterFixture({ failAt: scenario.failAt })

      const error = await captureRouterError(() =>
        fixture.router.handle({
          correlationId: 'router-contract',
          method: 'POST',
          pathname: ROUTER_PROTECTED_PATH,
          request: routerRequest(ROUTER_PROTECTED_PATH),
        }),
      )

      expect(error).toMatchObject({ code: scenario.code, status: scenario.status })
      expect(fixture.events).toEqual([...scenario.events])
    })
  }

  test('denies a registered protected route with no policy by default', async () => {
    const fixture = createRouterFixture({ omitPolicy: true })

    const error = await captureRouterError(() =>
      fixture.router.handle({
        correlationId: 'router-contract',
        method: 'POST',
        pathname: ROUTER_PROTECTED_PATH,
        request: routerRequest(ROUTER_PROTECTED_PATH),
      }),
    )

    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
  })

  test('keeps each registered route input type independent', async () => {
    const fixture = createHeterogeneousRouterFixture()

    const stringResponse = await fixture.router.handle({
      correlationId: 'router-contract',
      method: 'POST',
      pathname: '/router-contract/string',
      request: routerRequest('/router-contract/string'),
    })
    const objectResponse = await fixture.router.handle({
      correlationId: 'router-contract',
      method: 'PUT',
      pathname: '/router-contract/object',
      request: routerRequest('/router-contract/object', 'PUT'),
    })

    expect(stringResponse.status).toBe(204)
    expect(objectResponse.status).toBe(204)
    expect(fixture.received).toEqual(['first-input', 2])
  })

  test('preserves public health, authenticated auth-me and authenticated safe 404', async () => {
    const fixture = createRouterFixture()

    const health = await fixture.router.handle({
      correlationId: 'router-contract',
      method: 'GET',
      pathname: '/health/live',
      request: routerRequest('/health/live', 'GET'),
    })
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({
      service: 'api',
      status: 'ok',
      timestamp: ROUTER_NOW.toISOString(),
    })
    expect(fixture.events).toEqual([])

    const authMe = await fixture.router.handle({
      correlationId: 'router-contract',
      method: 'GET',
      pathname: '/auth/me',
      request: routerRequest('/auth/me', 'GET'),
    })
    expect(authMe.status).toBe(200)
    expect(await authMe.json()).toEqual({
      data: {
        company: { fiscalEnvironment: 'homologation', id: ROUTER_COMPANY_ID },
        identity: { userId: ROUTER_USER_ID },
        permissions: ['settings.manage'],
        roles: ['company-admin'],
      },
    })
    expect(fixture.events).toEqual(['authenticate', 'tenant'])

    const notFoundError = await captureRouterError(() =>
      fixture.router.handle({
        correlationId: 'router-contract',
        method: 'GET',
        pathname: '/unknown',
        request: routerRequest('/unknown', 'GET'),
      }),
    )
    expect(notFoundError).toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authenticate'])
  })

  /**
   * Quem sabe quais rotas existem é o roteador — uma allowlist paralela de caminho literal envelhece
   * calada e devolve `<unmatched>` para rota viva. Saúde e `/auth/me` não estão em `routes`: são
   * atendidos dentro do `handle`, e mesmo assim precisam se nomear no log.
   */
  test('names every route it serves for the access log, and only those', () => {
    const fixture = createRouterFixture()

    expect(fixture.router.logPathname(ROUTER_PROTECTED_PATH)).toBe(ROUTER_PROTECTED_PATH)
    expect(fixture.router.logPathname('/health/live')).toBe('/health/live')
    expect(fixture.router.logPathname('/health/ready')).toBe('/health/ready')
    expect(fixture.router.logPathname('/auth/me')).toBe('/auth/me')
    expect(fixture.router.logPathname('/unknown')).toBe('<unmatched>')
    // Resolver o caminho para o log não custa autenticação nem consulta de tenant
    expect(fixture.events).toEqual([])
  })
})
