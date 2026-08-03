/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createHttpVehicleLookupGateway } from '../../src/fleet/infrastructure/http-vehicle-lookup.gateway.js'
import { ApiError } from '../../src/shared/api.error.js'

const PLATE = 'ABC1D23'
const TOKEN = 'synthetic-lookup-token'
const BASE_URL = 'https://lookup.example.test/vehicles'

type FetchCall = { readonly init: RequestInit | undefined; readonly url: string }

function createGateway(
  input: Readonly<{
    respond?: (call: FetchCall) => Promise<Response>
    token?: string
    url?: string
  }> = {},
) {
  const calls: FetchCall[] = []
  const gateway = createHttpVehicleLookupGateway({
    configuration: { token: input.token ?? TOKEN, url: input.url ?? BASE_URL },
    fetch: (target, init) => {
      const call = { init, url: String(target) }
      calls.push(call)
      return (input.respond ?? (() => Promise.resolve(Response.json({ placa: PLATE }))))(call)
    },
  })
  return { calls, gateway }
}

describe('http vehicle lookup gateway contract', () => {
  test('sends the plate as a query parameter when the url has no placeholder', async () => {
    const { calls, gateway } = createGateway({ url: `${BASE_URL}?formato=json` })

    await gateway.lookupByPlate({ plate: PLATE })

    expect(calls[0]?.url).toBe(`${BASE_URL}?formato=json&placa=${PLATE}`)
  })

  // Serviço com placa no caminho (`/consulta/{placa}`) é tão comum quanto o de query string
  test('replaces the placeholder when the url carries one', async () => {
    const { calls, gateway } = createGateway({ url: `${BASE_URL}/{placa}/dados` })

    await gateway.lookupByPlate({ plate: PLATE })

    expect(calls[0]?.url).toBe(`${BASE_URL}/${PLATE}/dados`)
    expect(calls[0]?.url).not.toContain('{placa}')
  })

  test('authenticates with a bearer token and gives up before hanging the request', async () => {
    const { calls, gateway } = createGateway()

    await gateway.lookupByPlate({ plate: PLATE })

    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headers.get('accept')).toBe('application/json')
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  test('omits the authorization header when the provider needs no token', async () => {
    const { calls, gateway } = createGateway({ token: '' })

    await gateway.lookupByPlate({ plate: PLATE })

    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBeNull()
  })

  test('normalizes whatever shape the provider answers', async () => {
    const { gateway } = createGateway({
      respond: () =>
        Promise.resolve(
          Response.json({ dados: { marcaModelo: 'VOLVO/FH 540', placa: PLATE, uf: 'sp' } }),
        ),
    })

    expect(await gateway.lookupByPlate({ plate: PLATE })).toEqual({
      brand: 'VOLVO',
      capacityKilograms: '',
      model: 'FH 540',
      modelYear: '',
      ownerName: '',
      ownerTaxId: '',
      plate: PLATE,
      renavam: '',
      state: 'SP',
      tareWeightKilograms: '',
    })
  })

  test('answers nothing for a plate the provider does not know', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(Response.json({ erro: 'not found' }, { status: 404 })),
    })

    expect(await gateway.lookupByPlate({ plate: PLATE })).toBeNull()
  })

  test('turns a provider failure into a gateway error instead of a 500', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('boom', { status: 500 })),
    })

    const failure = await gateway.lookupByPlate({ plate: PLATE }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_LOOKUP_FAILED')
    expect((failure as ApiError).status).toBe(502)
  })

  test('turns a broken payload into a gateway error', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.resolve(new Response('<html>nope</html>', { status: 200 })),
    })

    expect(
      await gateway.lookupByPlate({ plate: PLATE }).catch((error: unknown) => error),
    ).toBeInstanceOf(ApiError)
  })

  // O token do provedor não pode acabar num log de erro
  test('never leaks the token or the url when the network fails', async () => {
    const { gateway } = createGateway({
      respond: () => Promise.reject(new Error(`connect ECONNREFUSED ${BASE_URL} ${TOKEN}`)),
    })

    const failure = await gateway.lookupByPlate({ plate: PLATE }).catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_LOOKUP_FAILED')
    expect(JSON.stringify(failure)).not.toContain(TOKEN)
    expect((failure as ApiError).message).not.toContain(TOKEN)
  })
})
