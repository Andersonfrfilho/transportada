/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  READ_ONLY_PERMISSIONS,
  SUGGESTION_ID,
  createMultiVehicleHttpFixture,
  jsonRequest,
} from '../fixtures/route-suggestion-http.fixture.js'

const MULTI_VEHICLE_PATH = '/route-suggestions/multi-vehicle'
const SUGGESTION_PATH = `/route-suggestions/${SUGGESTION_ID}`
const FIRST_DOCUMENT = '00000000-0000-4000-8000-000000000020'
const SECOND_DOCUMENT = '00000000-0000-4000-8000-000000000021'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000010'
const SECOND_VEHICLE_ID = '00000000-0000-4000-8000-000000000011'
const DRIVER_ID = '00000000-0000-4000-8000-000000000030'

async function responseData<TData = Record<string, unknown>>(response: Response): Promise<TData> {
  const payload = (await response.json()) as { readonly data: TData }
  return payload.data
}

describe('as rotas da sugestão multi-veículo (spec 058 P2)', () => {
  /**
   * A rota vive **fora** de `/trips/:id`: a sugestão existe antes de as viagens existirem, e
   * pendurá-la numa viagem obrigaria a inventar uma para poder pedir a que decide quantas criar.
   */
  test('responde 202 com a sugestão sem viagem', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          nfeDocumentIds: [FIRST_DOCUMENT, SECOND_DOCUMENT],
          vehicles: [{ vehicleId: VEHICLE_ID }],
        },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(await responseData(response)).toMatchObject({ status: 'queued', tripId: null })
    expect(fixture.createCalls[0]).toMatchObject({
      documentIds: [FIRST_DOCUMENT, SECOND_DOCUMENT],
      vehicles: [{ vehicleId: VEHICLE_ID }],
    })
  })

  /** Aqui o corpo é obrigatório: sem nota e sem veículo não há pool a distribuir. */
  test('recusa corpo vazio, corpo sem veículo e campo desconhecido', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const empty = await fixture.handle(jsonRequest({ method: 'POST', path: MULTI_VEHICLE_PATH }))
    expect(empty.status).toBe(400)

    const withoutVehicles = await fixture.handle(
      jsonRequest({
        body: { nfeDocumentIds: [FIRST_DOCUMENT], vehicles: [] },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(withoutVehicles.status).toBe(400)

    const unknownField = await fixture.handle(
      jsonRequest({
        body: {
          nfeDocumentIds: [FIRST_DOCUMENT],
          tripId: 'x',
          vehicles: [{ vehicleId: VEHICLE_ID }],
        },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(unknownField.status).toBe(400)
    expect(fixture.createCalls).toEqual([])
  })

  /**
   * O aceite devolve **as viagens criadas** ao lado da sugestão: sem isso a tela teria de procurar,
   * numa lista de viagens, quais nasceram do clique que ela acabou de dar.
   */
  test('o aceite devolve as viagens criadas', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/accept` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({
      trips: [{ documentCount: 2, stopCount: 1, tripId: 'trip-1', vehicleId: 'vehicle-1' }],
    })
    expect(fixture.acceptCalls[0]).toMatchObject({ suggestionId: SUGGESTION_ID })
  })

  test('lê e rejeita pela mesma árvore, sem nomear viagem', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const read = await fixture.handle(jsonRequest({ method: 'GET', path: SUGGESTION_PATH }))
    expect(read.status).toBe(200)
    expect(fixture.readCalls[0]).toEqual({
      context: expect.anything(),
      suggestionId: SUGGESTION_ID,
    })

    const rejected = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/reject` }),
    )
    expect(rejected.status).toBe(200)
    expect(await responseData(rejected)).toMatchObject({ status: 'rejected' })
  })

  /**
   * Spec 081 (ADR-0055): o par. O motorista é **opcional** — distribuir a carga na véspera, antes de
   * saber quem dirige, era o único comportamento possível antes desta feature e segue válido.
   */
  test('aceita o par com motorista e o par sem motorista no mesmo pedido', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          nfeDocumentIds: [FIRST_DOCUMENT],
          vehicles: [
            { driverId: DRIVER_ID, vehicleId: VEHICLE_ID },
            { vehicleId: SECOND_VEHICLE_ID },
          ],
        },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(fixture.createCalls[0]).toMatchObject({
      vehicles: [{ driverId: DRIVER_ID, vehicleId: VEHICLE_ID }, { vehicleId: SECOND_VEHICLE_ID }],
    })
  })

  /** O par é objeto fechado: `driverId` fora do formato ou campo extra dentro dele é 400. */
  test('recusa par malformado antes de chegar ao caso de uso', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const notUuid = await fixture.handle(
      jsonRequest({
        body: {
          nfeDocumentIds: [FIRST_DOCUMENT],
          vehicles: [{ driverId: 'quem-dirige', vehicleId: VEHICLE_ID }],
        },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(notUuid.status).toBe(400)

    const extraField = await fixture.handle(
      jsonRequest({
        body: {
          nfeDocumentIds: [FIRST_DOCUMENT],
          vehicles: [{ plate: 'ABC1D23', vehicleId: VEHICLE_ID }],
        },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(extraField.status).toBe(400)

    /** A lista de ids da forma antiga não é mais o corpo desta rota. */
    const legacy = await fixture.handle(
      jsonRequest({
        body: { nfeDocumentIds: [FIRST_DOCUMENT], vehicleIds: [VEHICLE_ID] },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(legacy.status).toBe(400)

    expect(fixture.createCalls).toEqual([])
  })

  /** RF-6: quem ficou com o quê, sem uma segunda consulta à viagem recém-criada. */
  test('o aceite nomeia o motorista de cada viagem criada', async () => {
    const fixture = await createMultiVehicleHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/accept` }),
    )

    expect(response.status).toBe(200)
    const data = await responseData<{
      readonly trips: readonly { readonly driverId: string | null }[]
    }>(response)
    expect(data.trips.map((trip) => trip.driverId)).toEqual(['driver-1'])
  })

  /** Pedir roteiro é escrever viagem: `fleet.read` lê a sugestão, mas não a cria nem a decide. */
  test('exige trip.manage para criar, aceitar e rejeitar', async () => {
    const fixture = await createMultiVehicleHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const created = await fixture.handle(
      jsonRequest({
        body: { nfeDocumentIds: [FIRST_DOCUMENT], vehicles: [{ vehicleId: VEHICLE_ID }] },
        method: 'POST',
        path: MULTI_VEHICLE_PATH,
      }),
    )
    expect(created.status).toBe(403)

    const accepted = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/accept` }),
    )
    expect(accepted.status).toBe(403)

    const read = await fixture.handle(jsonRequest({ method: 'GET', path: SUGGESTION_PATH }))
    expect(read.status).toBe(200)
  })
})
