/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 (ADR-0065) / ADR-0058 §4: conferir a carga e iniciar o trajeto são gestos do motorista.
 * O ajudante da mesma tripulação tem viagem ativa, mas não o papel para os dois toques.
 */
import { describe, expect, it } from 'bun:test'

import {
  FIELD_TRIP_STEP,
  startFieldTrip,
  type StartFieldTripPort,
} from '../../src/trips/application/start-field-trip.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'

function buildRepository(
  current: {
    readonly role: 'driver' | 'helper'
    readonly tripId: string
    readonly tripStatus: 'dispatched'
  } | null,
): StartFieldTripPort & { readonly updateCalls: object[] } {
  const updateCalls: object[] = []
  return {
    updateCalls,
    readCurrent: () => Promise.resolve(current),
    updateStatus: (input) => {
      updateCalls.push(input)
      return Promise.resolve()
    },
  }
}

describe('os toques do campo (ADR-0058)', () => {
  it('sem viagem ativa é 404, TRIP_NOT_FOUND', async () => {
    const repository = buildRepository(null)

    const error = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      repository,
      step: FIELD_TRIP_STEP.confirmLoad,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_NOT_FOUND')
    expect(repository.updateCalls).toHaveLength(0)
  })

  // Critério de aceite 3: o ajudante vinculado à viagem não confere carga nem inicia o trajeto.
  it.each([FIELD_TRIP_STEP.confirmLoad, FIELD_TRIP_STEP.startRoute] as const)(
    'ajudante da mesma tripulação não pode %s',
    async (step) => {
      const repository = buildRepository({
        role: 'helper',
        tripId: TRIP_ID,
        tripStatus: 'dispatched',
      })

      const error = await startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        repository,
        step,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('TRIP_CREW_HELPER_CANNOT_DRIVE')
      expect((error as ApiError).status).toBe(403)
      expect(repository.updateCalls).toHaveLength(0)
    },
  )

  it('motorista confere a carga normalmente (regressão)', async () => {
    const repository = buildRepository({
      role: 'driver',
      tripId: TRIP_ID,
      tripStatus: 'dispatched',
    })

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      repository,
      step: FIELD_TRIP_STEP.confirmLoad,
    })

    expect(result.changed).toBe(true)
    expect(repository.updateCalls).toHaveLength(1)
  })
})
