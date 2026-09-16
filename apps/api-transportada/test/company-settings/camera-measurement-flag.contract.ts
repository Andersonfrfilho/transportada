/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoSettingsRoutes } from '../../src/companies/presentation/cargo-settings.routes.js'
import { ApiError } from '../../src/shared/api.error.js'
import { API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH } from '../../src/shared/api.constant.js'
import type { CargoSettings } from '../../src/companies/application/cargo-settings.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'

function context() {
  return { scope: { companyId: COMPANY_ID } } as never
}

function request(input: { readonly body?: unknown; readonly method: string }): Request {
  return new Request(`https://api.test${API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers: input.body === undefined ? {} : { 'content-type': 'application/json' },
    method: input.method,
  })
}

function createFixture(options: Readonly<{ enabled?: boolean }> = {}): Readonly<{
  routes: ReturnType<typeof createCargoSettingsRoutes>
  setCalls: Array<{ readonly companyId: string; readonly enabled: boolean }>
}> {
  let cameraMeasurementEnabled = options.enabled ?? false
  const setCalls: Array<{ readonly companyId: string; readonly enabled: boolean }> = []
  const settings = (): CargoSettings => ({
    cameraMeasurementEnabled,
    defaultVolumeWeight: null,
  })

  const routes = createCargoSettingsRoutes({
    clear: { execute: async () => {} },
    get: { execute: async () => settings() },
    set: { execute: async () => settings() },
    setCameraMeasurementEnabled: {
      execute: async (input) => {
        setCalls.push(input)
        cameraMeasurementEnabled = input.enabled
        return settings()
      },
    },
  })

  return { routes, setCalls }
}

async function statusOfRejection(promise: Promise<Response> | undefined): Promise<number> {
  try {
    await promise
    throw new Error('expected the promise to reject')
  } catch (error) {
    if (error instanceof ApiError) return error.status
    throw error
  }
}

function routeOf(
  routes: ReturnType<typeof createCargoSettingsRoutes>,
  method: string,
  pathname: string,
) {
  return routes.find((route) => route.method === method && route.pathname === pathname)
}

/**
 * Spec 152 D14: liga/desliga a medida pela câmera por empresa. A leitura do conferente
 * (`cargo.measure`) mora em `nfe-package-box/routes.contract.ts` — aqui é só o lado do painel.
 */
describe('o interruptor da medida pela câmera (spec 152 D14)', () => {
  test('PUT exige settings.manage, como o resto do cargo', () => {
    const { routes } = createFixture()

    const route = routeOf(routes, 'PUT', API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH)

    expect(route).toBeDefined()
    expect(route?.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
  })

  test('GET /company-settings/cargo ganha cameraMeasurementEnabled sem perder o peso padrão', async () => {
    const { routes } = createFixture({ enabled: true })
    const route = routeOf(routes, 'GET', '/company-settings/cargo')

    const response = await route?.execute({
      context: context(),
      correlationId: 'test',
      pathParameters: {},
      request: request({ method: 'GET' }),
    })

    expect(response?.status).toBe(200)
    const body = (await response?.json()) as { readonly data: CargoSettings }
    expect(body.data).toEqual({ cameraMeasurementEnabled: true, defaultVolumeWeight: null })
  })

  test('PUT grava o interruptor e devolve a leitura atualizada', async () => {
    const { routes, setCalls } = createFixture({ enabled: false })
    const route = routeOf(routes, 'PUT', API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH)

    const response = await route?.execute({
      context: context(),
      correlationId: 'test',
      pathParameters: {},
      request: request({ body: { enabled: true }, method: 'PUT' }),
    })

    expect(response?.status).toBe(200)
    expect(setCalls).toEqual([{ companyId: COMPANY_ID, enabled: true }])
    const body = (await response?.json()) as { readonly data: CargoSettings }
    expect(body.data.cameraMeasurementEnabled).toBe(true)
  })

  test('corpo estrito: recusa campo desconhecido e valor fora de boolean', async () => {
    const { routes, setCalls } = createFixture()
    const route = routeOf(routes, 'PUT', API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH)

    const unknownFieldStatus = await statusOfRejection(
      route?.execute({
        context: context(),
        correlationId: 'test',
        pathParameters: {},
        request: request({ body: { enabled: true, extra: 1 }, method: 'PUT' }),
      }),
    )
    const wrongTypeStatus = await statusOfRejection(
      route?.execute({
        context: context(),
        correlationId: 'test',
        pathParameters: {},
        request: request({ body: { enabled: 'true' }, method: 'PUT' }),
      }),
    )

    expect(unknownFieldStatus).toBe(400)
    expect(wrongTypeStatus).toBe(400)
    expect(setCalls).toHaveLength(0)
  })

  test('cache-control é no-store', async () => {
    const { routes } = createFixture()
    const route = routeOf(routes, 'PUT', API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH)

    const response = await route?.execute({
      context: context(),
      correlationId: 'test',
      pathParameters: {},
      request: request({ body: { enabled: true }, method: 'PUT' }),
    })

    expect(response?.headers.get('cache-control')).toBe('no-store')
  })
})
