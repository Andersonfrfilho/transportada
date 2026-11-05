/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T3.1: só a chegada da tripulação com localização chama a correção de endereço; a do
 * escritório e a sem localização não chamam.
 */
import { describe, expect, it } from 'bun:test'

import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const NOW = new Date('2026-09-18T13:00:00.000Z')
const LOCATION = {
  accuracyMeters: '8',
  capturedAt: NOW.toISOString(),
  latitude: '-23.5500000',
  longitude: '-46.6300000',
}

function buildWorld() {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })

  return { state, unitOfWork: createFieldReportUnitOfWork(state) }
}

function correctionCalls(calls: readonly string[]): readonly string[] {
  return calls.filter((call) => call.startsWith('correctAddressFromArrival:'))
}

describe('a chegada chama a correção de endereço (spec 294 T3.1)', () => {
  it('tripulação com localização: chama uma vez, com o evento da chegada', async () => {
    const { state, unitOfWork } = buildWorld()

    const result = await reportStopArrival({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'crew-arrival',
      location: LOCATION,
      now: NOW,
      stopId: STOP_ID,
      unitOfWork,
    })

    expect(correctionCalls(state.calls)).toEqual([`correctAddressFromArrival:${result.id}`])
  })

  it('tripulação sem localização: não chama', async () => {
    const { state, unitOfWork } = buildWorld()

    await reportStopArrival({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'crew-arrival-no-location',
      location: null,
      now: NOW,
      stopId: STOP_ID,
      unitOfWork,
    })

    expect(correctionCalls(state.calls)).toEqual([])
  })

  it('escritório, mesmo com localização: não chama', async () => {
    const { state, unitOfWork } = buildWorld()

    await reportStopArrival({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      idempotencyKey: 'office-arrival',
      location: LOCATION,
      now: NOW,
      stopId: STOP_ID,
      target: await resolveFieldTripTarget({
        companyId: COMPANY_ID,
        repository: {
          findTripCrew: async () => ({
            drivers: [{ driverId: DRIVER_ID, position: 1 }],
            tripId: TRIP_ID,
            tripStatus: 'in_transit',
          }),
        },
        target: { kind: 'trip', tripId: TRIP_ID },
      }),
      unitOfWork,
    })

    expect(correctionCalls(state.calls)).toEqual([])
  })
})
