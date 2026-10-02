/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T1.2 (CA01): `GET /trips/:id/delivery-proofs` — os comprovantes de todas as notas da
 * viagem numa chamada só. A fronteira é a mesma da leitura de uma nota (`fleet.read`): exigir
 * `trip.manage` esconderia o canhoto de quem só acompanha a operação.
 */
import { describe, expect, test } from 'bun:test'

import { DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS } from '../../src/trips/domain/delivery-proof-batch.constant.js'
import {
  COMPANY_ID,
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createTripHttpFixture,
  NO_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

const PATH = `${TRIPS_PATH}/${TRIP_ID}/delivery-proofs`
const FIRST_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
const SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d2'

const PROOF_VIEWS = [
  { documentId: FIRST_DOCUMENT_ID, id: '00000000-0000-4000-8000-0000000000a1', kind: 'photo' },
  { documentId: SECOND_DOCUMENT_ID, id: '00000000-0000-4000-8000-0000000000a2', kind: 'photo' },
]

function get(path: string): Request {
  return jsonRequest({ method: 'GET', path })
}

function buildDocumentIds(count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  )
}

describe('GET /trips/:id/delivery-proofs (spec 222 T1.2)', () => {
  test('200 com o envelope { data } e documentId em cada item', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readTripDeliveryProofsResult: PROOF_VIEWS,
    })

    const response = await fixture.handle(get(PATH))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(PROOF_VIEWS)
  })

  test('a empresa vem do contexto autenticado e a viagem do caminho; sem filtro, sem documentIds', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    await fixture.handle(get(PATH))

    expect(fixture.readTripDeliveryProofsCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
        tripId: TRIP_ID,
      },
    ])
    expect(fixture.readTripDeliveryProofsCalls[0]).not.toHaveProperty('documentIds')
  })

  test('companyId na query é recusado: a empresa nunca vem do cliente', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(get(`${PATH}?companyId=${COMPANY_ID}`))

    expect(response.status).toBe(400)
    expect(fixture.readTripDeliveryProofsCalls).toEqual([])
  })

  test('fleet.read basta e trip.manage não é exigido', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(get(PATH))

    expect(response.status).toBe(200)
    expect(READ_ONLY_PERMISSIONS.has('trip.manage')).toBe(false)
  })

  test('trip.report-on-behalf (baixa do escritório) também lê, como a rota de uma nota', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['trip.report-on-behalf']),
    })

    const response = await fixture.handle(get(PATH))

    expect(response.status).toBe(200)
  })

  test('403 sem permissão, e trip.manage sozinho não abre a leitura', async () => {
    for (const permissions of [NO_PERMISSIONS, new Set(['trip.manage'] as const)]) {
      const fixture = await createTripHttpFixture({ permissions })

      const response = await fixture.handle(get(PATH))

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
      expect(fixture.readTripDeliveryProofsCalls).toEqual([])
    }
  })

  test('?documentIds= filtra: uuids separados por vírgula, sem repetição, na ordem pedida', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      get(`${PATH}?documentIds=${SECOND_DOCUMENT_ID},${FIRST_DOCUMENT_ID},${SECOND_DOCUMENT_ID}`),
    )

    expect(response.status).toBe(200)
    expect(fixture.readTripDeliveryProofsCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
        documentIds: [SECOND_DOCUMENT_ID, FIRST_DOCUMENT_ID],
        tripId: TRIP_ID,
      },
    ])
  })

  test('o teto de documentIds passa no limite e reprova um acima — recusa, nunca trunca', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const atCeiling = await fixture.handle(
      get(`${PATH}?documentIds=${buildDocumentIds(DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS).join(',')}`),
    )
    const overCeiling = await fixture.handle(
      get(
        `${PATH}?documentIds=${buildDocumentIds(DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS + 1).join(',')}`,
      ),
    )

    expect(atCeiling.status).toBe(200)
    expect(overCeiling.status).toBe(400)
    expect(fixture.readTripDeliveryProofsCalls).toHaveLength(1)
  })

  test('400 para documentIds vazio, com id que não é uuid, repetido na query ou chave desconhecida', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })
    const invalidQueries = [
      'documentIds=',
      'documentIds=,',
      `documentIds=${FIRST_DOCUMENT_ID},not-a-uuid`,
      `documentIds=${FIRST_DOCUMENT_ID}&documentIds=${SECOND_DOCUMENT_ID}`,
      'documentId=whatever',
    ]

    for (const query of invalidQueries) {
      const response = await fixture.handle(get(`${PATH}?${query}`))

      expect(response.status).toBe(400)
    }
    expect(fixture.readTripDeliveryProofsCalls).toEqual([])
  })
})
