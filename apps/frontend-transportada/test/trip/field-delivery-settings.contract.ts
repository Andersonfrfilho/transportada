/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 156 T13, ADR-0069 §6: o assistente de baixa lê se a leitura do canhoto está ligada por uma
 * rota estreita (`trip.report-on-behalf`), nunca pela configuração inteira do comprovante, que é
 * `settings.manage`. Resposta fora do contrato é erro, nunca "desligado" calado.
 */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN } from './trip.fixture'

const API_URL = 'https://api.example.test'
const QUERY_PATH = 'src/modules/trip/queries/useFieldDeliverySettings.query.ts'
const APPLICATION_ROOT = new URL('../..', import.meta.url)

type FieldDeliverySettingsClient = Readonly<{
  readFieldDeliverySettings: () => Promise<Readonly<{ canhotoOcrEnabled: boolean }>>
}>

type TripClientModule = Readonly<{
  createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => FieldDeliverySettingsClient
}>

async function createClient(
  input: Readonly<{ requests: Request[]; body: unknown }>,
): Promise<FieldDeliverySettingsClient> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: (target, init) => {
      const request = new Request(target, init)
      input.requests.push(request)
      return Promise.resolve(Response.json(input.body))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('leitura do interruptor do canhoto pelo escritório (spec 156 T13)', () => {
  test('GET /trips/field-delivery-settings com o token, devolvendo o interruptor', async () => {
    const requests: Request[] = []
    const client = await createClient({ body: { data: { canhotoOcrEnabled: true } }, requests })

    const settings = await client.readFieldDeliverySettings()

    expect(settings).toEqual({ canhotoOcrEnabled: true })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('GET')
    expect(requests[0]!.url).toBe(`${API_URL}/trips/field-delivery-settings`)
    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
  })

  test('não pede a configuração inteira do comprovante', async () => {
    const requests: Request[] = []
    const client = await createClient({ body: { data: { canhotoOcrEnabled: false } }, requests })

    await client.readFieldDeliverySettings()

    expect(requests.some((request) => request.url.includes('/company-settings/'))).toBe(false)
  })

  for (const data of [{}, { canhotoOcrEnabled: 'true' }, null]) {
    test(`resposta fora do contrato (${JSON.stringify(data)}) é erro, não "desligado"`, async () => {
      const client = await createClient({ body: { data }, requests: [] })

      const failure = await client.readFieldDeliverySettings().then(
        () => undefined,
        (error: unknown) => error,
      )

      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toBe('TRIP_RESPONSE_INVALID')
    })
  }

  test('a consulta tem chave própria e só busca quando o chamador libera', async () => {
    const source = await Bun.file(new URL(QUERY_PATH, APPLICATION_ROOT)).text()

    expect(source).toContain("['trip', 'field-delivery-settings']")
    expect(source).toContain('readFieldDeliverySettings()')
    expect(source).toContain('enabled: input.enabled')
  })
})
