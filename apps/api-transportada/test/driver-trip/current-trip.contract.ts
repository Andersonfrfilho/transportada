/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  findCurrentDriverTrip,
  type CurrentDriverTripPort,
  type DriverPendingProof,
  type DriverTrip,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const NOW = new Date('2026-09-18T12:00:00.000Z')

/** Porta da nota sem histórico nenhum: o motorista existe, mas nada pesou ainda. */
const NO_SCORES = { readScores: async () => new Map<string, number | null>() }

function buildTrip(id: string): DriverTrip {
  return { id, manifest: null, status: 'dispatched', stops: [], vehiclePlate: 'GCQ8E47' }
}

function buildRepository(input: {
  readonly driverId?: string | null
  readonly pendingProofs?: readonly DriverPendingProof[]
  readonly trips?: readonly DriverTrip[]
}): CurrentDriverTripPort & {
  readonly asked: Array<Record<string, string>>
  readonly askedPending: Array<Record<string, unknown>>
} {
  const asked: Array<Record<string, string>> = []
  const askedPending: Array<Record<string, unknown>> = []

  return {
    asked,
    askedPending,
    findDriverIdByMembership: async (params) => {
      asked.push(params)
      return input.driverId === undefined ? DRIVER_ID : input.driverId
    },
    listActiveTrips: async (params) => {
      asked.push(params)
      return input.trips ?? []
    },
    listPendingProofs: async (params) => {
      askedPending.push(params)
      return input.pendingProofs ?? []
    },
  }
}

const PENDING_PROOF: DriverPendingProof = {
  deliveredAt: '2026-09-17T15:00:00.000Z',
  deliveryProof: {
    photo: 'required',
    receivedBy: 'optional',
    receiverDocument: 'off',
    receiverName: 'optional',
    signature: 'optional',
  },
  documentId: 'trip-document-1',
  documentNumber: '1234',
  documentSeries: '1',
  recipientDisplayName: 'Destinatario',
  recipientIsCompany: false,
  recipientName: 'Destinatario',
  tripId: 'trip-completed',
  tripStatus: 'completed',
}

