/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCachedVehicleCatalogGateway } from '../../src/fleet/infrastructure/cached-vehicle-catalog.gateway.js'
import { createFipeVehicleCatalogGateway } from '../../src/fleet/infrastructure/fipe-vehicle-catalog.gateway.js'
import { FleetVehicleCatalogFailedError } from '../../src/fleet/domain/fleet.error.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { FleetVehicleCatalogPort } from '../../src/fleet/application/fleet-vehicle-catalog.port.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const BASE_URL = 'https://fipe.example.test'
const BRAND_CODE = '102'
const TRUCK = { role: 'traction', wheelType: '01' } as const
const CAR = { role: 'traction', wheelType: '04' } as const
const TRAILER = { role: 'trailer', wheelType: '' } as const

const THIRTY_DAYS_MILLISECONDS = 30 * 24 * 60 * 60 * 1000

type FetchCall = { readonly init: RequestInit | undefined; readonly url: string }

function transportFailure(): FleetVehicleCatalogFailedError {
  return new FleetVehicleCatalogFailedError({ failure: 'transport' })
}

function createGateway(
  input: Readonly<{ respond?: (call: FetchCall) => Promise<Response>; url?: string }> = {},
) {
  const calls: FetchCall[] = []
  const gateway = createFipeVehicleCatalogGateway({
    configuration: { url: input.url ?? BASE_URL },
    fetch: (target, init) => {
      const call = { init, url: String(target) }
      calls.push(call)
      return (
        input.respond ??
        (() => Promise.resolve(Response.json([{ nome: 'AGRALE', valor: BRAND_CODE }])))
      )(call)
    },
  })
  return { calls, gateway }
}

describe('fipe vehicle catalog gateway contract', () => {
  test('lists brands for a truck wheel type from the trucks segment', async () => {
    const { calls, gateway } = createGateway({
      respond: () => Promise.resolve(Response.json([{ nome: 'AGRALE', valor: BRAND_CODE }])),
    })

    const result = await gateway.listBrands(TRUCK)

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/fipe/marcas/v1/caminhoes`)
    expect(result).toEqual({ items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' })
  })

  test('lists models for a car wheel type from the cars segment', async () => {
    const { calls, gateway } = createGateway({
      respond: () => Promise.resolve(Response.json([{ modelo: 'UNO', valor: '5986' }])),
    })

    const result = await gateway.listModels({ ...CAR, brand: BRAND_CODE })

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/fipe/veiculos/v1/carros/${BRAND_CODE}`)
    expect(result).toEqual({ items: [{ label: 'UNO', value: '5986' }], source: 'fipe' })
  })

  test('never calls the provider for a trailer, which has no catalog coverage', async () => {
    const { calls, gateway } = createGateway()

    const result = await gateway.listBrands(TRAILER)

    expect(calls).toHaveLength(0)
    expect(result).toEqual({ items: [], source: 'none' })
  })

  test('turns a 429 from the provider into a typed gateway error carrying the status', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('slow down', { status: 429 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_CATALOG_FAILED')
    expect((failure as ApiError).status).toBe(502)
    expect(failure).toBeInstanceOf(FleetVehicleCatalogFailedError)
    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('provider_status')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBe(429)
  })

  test('a 500 is the same error with a different status — 429 and 500 stay apart', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('boom', { status: 500 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_CATALOG_FAILED')
    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('provider_status')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBe(500)
  })

  // Simula o que um fetch real faz quando o AbortSignal.timeout dispara, sem esperar o prazo real
  test('gives up instead of hanging when the provider never answers before the deadline', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    const { calls, gateway } = createGateway({ respond: () => Promise.reject(abortError) })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('transport')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBeUndefined()
  })

  test('a body that is not a list of records is a malformed body, not a transport failure', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(Response.json({ mensagem: 'nada aqui' })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('malformed_body')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBe(200)
  })

  test('a 200 that is not JSON is a malformed body too', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('<html>manutenção</html>', { status: 200 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('malformed_body')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBe(200)
  })

  /**
   * Defeito medido em staging: a BrasilAPI devolveu 500 duas vezes seguidas para `carros`, o rodado
   * VAN ficou sem marca nenhuma e o operador não tinha o que escolher. O mesmo pedido respondeu 200
   * minutos depois — era piscar do provedor, e uma tentativa só o transformava em campo vazio.
   */
  test('a 500 do provedor é tentado de novo, e a segunda resposta vale', async () => {
    let attempts = 0
    const { calls, gateway } = createGateway({
      respond: () => {
        attempts += 1
        return Promise.resolve(
          attempts === 1
            ? new Response('boom', { status: 500 })
            : Response.json([{ nome: 'Acura', valor: '1' }]),
        )
      },
    })

    const result = await gateway.listBrands(CAR)

    expect(calls).toHaveLength(2)
    expect(result).toEqual({ items: [{ label: 'Acura', value: '1' }], source: 'fipe' })
  })

  test('a falha de rede também é tentada de novo', async () => {
    let attempts = 0
    const { calls, gateway } = createGateway({
      respond: () => {
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('socket hang up'))
        return Promise.resolve(Response.json([{ nome: 'Acura', valor: '1' }]))
      },
    })

    const result = await gateway.listBrands(CAR)

    expect(calls).toHaveLength(2)
    expect(result.items).toHaveLength(1)
  })

  // 429 é o provedor pedindo para parar: repetir na hora é desobedecer, e ele responde 429 de novo.
  test('um 429 não é tentado de novo', async () => {
    const { calls, gateway } = createGateway({
      respond: () => Promise.resolve(new Response('slow down', { status: 429 })),
    })

    await gateway.listBrands(TRUCK).catch(() => undefined)

    expect(calls).toHaveLength(1)
  })

  test('um corpo malformado não é tentado de novo — repetir devolve o mesmo corpo', async () => {
    const { calls, gateway } = createGateway({
      respond: () => Promise.resolve(Response.json({ mensagem: 'nada aqui' })),
    })

    await gateway.listBrands(TRUCK).catch(() => undefined)

    expect(calls).toHaveLength(1)
  })

  test('desiste depois de três tentativas e propaga a falha do provedor', async () => {
    const { calls, gateway } = createGateway({
      respond: () => Promise.resolve(new Response('boom', { status: 503 })),
    })

    const failure = await gateway.listBrands(CAR).catch((error: unknown) => error)

    expect(calls).toHaveLength(3)
    expect((failure as FleetVehicleCatalogFailedError).failure).toBe('provider_status')
    expect((failure as FleetVehicleCatalogFailedError).providerStatus).toBe(503)
  })

  test('the error never carries the provider body nor the catalog url', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('rate limited by cloudflare', { status: 429 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)
    const serialized = `${(failure as Error).message} ${JSON.stringify(failure)}`

    expect(serialized).not.toContain('cloudflare')
    expect(serialized).not.toContain(BASE_URL)
  })
})

