/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCachedVehicleCatalogGateway } from '../../src/fleet/infrastructure/cached-vehicle-catalog.gateway.js'
import { createFipeVehicleCatalogGateway } from '../../src/fleet/infrastructure/fipe-vehicle-catalog.gateway.js'
import { FleetVehicleCatalogFailedError } from '../../src/fleet/domain/fleet.error.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { FleetVehicleCatalogPort } from '../../src/fleet/application/fleet-vehicle-catalog.port.js'

const BASE_URL = 'https://fipe.example.test'
const BRAND_CODE = '102'
const TRUCK = { role: 'traction', wheelType: '01' } as const
const CAR = { role: 'traction', wheelType: '04' } as const
const TRAILER = { role: 'trailer', wheelType: '' } as const

type FetchCall = { readonly init: RequestInit | undefined; readonly url: string }

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

  test('turns a 429 from the provider into a typed gateway error', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('slow down', { status: 429 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_CATALOG_FAILED')
    expect((failure as ApiError).status).toBe(502)
  })

  test('turns a 500 from the provider into the same typed gateway error', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('boom', { status: 500 })),
    })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_CATALOG_FAILED')
  })

  // Simula o que um fetch real faz quando o AbortSignal.timeout dispara, sem esperar o prazo real
  test('gives up instead of hanging when the provider never answers before the deadline', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    const { calls, gateway } = createGateway({ respond: () => Promise.reject(abortError) })

    const failure = await gateway.listBrands(TRUCK).catch((error: unknown) => error)

    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_CATALOG_FAILED')
  })
})

describe('cached vehicle catalog gateway contract', () => {
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

  test('serves a successful answer from cache within the 24 hour window', async () => {
    const { port, state } = createFakeInner(() =>
      Promise.resolve({ items: [{ label: 'AGRALE', value: BRAND_CODE }], source: 'fipe' }),
    )
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, now: () => clock })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000 - 1)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(1)
  })

  test('goes back to the provider once the 24 hour cache expires', async () => {
    const { port, state } = createFakeInner(() => Promise.resolve({ items: [], source: 'fipe' }))
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, now: () => clock })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000 + 1)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  test('caches a provider failure for 60 seconds instead of hammering it', async () => {
    const { port, state } = createFakeInner(() => {
      throw new FleetVehicleCatalogFailedError()
    })
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, now: () => clock })

    const first = await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 59_000)
    const second = await gateway.listBrands(TRUCK)

    expect(first).toEqual({ items: [], source: 'unavailable' })
    expect(second).toEqual({ items: [], source: 'unavailable' })
    expect(state.calls).toBe(1)
  })

  test('retries the provider once the 60 second failure cache expires', async () => {
    const { port, state } = createFakeInner(() => {
      throw new FleetVehicleCatalogFailedError()
    })
    let clock = new Date('2026-01-01T00:00:00.000Z')
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, now: () => clock })

    await gateway.listBrands(TRUCK)
    clock = new Date(clock.getTime() + 61_000)
    await gateway.listBrands(TRUCK)

    expect(state.calls).toBe(2)
  })

  test('keys the cache by segment and brand so different lookups do not collide', async () => {
    const { port, state } = createFakeInner(() =>
      Promise.resolve({ items: [{ label: 'UNO', value: '5986' }], source: 'fipe' }),
    )
    const gateway = createCachedVehicleCatalogGateway({ gateway: port, now: () => new Date() })

    await gateway.listModels({ ...CAR, brand: '102' })
    await gateway.listModels({ ...CAR, brand: '103' })

    expect(state.calls).toBe(2)
  })
})
