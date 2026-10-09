/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.4 (RF6, CA6): o liga/desliga da importação da empresa pelo roteador de verdade. `settings.manage` para
 * ler e escrever, corpo estrito (a empresa vem do contexto) e a resposta com a origem do valor.
 */
import { describe, expect, test } from 'bun:test'

import type { HolidayImportEnablementUseCases } from '../../src/business-calendar/application/holiday-import-enablement.use-case.js'
import { createHolidayImportEnablementRoutes } from '../../src/business-calendar/presentation/holiday-import-enablement.routes.js'
import {
  CLIENT_IP,
  createRoutesHttpFixture,
  getRequest,
  writeRequest,
} from '../fixtures/holiday-provider-settings-http.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000262e1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000262e9'
const USER_ID = '00000000-0000-4000-8000-0000000262e2'
const PATH = '/company-settings/holiday-import'

type SavedCall = Parameters<HolidayImportEnablementUseCases['save']['execute']>[0]

function fixture(
  overrides: {
    readonly permissions?: readonly string[]
    readonly record?: { readonly isEnabled: boolean } | null
  } = {},
) {
  const saved: SavedCall[] = []
  const found: string[] = []
  const useCases: HolidayImportEnablementUseCases = {
    get: {
      execute: async (input) => {
        found.push(input.companyId)
        return overrides.record === undefined ? null : overrides.record
      },
    },
    save: {
      execute: async (input) => {
        saved.push(input)
        return { isEnabled: input.isEnabled }
      },
    },
  }
  const http = createRoutesHttpFixture({
    companyId: COMPANY_ID,
    permissions: overrides.permissions ?? ['settings.manage'],
    routes: createHolidayImportEnablementRoutes({ ...useCases, resolveClientIp: () => CLIENT_IP }),
    userId: USER_ID,
  })
  return { ...http, found, saved }
}

describe('GET /company-settings/holiday-import (spec 262 RF6)', () => {
  test('without a row the importation is on, and the origin says it is the default', async () => {
    const context = fixture({ record: null })

    const response = await context.handle(getRequest(PATH))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { isEnabled: true, origin: 'default' } })
    expect(context.found).toEqual([COMPANY_ID])
  })

  test('with a row it answers the stored value and the company origin, and nothing else', async () => {
    const polluted = { cursorDocumentId: OTHER_COMPANY_ID, isEnabled: false }
    const context = fixture({ record: polluted })

    const response = await context.handle(getRequest(PATH))
    const text = await response.text()

    expect(JSON.parse(text)).toEqual({ data: { isEnabled: false, origin: 'company' } })
    expect(text).not.toContain(OTHER_COMPANY_ID)
  })
})

describe('PUT /company-settings/holiday-import (spec 262 RF6)', () => {
  test('writes only the flag, for the company and the user of the token', async () => {
    const context = fixture()

    const response = await context.handle(
      writeRequest({ body: { isEnabled: false }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { isEnabled: false, origin: 'company' } })
    expect(context.saved).toHaveLength(1)
    expect(context.saved[0]).toMatchObject({
      companyId: COMPANY_ID,
      ipAddress: CLIENT_IP,
      isEnabled: false,
      userId: USER_ID,
    })
  })

  test('refuses the company in the body, a non-boolean, an empty body and any extra field with 400', async () => {
    const bodies: readonly unknown[] = [
      { companyId: OTHER_COMPANY_ID, isEnabled: true },
      { cursorDocumentId: OTHER_COMPANY_ID, isEnabled: true },
      { isEnabled: 'false' },
      { isEnabled: 0 },
      { isEnabled: null },
      {},
    ]

    for (const body of bodies) {
      const context = fixture()

      const response = await context.handle(writeRequest({ body, method: 'PUT', path: PATH }))

      expect({ body, status: response.status }).toEqual({ body, status: 400 })
      expect(context.saved).toHaveLength(0)
    }
  })

  test('is refused without settings.manage, for reading and for writing', async () => {
    const context = fixture({ permissions: ['holiday-import.configure'] })

    const read = await context.handle(getRequest(PATH))
    const write = await context.handle(
      writeRequest({ body: { isEnabled: true }, method: 'PUT', path: PATH }),
    )

    expect([read.status, write.status]).toEqual([403, 403])
    expect(context.saved).toHaveLength(0)
  })
})

describe('the route table (spec 262 D2)', () => {
  test('both verbs ask settings.manage in the company scope, with no write bucket', () => {
    const unused = new Proxy(() => undefined, {
      apply: () => undefined,
      get: () => unused,
    }) as never

    const routes = createHolidayImportEnablementRoutes(unused)

    expect(
      routes.map((route) => ({
        policy: route.policy,
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        rateLimit: undefined,
        signature: 'GET /company-settings/holiday-import',
      },
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        rateLimit: undefined,
        signature: 'PUT /company-settings/holiday-import',
      },
    ])
  })
})
