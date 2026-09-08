import { describe, expect, mock, test } from 'bun:test'

import {
  ADJUSTED_TOLL_BOOTH_CHARGE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  TOLL_BOOTH_CHARGE_ENTRIES,
  loadFutureModule,
  type TollBoothChargeEntryContract,
} from './company-settings.fixture'

const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const TOLL_BOOTH_CHARGES_URL = 'https://transportada.test/company-settings/toll-booth-charges'

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly adjustTollBoothCharge: (
      input: Readonly<{
        chargeCar?: string | null
        chargePerAxle?: string | null
        chargePerAxleAutomatic?: string | null
        observedOn: string
        osmNodeId: number
      }>,
    ) => Promise<TollBoothChargeEntryContract>
    readonly clearTollBoothCharge: (osmNodeId: number) => Promise<void>
    readonly getTollBoothCharges: () => Promise<readonly TollBoothChargeEntryContract[]>
  }
}

async function tollBoothChargeClient(fetch: (request: Request) => Promise<Response>) {
  const { createCompanySettingsClient } =
    await loadFutureModule<CompanySettingsClientModule>(CLIENT_MODULE)
  return createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

describe('toll booth charge client contract (spec 095)', () => {
  test('lê a lista de praças já vistas em rota, com catálogo e valor efetivo', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(TOLL_BOOTH_CHARGES_URL)
      expect(request.method).toBe('GET')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
      return Promise.resolve(Response.json({ data: TOLL_BOOTH_CHARGE_ENTRIES }))
    })

    const charges = await (await tollBoothChargeClient(fetch)).getTollBoothCharges()

    expect(charges).toEqual([...TOLL_BOOTH_CHARGE_ENTRIES])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('ajusta a tarifa com PUT no id do nó do OSM, nunca num identificador opaco', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe(`${TOLL_BOOTH_CHARGES_URL}/222`)
      expect(request.method).toBe('PUT')
      expect(request.headers.get('content-type')).toBe('application/json')
      expect(await request.json()).toEqual({
        chargeCar: null,
        chargePerAxle: '9.9000',
        chargePerAxleAutomatic: null,
        observedOn: '2026-09-07',
      })
      return Response.json({ data: ADJUSTED_TOLL_BOOTH_CHARGE })
    })

    const charge = await (
      await tollBoothChargeClient(fetch)
    ).adjustTollBoothCharge({
      chargePerAxle: '9.9000',
      observedOn: '2026-09-07',
      osmNodeId: 222,
    })

    expect(charge).toEqual(ADJUSTED_TOLL_BOOTH_CHARGE)
  })

  // Apaga o ajuste inteiro — a praça volta a valer o catálogo, nunca grava zero
  test('limpa o ajuste com DELETE e não espera corpo nenhum de volta', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(`${TOLL_BOOTH_CHARGES_URL}/111`)
      expect(request.method).toBe('DELETE')
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    expect(await (await tollBoothChargeClient(fetch)).clearTollBoothCharge(111)).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('recusa uma linha que não descreve a praça inteira', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ data: [{ osmNodeId: 111, name: 'Praça SP-330' }] })),
    )

    expect((await tollBoothChargeClient(fetch)).getTollBoothCharges()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('recusa uma origem de campo que a tela não sabe nomear', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({
          data: [{ ...TOLL_BOOTH_CHARGE_ENTRIES[0], chargePerAxleSource: 'osm' }],
        }),
      ),
    )

    expect((await tollBoothChargeClient(fetch)).getTollBoothCharges()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('propaga o código de erro da API sem inventar mensagem', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })),
    )

    expect(
      (await tollBoothChargeClient(fetch)).adjustTollBoothCharge({
        chargePerAxle: '9.9000',
        observedOn: '2026-09-07',
        osmNodeId: 222,
      }),
    ).rejects.toThrow('FORBIDDEN')
  })
})