describe('cached vehicle catalog gateway contract', () => {
  const noopLogger: ApiLogger = {
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  }

  function createFakeInner(
    respond: () => Promise<{ items: readonly { label: string; value: string }[]; source: 'fipe' }>,
  ): { state: { calls: number }; port: FleetVehicleCatalogPort } {
    const state = { calls: 0 }
    const port: FleetVehicleCatalogPort = {
      listBrands: async () => {
        state.calls += 1
        return respond()
      },
      listModels: async () => {
        state.calls += 1
        return respond()
      },
    }
    return { port, state }
  }

  test('serves a successful answer from cache for a month — marca e modelo não mudam', async () => {
    const { port, state } = createFakeInner(() =>
      Promise.resolve({ items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' }),
    )
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + THIRTY_DAYS_MILLISECONDS - 1)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(1)
  })

  test('goes back to the provider once the month expires', async () => {
    const { port, state } = createFakeInner(() => Promise.resolve({ items: [], source: 'fipe' }))
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + THIRTY_DAYS_MILLISECONDS + 1)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  test('honours a shorter window when the environment configures one', async () => {
    const { port, state } = createFakeInner(() => Promise.resolve({ items: [], source: 'fipe' }))
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
      successTtlMilliseconds: 60 * 60 * 1000,
    })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 60 * 60 * 1000 - 1)
    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 2)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  // Janela zero é o modo de depuração: o provedor responde a cada chamada, e o último bom
  // resultado continua guardado para cobrir uma falha.
  test('a zero window asks the provider every time', async () => {
    const { port, state } = createFakeInner(() => Promise.resolve({ items: [], source: 'fipe' }))
    const clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
      successTtlMilliseconds: 0,
    })

    await gateway.listBrands(TRUCK)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  test('caches a provider failure for 60 seconds instead of hammering it', async () => {
    const { port, state } = createFakeInner(() => {
      throw transportFailure()
    })
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    const first = await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 59_000)
    const second = await gateway.listBrands(TRUCK)

    expect(first).toEqual({ items: [], source: 'unavailable' })
    expect(second).toEqual({ items: [], source: 'unavailable' })
    expect(state.calls).toBe(1)
  })

  /**
   * Este é o defeito visto em produção: um piscar do provedor derrubava a lista de 29 marcas para
   * as 2 já cadastradas na frota, e a tela ficava assim por 60 segundos sem nada dizer.
   */
  test('a provider blip serves the last good answer instead of an empty list', async () => {
    let shouldFail = false
    const state = { calls: 0 }
    const port: FleetVehicleCatalogPort = {
      listBrands: async () => {
        state.calls += 1
        if (shouldFail) throw transportFailure()
        return { items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' }
      },
      listModels: async () => ({ items: [], source: 'fipe' }),
    }
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    const good = await gateway.listBrands(TRUCK)
    shouldFail = true
    clock = new Date(clock.getTime() + THIRTY_DAYS_MILLISECONDS + 1)
    const duringBlip = await gateway.listBrands(TRUCK)

    expect(good.items).toHaveLength(1)
    expect(duringBlip).toEqual(good)
    expect(state.calls).toBe(2)
  })

  test('the stale answer is served for 60 seconds only, then the provider is tried again', async () => {
    let shouldFail = false
    const state = { calls: 0 }
    const port: FleetVehicleCatalogPort = {
      listBrands: async () => {
        state.calls += 1
        if (shouldFail) throw transportFailure()
        return { items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' }
      },
      listModels: async () => ({ items: [], source: 'fipe' }),
    }
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    await gateway.listBrands(TRUCK)
    shouldFail = true
    clock = new Date(clock.getTime() + THIRTY_DAYS_MILLISECONDS + 1)
    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 61_000)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(3)
  })

  test('logs the failure cause and the provider status, without leaking its message', async () => {
    const { port } = createFakeInner(() => {
      throw new FleetVehicleCatalogFailedError({ failure: 'provider_status', providerStatus: 429 })
    })
    const logs: { message: string; metadata?: Record<string, unknown> }[] = []
    const logger: ApiLogger = {
      error: (message, metadata) => {
        logs.push({ message, ...(metadata === undefined ? {} : { metadata }) })
      },
      info: () => undefined,
      warn: () => undefined,
    }
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, logger })

    await gateway.listBrands(TRUCK)

    expect(logs).toHaveLength(1)
    expect(logs[0]?.message).toBe('fleet.vehicle_catalog.fetch_failed')
    expect(logs[0]?.metadata).toEqual({
      errorName: 'ApiError',
      failure: 'provider_status',
      providerStatus: 429,
      segment: 'caminhoes',
      servedStale: false,
      sqlState: 'FLEET_VEHICLE_CATALOG_FAILED',
    })
  })

  test('the log says when a stale answer covered the failure', async () => {
    let shouldFail = false
    const port: FleetVehicleCatalogPort = {
      listBrands: async () => {
        if (shouldFail) throw transportFailure()
        return { items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' }
      },
      listModels: async () => ({ items: [], source: 'fipe' }),
    }
    const logs: { message: string; metadata?: Record<string, unknown> }[] = []
    const logger: ApiLogger = {
      error: (message, metadata) => {
        logs.push({ message, ...(metadata === undefined ? {} : { metadata }) })
      },
      info: () => undefined,
      warn: () => undefined,
    }
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger,
      now: () => clock,
    })

    await gateway.listBrands(TRUCK)
    shouldFail = true
    clock = new Date(clock.getTime() + THIRTY_DAYS_MILLISECONDS + 1)
    await gateway.listBrands(TRUCK)

    expect(logs[0]?.metadata).toMatchObject({ failure: 'transport', servedStale: true })
  })

  test('an unknown failure shape still logs, with no cause invented for it', async () => {
    const { port } = createFakeInner(() => {
      throw new Error('boom')
    })
    const logs: { message: string; metadata?: Record<string, unknown> }[] = []
    const logger: ApiLogger = {
      error: (message, metadata) => {
        logs.push({ message, ...(metadata === undefined ? {} : { metadata }) })
      },
      info: () => undefined,
      warn: () => undefined,
    }
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, logger })

    await gateway.listBrands(TRUCK)

    expect(logs[0]?.metadata).toEqual({
      errorName: 'Error',
      segment: 'caminhoes',
      servedStale: false,
    })
  })

  test('retries the provider once the 60 second failure cache expires', async () => {
    const { port, state } = createFakeInner(() => {
      throw transportFailure()
    })
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => clock,
    })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 61_000)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  test('keys the cache by segment and brand so different lookups do not collide', async () => {
    const { port, state } = createFakeInner(() =>
      Promise.resolve({ items: [{ label: 'UNO', value: '5986' }], source: 'fipe' }),
    )
    const gateway = createCachedVehicleCatalogGateway({
      gateway: port,
      logger: noopLogger,
      now: () => new Date(),
    })

    await gateway.listModels({ ...CAR, brand: '102' })
    await gateway.listModels({ ...CAR, brand: '103' })

    expect(state.calls).toBe(2)
  })
})
