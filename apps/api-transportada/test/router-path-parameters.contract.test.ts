/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  capturePathRouterError,
  createRouterPathParametersFixture,
  ROUTER_DOCUMENT_ID,
  ROUTER_DOCUMENT_PATH,
  ROUTER_EXACT_PATH,
  routerPathRequest,
} from './fixtures/router-path-parameters.fixture'

describe('router path parameters contract', () => {
  test('exposes immutable path parameters through the public route parser contract', async () => {
    const source = await Bun.file(new URL('../src/http/router.service.ts', import.meta.url)).text()

    expect(source).toMatch(
      /export type RouterPathParameters\s*=\s*Readonly<Record<string, string>>/,
    )
    expect(source).toMatch(
      /export type RouteParserParams\s*=\s*\{[\s\S]*readonly pathParameters: RouterPathParameters[\s\S]*\}/,
    )
  })

  for (const dynamicFirst of [false, true]) {
    test(`prefers an exact route over a dynamic route when dynamicFirst=${dynamicFirst}`, async () => {
      const fixture = createRouterPathParametersFixture({ dynamicFirst })

      const response = await fixture.router.handle({
        correlationId: 'router-path-parameters',
        method: 'GET',
        pathname: ROUTER_EXACT_PATH,
        request: routerPathRequest(ROUTER_EXACT_PATH),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ route: 'exact' })
      expect(fixture.events).toEqual([
        'authenticate',
        'tenant',
        'authorize',
        'exact-parse',
        'exact-handle',
      ])
    })
  }

  test('matches one decoded UUID segment after authentication, tenant and RBAC', async () => {
    const fixture = createRouterPathParametersFixture()
    const encodedPath = ROUTER_DOCUMENT_PATH.replace('0c9e', '%30c9e')

    const response = await fixture.router.handle({
      correlationId: 'router-path-parameters',
      method: 'GET',
      pathname: encodedPath,
      request: routerPathRequest(encodedPath),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: ROUTER_DOCUMENT_ID, route: 'dynamic' })
    expect(fixture.events).toEqual([
      'authenticate',
      'tenant',
      'authorize',
      'dynamic-parse',
      'dynamic-handle',
    ])
  })

  for (const failure of [
    {
      events: ['authenticate'],
      failAt: 'authentication',
      status: 401,
    },
    {
      events: ['authenticate', 'tenant'],
      failAt: 'tenant',
      status: 403,
    },
    {
      events: ['authenticate', 'tenant', 'authorize'],
      failAt: 'authorization',
      status: 403,
    },
  ] as const) {
    test(`stops before parsing when ${failure.failAt} rejects the request`, async () => {
      const fixture = createRouterPathParametersFixture({ failAt: failure.failAt, method: 'POST' })
      const request = routerPathRequest(ROUTER_DOCUMENT_PATH, 'POST', 'sensitive-body-sentinel')

      const error = await capturePathRouterError(() =>
        fixture.router.handle({
          correlationId: 'router-path-parameters',
          method: 'POST',
          pathname: ROUTER_DOCUMENT_PATH,
          request,
        }),
      )

      expect(error.status).toBe(failure.status)
      expect(request.bodyUsed).toBe(false)
      expect(fixture.events).toEqual([...failure.events])
    })
  }

  for (const pathname of [
    '/nfe-documents/%2F',
    '/nfe-documents/%E0%A4%A',
    '/nfe-documents/not-a-uuid',
    '/nfe-documents/0C9E3E38-C9D0-4EF8-8A42-6DC75453E486',
    '/nfe-documents/0c9e3e38-c9d0-4ef8-8a42-6dc75453e486/extra',
  ]) {
    test(`rejects unsafe or non-canonical dynamic pathname ${pathname}`, async () => {
      const fixture = createRouterPathParametersFixture()

      const error = await capturePathRouterError(() =>
        fixture.router.handle({
          correlationId: 'router-path-parameters',
          method: 'GET',
          pathname,
          request: routerPathRequest(pathname),
        }),
      )

      expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 })
      expect(fixture.events).toEqual(['authenticate'])
    })
  }

  test('does not disclose a method or path mismatch', async () => {
    const fixture = createRouterPathParametersFixture()

    const error = await capturePathRouterError(() =>
      fixture.router.handle({
        correlationId: 'router-path-parameters',
        method: 'DELETE',
        pathname: ROUTER_DOCUMENT_PATH,
        request: routerPathRequest(ROUTER_DOCUMENT_PATH, 'DELETE'),
      }),
    )

    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.events).toEqual(['authenticate'])
  })

  test('preserves health and auth-me behavior while keeping protected exact routes', async () => {
    const fixture = createRouterPathParametersFixture()

    const health = await fixture.router.handle({
      correlationId: 'router-path-parameters',
      method: 'GET',
      pathname: '/health/live',
      request: routerPathRequest('/health/live'),
    })
    expect(health.status).toBe(200)
    expect(fixture.events).toEqual([])

    const authMe = await fixture.router.handle({
      correlationId: 'router-path-parameters',
      method: 'GET',
      pathname: '/auth/me',
      request: routerPathRequest('/auth/me'),
    })
    expect(authMe.status).toBe(200)
    expect(fixture.events).toEqual(['authenticate', 'tenant'])
  })
})