describe('a viagem do motorista é resolvida pelo servidor', () => {
  /** O motorista não passa id: se ele não escolhe, não há o que enumerar (ADR-0045 §2). */
  it('resolve o motorista pelo vínculo do token, não por parâmetro', async () => {
    const repository = buildRepository({ trips: [buildTrip('trip-1')] })

    await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository,
      scores: NO_SCORES,
    })

    expect(repository.asked[0]).toEqual({ companyId: COMPANY_ID, membershipId: MEMBERSHIP_ID })
    expect(repository.asked[1]).toEqual({ companyId: COMPANY_ID, driverId: DRIVER_ID })
  })

  /** Não ter viagem hoje é rotina; 404 na primeira tela do dia lê-se como produto quebrado. */
  it('motorista sem viagem ativa recebe lista vazia, e não um erro', async () => {
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      scores: NO_SCORES,
      repository: buildRepository({ trips: [] }),
    })

    expect(result).toEqual({
      isRegisteredDriver: true,
      pendingProofs: [],
      score: null,
      trips: [],
    })
  })

  /**
   * Conta sem cadastro de motorista e motorista sem viagem hoje são problemas diferentes, e a tela
   * precisa dizer coisas diferentes. Sem esta distinção o segundo caso esconde o primeiro, e o
   * motorista fica esperando uma viagem que ninguém vai conseguir lhe atribuir.
   */
  it('conta sem cadastro de motorista se distingue de motorista sem viagem', async () => {
    const repository = buildRepository({ driverId: null })

    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      scores: NO_SCORES,
      repository,
    })

    expect(result).toEqual({
      isRegisteredDriver: false,
      pendingProofs: [],
      score: null,
      trips: [],
    })
    // E não pergunta por viagem de um motorista que não existe
    expect(repository.asked).toHaveLength(1)
  })

  /**
   * Spec 159 T11 (ALTO 1): a última entrega conclui a viagem, ela sai de `trips`, e a foto pendente
   * precisa continuar alcançável — o bloco `pendingProofs` vem na raiz, inclusive sem viagem ativa.
   */
  it('devolve as fotos pendentes do motorista mesmo sem viagem ativa', async () => {
    const repository = buildRepository({ pendingProofs: [PENDING_PROOF], trips: [] })

    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository,
      scores: NO_SCORES,
    })

    expect(result.trips).toEqual([])
    expect(result.pendingProofs).toEqual([PENDING_PROOF])
    expect(repository.askedPending).toEqual([
      { companyId: COMPANY_ID, driverId: DRIVER_ID, now: NOW },
    ])
  })

  it('conta sem cadastro de motorista não pergunta pelas fotos pendentes', async () => {
    const repository = buildRepository({ driverId: null, pendingProofs: [PENDING_PROOF] })

    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository,
      scores: NO_SCORES,
    })

    expect(result.pendingProofs).toEqual([])
    expect(repository.askedPending).toEqual([])
  })

  /** Dois veículos, dois dias: a 056 não impede, e quem escolhe é o motorista. */
  it('devolve as duas viagens quando há duas despachadas', async () => {
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      scores: NO_SCORES,
      repository: buildRepository({ trips: [buildTrip('trip-1'), buildTrip('trip-2')] }),
    })

    expect(result.trips.map((trip) => trip.id)).toEqual(['trip-1', 'trip-2'])
  })

  /**
   * Spec 159 T6, ADR-0070 §1: `proofPending` é calculado pelo repositório (SQL contra o evento de
   * entrega — ver `test/integration/me-trip.integration.ts`); o caso de uso só repassa o documento
   * como o repositório o devolveu, sem tocar no campo.
   */
  it('repassa proofPending do documento sem recalcular nada', async () => {
    const repository = buildRepository({
      trips: [
        {
          id: 'trip-1',
          manifest: null,
          status: 'dispatched',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              deliveryWindowEnd: null,
              deliveryWindowStart: null,
              enRouteSince: null,
              enRouteTappedAt: null,
              documents: [
                {
                  accessKey: '',
                  deliveredAt: '2026-09-18T12:00:00.000Z',
                  deliveryProof: {
                    photo: 'required',
                    receivedBy: 'optional',
                    receiverDocument: 'off',
                    receiverName: 'optional',
                    signature: 'optional',
                  },
                  grossWeight: '0',
                  id: 'document-1',
                  number: '1',
                  proofPending: true,
                  recipientDisplayName: 'Destinatario 1',
                  recipientIsCompany: false,
                  recipientName: 'Destinatario 1',
                  returnReason: null,
                  separationStatus: 'delivered',
                  series: '1',
                  totalAmount: '0',
                  volumeCount: '0',
                },
              ],
              id: 'stop-1',
              label: 'Centro, 100',
              latitude: null,
              longitude: null,
              schedule: null,
              sequence: 1,
            },
          ],
          vehiclePlate: 'GCQ8E47',
        },
      ],
    })

    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      scores: NO_SCORES,
      repository,
    })

    expect(result.trips[0]?.stops[0]?.documents[0]?.proofPending).toBe(true)
  })

  /**
   * Spec 159 RF2, ADR-0070 §6: a nota do motorista logado sobe na raiz do snapshot. O caso de uso
   * pergunta só pelo motorista resolvido do vínculo, com o relógio injetado — nunca por id vindo de
   * fora (ADR-0045 §2).
   */
  it('devolve a nota do próprio motorista, perguntada pelo id resolvido do vínculo', async () => {
    const asked: unknown[] = []
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository: buildRepository({ trips: [] }),
      scores: {
        readScores: async (params) => {
          asked.push(params)
          return new Map([[DRIVER_ID, 85]])
        },
      },
    })

    expect(result.score).toBe(85)
    expect(asked).toEqual([{ companyId: COMPANY_ID, driverIds: [DRIVER_ID], now: NOW }])
  })

  it('conta sem cadastro de motorista não pergunta pela nota', async () => {
    const asked: unknown[] = []
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository: buildRepository({ driverId: null }),
      scores: {
        readScores: async (params) => {
          asked.push(params)
          return new Map()
        },
      },
    })

    expect(result.score).toBeNull()
    expect(asked).toHaveLength(0)
  })
})
