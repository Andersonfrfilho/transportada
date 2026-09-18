/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T3 (ressalva R1): o caminho do motorista nos dois toques do campo, preso **antes** de o
 * caso de uso aprender o alvo do escritório. Ele tem que continuar verde depois da refatoração, sem
 * edição: é a prova de que o PWA não mudou.
 */
import { describe, expect, it } from 'bun:test'

import type { TripStatus } from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'

function buildRepository(current: { readonly tripStatus: TripStatus } | null) {
  const readCurrentCalls: unknown[] = []
  const updates: { readonly tripId: string; readonly tripStatus: TripStatus }[] = []

  return {
    readCurrentCalls,
    repository: {
      async readCurrent(input: { readonly companyId: string; readonly driverId: string }) {
        readCurrentCalls.push(input)
        return current === null ? null : { tripId: TRIP_ID, tripStatus: current.tripStatus }
      },
      async readStatus() {
        return current?.tripStatus ?? null
      },
      async updateStatus(input: { readonly tripId: string; readonly tripStatus: TripStatus }) {
        updates.push({ tripId: input.tripId, tripStatus: input.tripStatus })
        return true
      },
    },
    updates,
  }
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
  }
}

describe('os dois toques do campo pelo motorista (spec 156 T3, R1)', () => {
  it('lê a viagem atual pelo motorista, com a empresa do contexto', async () => {
    const world = buildRepository({ tripStatus: 'dispatched' })

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      repository: world.repository,
      step: 'confirmLoad',
    })

    expect(world.readCurrentCalls).toEqual([{ companyId: COMPANY_ID, driverId: DRIVER_ID }])
    expect(result).toEqual({ changed: true, tripId: TRIP_ID, tripStatus: 'in_transit' })
    expect(world.updates).toEqual([{ tripId: TRIP_ID, tripStatus: 'in_transit' }])
  })

  it('o toque repetido converge em changed: false, sem gravar', async () => {
    const world = buildRepository({ tripStatus: 'in_transit' })

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      repository: world.repository,
      step: 'confirmLoad',
    })

    expect(result).toEqual({ changed: false, tripId: TRIP_ID, tripStatus: 'in_transit' })
    expect(world.updates).toEqual([])
  })

  it('motorista sem viagem na rua responde TRIP_NOT_FOUND', async () => {
    const world = buildRepository(null)

    await expectApiError(
      startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        repository: world.repository,
        step: 'startRoute',
      }),
      'TRIP_NOT_FOUND',
    )
    expect(world.updates).toEqual([])
  })
})
