/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createFleetClient } from '../../src/modules/fleet/shared/fleetClient.service'
import type { FleetClient } from '../../src/modules/fleet/shared/fleetClient.service'
import type { FreightRegion } from '../../src/modules/fleet/shared/freightRegion.types'

const ACCESS_TOKEN = 'synthetic-access-token'
const API_URL = 'https://api.example.test'
const REGIONS_PATH = `${API_URL}/freight-regions`
const REGION_ID = '00000000-0000-4000-8000-000000000001'

const REGION: FreightRegion = {
  cities: [{ city: 'COLINA', state: 'SP' }],
  code: '1.001',
  createdAt: '2026-08-20T00:00:00.000Z',
  id: REGION_ID,
  name: 'Barretos Zona 2',
  rates: [{ driverAmount: '620.0000', freightClass: 'van' }],
  status: 'active',
  updatedAt: '2026-08-20T00:00:00.000Z',
  version: '3',
  zone: 2,
}

const BODY = {
  cities: REGION.cities,
  code: REGION.code,
  name: REGION.name,
  rates: REGION.rates,
} as const

function clientWith(
  resolve: (request: Request) => Promise<Response>,
  requests: Request[] = [],
): FleetClient {
  return createFleetClient({
    apiUrl: API_URL,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return resolve(request)
    },
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  })
}

/** Espera a chamada falhar e devolve a mensagem: chamada que resolve é falha do teste, não sucesso. */
async function failureOf(call: Promise<unknown>): Promise<string> {
  const outcome: unknown = await call.then(() => undefined).catch((cause: unknown) => cause)
  if (!(outcome instanceof Error)) {
    throw new Error('a chamada resolveu, e devia ter falhado')
  }
  return outcome.message
}

function respond(request: Request): Promise<Response> {
  if (request.url === `${REGIONS_PATH}/import`) {
    return Promise.resolve(Response.json({ data: { created: 29, deactivated: 1, updated: 2 } }))
  }
  if (request.method === 'DELETE') {
    return Promise.resolve(new Response(null, { status: 204 }))
  }
  return Promise.resolve(
    Response.json({ data: REGION }, { status: request.method === 'POST' ? 201 : 200 }),
  )
}

describe('freight region write contract', () => {
  test('criar manda o corpo da rota para POST /freight-regions, autenticado e sem cache', async () => {
    const requests: Request[] = []
    const client = clientWith(respond, requests)

    expect(await client.createFreightRegion(BODY)).toEqual(REGION)

    const [request] = requests
    if (request === undefined) throw new Error('nenhuma requisição registrada')
    expect(request.method).toBe('POST')
    expect(request.url).toBe(REGIONS_PATH)
    expect(request.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
    expect(await request.json()).toEqual(BODY)
  })

  /** `expectedVersion` e `status` só existem no `PUT`; o `strict()` do `POST` os recusaria. */
  test('editar manda expectedVersion e status, e o POST não os manda', async () => {
    const requests: Request[] = []
    const client = clientWith(respond, requests)

    await client.updateFreightRegion({
      ...BODY,
      expectedVersion: '3',
      regionId: REGION_ID,
      status: 'active',
    })
    await client.createFreightRegion(BODY)

    const [updateRequest, createRequest] = requests
    if (updateRequest === undefined || createRequest === undefined) {
      throw new Error('faltou requisição')
    }
    expect(updateRequest.method).toBe('PUT')
    expect(updateRequest.url).toBe(`${REGIONS_PATH}/${REGION_ID}`)
    expect(await updateRequest.json()).toEqual({
      ...BODY,
      expectedVersion: '3',
      status: 'active',
    })
    expect(Object.keys((await createRequest.json()) as object).sort()).toEqual([
      'cities',
      'code',
      'name',
      'rates',
    ])
  })

  /** O 204 vem sem corpo: ler JSON dele derrubaria o apagar que deu certo. */
  test('apagar aceita o 204 sem corpo', async () => {
    const client = clientWith(respond)

    expect(await client.deleteFreightRegion({ regionId: REGION_ID })).toBeUndefined()
  })

  test('importar manda os dois arquivos como texto e devolve o resumo', async () => {
    const requests: Request[] = []
    const client = clientWith(respond, requests)

    expect(
      await client.importFreightRegions({
        rates: 'codigo;truck\n1.000;900',
        regions: 'codigo\n1.000',
      }),
    ).toEqual({ created: 29, deactivated: 1, updated: 2 })

    const [request] = requests
    if (request === undefined) throw new Error('nenhuma requisição registrada')
    expect(request.url).toBe(`${REGIONS_PATH}/import`)
    expect(await request.json()).toEqual({
      rates: 'codigo;truck\n1.000;900',
      regions: 'codigo\n1.000',
    })
  })

  test('o conflito de versão sobe com o código da API, não como falha genérica', async () => {
    const client = clientWith(() =>
      Promise.resolve(
        Response.json(
          { error: { code: 'FREIGHT_REGION_VERSION_CONFLICT', message: 'conflict' } },
          { status: 409 },
        ),
      ),
    )

    expect(
      await client
        .updateFreightRegion({
          ...BODY,
          expectedVersion: '1',
          regionId: REGION_ID,
          status: 'active',
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FREIGHT_REGION_VERSION_CONFLICT' }))
  })

  test('resumo de importação fora da forma esperada é recusado', async () => {
    const client = clientWith(() => Promise.resolve(Response.json({ data: { created: '29' } })))

    expect(
      await client
        .importFreightRegions({ rates: 'a', regions: 'b' })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_RESPONSE_INVALID' }))
  })
})
