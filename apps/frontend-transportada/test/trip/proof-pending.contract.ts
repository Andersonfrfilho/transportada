/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 T4.3 a T4.5 (RF4, RF9): a pendência de canhoto fora da resposta da baixa. A API manda
 * `proofPending` por nota e aceita `proofPendingEq` na lista; o painel mostra o selo na nota e
 * oferece o filtro.
 *
 * ⚠️ O campo é **opcional** no guard: API anterior ao campo não o manda, e chave desconhecida ou
 * exigida derrubaria a viagem inteira (a quebra de 22/09 com `openOccurrenceCase`). Ausente não é
 * "sem pendência" — é "esta API não conta", e o selo só aparece com `true`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { hasProofPendingMarker } from '@/modules/trip/shared/proofPendingMarker.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import {
  clearTripFilterField,
  describeTripFilterPills,
} from '@/modules/trip/shared/tripFilterPills.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'
import { countActiveTripFilters } from '@/modules/trip/shared/tripTable.service'

import { SYNTHETIC_ACCESS_TOKEN, TRIP_PAGE } from './trip.fixture'

const adapters = createTripResponseAdapters()
const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)
const FILTROS = new URL(
  '../../src/modules/trip/components/TripFilters.component.tsx',
  import.meta.url,
)

function buildDetail(documentExtra: Readonly<Record<string, unknown>> = {}) {
  return {
    amounts: null,
    companyId: 'ce523659-5e30-4b13-96ce-8d603d8cb9e9',
    createdAt: '2026-09-16T16:16:57.548Z',
    documents: [
      {
        createdAt: '2026-09-16T16:16:57.548Z',
        cteAuthorized: false,
        deliveredAt: null,
        destinationOrigin: 'recipient',
        fiscalStatus: 'pending',
        freightCalculationId: null,
        id: 'd1',
        loadedAt: null,
        nfeDocumentId: 'n1',
        releasedAt: null,
        returnReason: null,
        returnedAt: null,
        separatedAt: null,
        separationStatus: 'delivered',
        stopId: 's1',
        tripId: 't1',
        updatedAt: '2026-09-16T16:16:57.548Z',
        ...documentExtra,
      },
    ],
    driverNames: [],
    drivers: [],
    estimatedArrivalFrozenAt: null,
    estimatedFinishAt: null,
    id: '66667bb0-1618-417a-96da-f3148da475a3',
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'separating',
    stops: [
      {
        addressKey: '3543402|14076400|2296',
        arrivedAt: null,
        completedAt: null,
        deliveryWindowEnd: null,
        deliveryWindowStart: null,
        documents: [],
        id: 's1',
        label: 'AVENIDA ARMANDO PENTEADO, 61',
        sequence: 1,
      },
    ],
    updatedAt: '2026-09-21T20:05:04.191Z',
    vehicleId: '31c6e233-e079-4691-8674-c9ed9be2d299',
  }
}

describe('selo de canhoto pendente na nota (spec 223 T4.5)', () => {
  it('aceita a nota sem o campo, com true e com false', () => {
    expect(adapters.tripDetailFromApi(buildDetail()).documents[0]?.proofPending).toBeUndefined()
    expect(
      adapters.tripDetailFromApi(buildDetail({ proofPending: true })).documents[0]?.proofPending,
    ).toBe(true)
    expect(
      adapters.tripDetailFromApi(buildDetail({ proofPending: false })).documents[0]?.proofPending,
    ).toBe(false)
  })

  it('descarta proofPending que não é booleano e abre a viagem', () => {
    const detail = adapters.tripDetailFromApi(buildDetail({ proofPending: 'sim' }))
    expect(detail.documents[0]?.proofPending).toBeUndefined()
  })

  it('só marca com true; ausente não marca', () => {
    expect(hasProofPendingMarker({ proofPending: true })).toBe(true)
    expect(hasProofPendingMarker({ proofPending: false })).toBe(false)
    expect(hasProofPendingMarker({})).toBe(false)
  })

  it('a lista de notas desenha o selo a partir do marcador', () => {
    const lista = readFileSync(LISTA, 'utf8')

    expect(lista).toContain('hasProofPendingMarker')
    expect(lista).toContain("t('proofPending.badge')")
  })
})

describe('filtro "com canhoto pendente" na lista de viagens (spec 223 T4.4)', () => {
  const formatDay = (value: string) => value

  it('vira pílula, conta como filtro ativo e se remove', () => {
    const filters = { proofPendingEq: true } as const

    expect(
      describeTripFilterPills({
        describeDriver: (driverId) => driverId,
        describeVehicle: (vehicleId) => vehicleId,
        filters,
        formatDay,
      }).map((pill) => pill.field),
    ).toEqual(['proofPendingEq'])
    expect(countActiveTripFilters(filters)).toBe(1)
    expect(clearTripFilterField({ field: 'proofPendingEq', filters })).not.toHaveProperty(
      'proofPendingEq',
    )
  })

  it('o cliente manda proofPendingEq=true na consulta da lista', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        requests.push(new Request(input, init))
        return Promise.resolve(
          Response.json({
            data: TRIP_PAGE.items,
            page: { nextCursor: TRIP_PAGE.nextCursor },
          }),
        )
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    await client.listTrips({ cursor: null, filters: { proofPendingEq: true }, limit: 25 })

    expect(new URL(requests[0]?.url ?? '').searchParams.get('proofPendingEq')).toBe('true')
  })

  it('o painel de filtros oferece o interruptor', () => {
    expect(readFileSync(FILTROS, 'utf8')).toContain('setProofPendingFilter')
  })
})
