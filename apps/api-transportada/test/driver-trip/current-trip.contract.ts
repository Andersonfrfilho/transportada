/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  findCurrentDriverTrip,
  type CurrentDriverTripPort,
  type DriverTrip,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'

function buildTrip(id: string): DriverTrip {
  return { id, status: 'dispatched', stops: [], vehiclePlate: 'GCQ8E47' }
}

function buildRepository(input: {
  readonly driverId?: string | null
  readonly trips?: readonly DriverTrip[]
}): CurrentDriverTripPort & { readonly asked: Array<Record<string, string>> } {
  const asked: Array<Record<string, string>> = []

  return {
    asked,
    findDriverIdByMembership: async (params) => {
      asked.push(params)
      return input.driverId === undefined ? DRIVER_ID : input.driverId
    },
    listActiveTrips: async (params) => {
      asked.push(params)
      return input.trips ?? []
    },
  }
}

describe('a viagem do motorista é resolvida pelo servidor', () => {
  /** O motorista não passa id: se ele não escolhe, não há o que enumerar (ADR-0045 §2). */
  it('resolve o motorista pelo vínculo do token, não por parâmetro', async () => {
    const repository = buildRepository({ trips: [buildTrip('trip-1')] })

    await findCurrentDriverTrip({ companyId: COMPANY_ID, membershipId: MEMBERSHIP_ID, repository })

    expect(repository.asked[0]).toEqual({ companyId: COMPANY_ID, membershipId: MEMBERSHIP_ID })
    expect(repository.asked[1]).toEqual({ companyId: COMPANY_ID, driverId: DRIVER_ID })
  })

  /** Não ter viagem hoje é rotina; 404 na primeira tela do dia lê-se como produto quebrado. */
  it('motorista sem viagem ativa recebe lista vazia, e não um erro', async () => {
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      repository: buildRepository({ trips: [] }),
    })

    expect(result).toEqual({ isRegisteredDriver: true, trips: [] })
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
      repository,
    })

    expect(result).toEqual({ isRegisteredDriver: false, trips: [] })
    // E não pergunta por viagem de um motorista que não existe
    expect(repository.asked).toHaveLength(1)
  })

  /** Dois veículos, dois dias: a 056 não impede, e quem escolhe é o motorista. */
  it('devolve as duas viagens quando há duas despachadas', async () => {
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      repository: buildRepository({ trips: [buildTrip('trip-1'), buildTrip('trip-2')] }),
    })

    expect(result.trips.map((trip) => trip.id)).toEqual(['trip-1', 'trip-2'])
  })
})
