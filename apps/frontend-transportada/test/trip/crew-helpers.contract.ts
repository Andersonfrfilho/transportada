/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 T13 (recorte da tela): o operador adiciona, troca e remove ajudantes — na criação rápida e
 * na troca de tripulação. A API faz a regra (papel, posição, elegibilidade); a tela só oferece quem
 * pode ajudar, pré-preenche o que a viagem já tem e manda a lista inteira.
 */
import { describe, expect, it, test } from 'bun:test'

import {
  listHelperCandidates,
  readTripHelperIds,
  withoutSelectedDrivers,
} from '@/modules/trip/shared/tripCrewHelpers.service'
import {
  buildChangeTripCrewInput,
  resolveCrewDialogErrorKey,
} from '@/modules/trip/shared/tripCrewDialog.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import { validateQuickCreate } from '@/modules/trip/shared/tripQuickCreate.service'
import type { TripDetail } from '@/modules/trip/shared/trip.types'

import { SYNTHETIC_ACCESS_TOKEN, TRIP_DETAIL, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'

function driver(input: { canActAsHelper: boolean; id: string; status?: string }) {
  return { canActAsHelper: input.canActAsHelper, id: input.id, status: input.status ?? 'active' }
}

function tripWithCrew(
  lines: readonly { driverId: string; position: number; role?: 'driver' | 'helper' }[],
): TripDetail {
  return {
    ...TRIP_DETAIL,
    drivers: lines.map((line) => ({
      driverId: line.driverId,
      driverName: line.driverId,
      driverTaxId: null,
      position: line.position,
      ...(line.role === undefined ? {} : { role: line.role }),
    })),
  }
}

describe('quem a tela oferece como ajudante', () => {
  const drivers = [
    driver({ canActAsHelper: true, id: 'helper-ok' }),
    driver({ canActAsHelper: false, id: 'only-driver' }),
    driver({ canActAsHelper: true, id: 'inactive', status: 'inactive' }),
    driver({ canActAsHelper: true, id: 'already-driving' }),
  ]

  it('só motorista ativo que pode atuar como ajudante, fora de quem já dirige', () => {
    const candidates = listHelperCandidates({
      currentHelperIds: [],
      driverIds: ['already-driving'],
      drivers,
    })

    expect(candidates.map((candidate) => candidate.id)).toEqual(['helper-ok'])
  })

  /** Quem já é ajudante da viagem tem de poder ser retirado, mesmo que a ficha tenha mudado depois. */
  it('mantém o ajudante atual da viagem mesmo sem a marca na ficha', () => {
    const candidates = listHelperCandidates({
      currentHelperIds: ['only-driver'],
      driverIds: [],
      drivers,
    })

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'helper-ok',
      'only-driver',
      'already-driving',
    ])
  })
})

describe('os ajudantes que a viagem já tem', () => {
  it('lê só o papel helper, na ordem da tripulação', () => {
    const trip = tripWithCrew([
      { driverId: 'helper-b', position: 3, role: 'helper' },
      { driverId: 'driver-a', position: 1, role: 'driver' },
      { driverId: 'helper-a', position: 2, role: 'helper' },
    ])

    expect(readTripHelperIds(trip)).toEqual(['helper-a', 'helper-b'])
  })

  /** Spec 078 D2: API antiga não manda `role`, e a ausência é motorista. */
  it('linha sem papel é motorista, nunca ajudante', () => {
    expect(readTripHelperIds(tripWithCrew([{ driverId: 'driver-a', position: 1 }]))).toEqual([])
  })

  it('quem passa a dirigir sai da lista de ajudantes', () => {
    expect(withoutSelectedDrivers({ driverIds: ['b'], helperIds: ['a', 'b', 'c'] })).toEqual([
      'a',
      'c',
    ])
  })
})

describe('o corpo da troca de tripulação leva os ajudantes', () => {
  it('manda helperIds junto de driverIds e do veículo', () => {
    expect(
      buildChangeTripCrewInput({
        driverIds: ['driver-1'],
        helperIds: ['helper-1'],
        tripId: 'trip-1',
        vehicleId: 'vehicle-1',
      }),
    ).toEqual({
      driverIds: ['driver-1'],
      helperIds: ['helper-1'],
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
    })
  })

  /** Remover o último ajudante é mandar a lista vazia — omitir apagaria igual, mas no escuro. */
  it('sem ajudantes manda a lista vazia', () => {
    const input = buildChangeTripCrewInput({
      driverIds: ['driver-1'],
      helperIds: [],
      tripId: 'trip-1',
      vehicleId: '',
    })

    expect(input.helperIds).toEqual([])
  })

  it('nomeia as duas recusas da tripulação em vez de dizer "tente de novo"', () => {
    expect(resolveCrewDialogErrorKey(new Error('TRIP_CREW_HELPER_WITHOUT_DRIVER'))).toBe(
      'helperWithoutDriver',
    )
    expect(resolveCrewDialogErrorKey(new Error('TRIP_CREW_HELPER_NOT_ELIGIBLE'))).toBe(
      'helperNotEligible',
    )
  })
})

describe('a criação rápida valida o ajudante', () => {
  const base = {
    dailyAllowanceDays: { of: 'absent' },
    queue: [],
    vehicleId: 'vehicle-1',
  } as const

  it('ajudante sem motorista não passa, nem como rascunho', () => {
    for (const path of ['draft', 'singleClick'] as const) {
      expect(
        validateQuickCreate({ ...base, driverIds: [], helperIds: ['helper-1'], path }),
      ).toContain('helperWithoutDriver')
    }
  })

  it('ajudante com motorista não acrescenta pendência', () => {
    expect(
      validateQuickCreate({
        ...base,
        driverIds: ['driver-1'],
        helperIds: ['helper-1'],
        path: 'draft',
      }),
    ).not.toContain('helperWithoutDriver')
  })
})

describe('o cliente HTTP da viagem leva os ajudantes', () => {
  async function recordBodies(
    run: (client: ReturnType<typeof createTripClient>) => Promise<unknown>,
  ): Promise<Record<string, unknown>> {
    const bodies: Record<string, unknown>[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        bodies.push((await request.json()) as Record<string, unknown>)
        return Response.json({ data: TRIP_DETAIL })
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })
    await run(client)
    return bodies[0] ?? {}
  }

  test('createTrip manda helperIds só quando há ajudante', async () => {
    const withHelper = await recordBodies((client) =>
      client.createTrip({ driverIds: ['driver-1'], helperIds: ['helper-1'], vehicleId: 'v-1' }),
    )
    const without = await recordBodies((client) =>
      client.createTrip({ driverIds: ['driver-1'], helperIds: [], vehicleId: 'v-1' }),
    )

    expect(withHelper.helperIds).toEqual(['helper-1'])
    expect('helperIds' in without).toBe(false)
  })

  test('changeTripCrew manda helperIds, inclusive a lista vazia que remove todos', async () => {
    const body = await recordBodies((client) =>
      client.changeTripCrew({ driverIds: ['driver-1'], helperIds: [], tripId: TRIP_ID }),
    )

    expect(body.helperIds).toEqual([])
  })
})
