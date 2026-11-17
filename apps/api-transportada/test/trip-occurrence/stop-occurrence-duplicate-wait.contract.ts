/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 (D10): o tipo com espera mínima não se duplica na parada — a do escritório, a do motorista e a da fila que
 * já chegou contam. Lido na transação do registro, antes de qualquer escrita.
 */
import { describe, expect, test } from 'bun:test'

import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const WAIT_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const PLAIN_TYPE_ID = '00000000-0000-4000-8000-0000000000e2'
const NOW = new Date('2026-11-17T20:00:00.000Z')

function buildWorld(openKeys: readonly string[]) {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: new Date(NOW.getTime() - 60 * 60_000),
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  const requirements = {
    arrivalTimeMode: 'off',
    attachmentMode: 'off',
    locationMode: 'off',
    noteMode: 'off',
    photoMinimumCount: 1,
  } as const
  state.stopOccurrenceTypes.set(`${COMPANY_ID}:${WAIT_TYPE_ID}`, {
    requirements: { ...requirements, minWaitAfterArrivalMinutes: 30 },
    stopKind: 'other',
  })
  state.stopOccurrenceTypes.set(`${COMPANY_ID}:${PLAIN_TYPE_ID}`, {
    requirements: { ...requirements, minWaitAfterArrivalMinutes: null },
    stopKind: 'other',
  })
  for (const key of openKeys) state.openStopOccurrenceTypes.add(key)
  return { state, unitOfWork: createFieldReportUnitOfWork(state) }
}

function register(input: {
  readonly key: string
  readonly typeId: string
  readonly unitOfWork: ReturnType<typeof buildWorld>['unitOfWork']
}) {
  return reportStopOccurrence({
    actorUserId: ACTOR_USER_ID,
    attachmentObjectId: null,
    companyId: COMPANY_ID,
    description: '',
    distanceMeters: null,
    documentId: null,
    driverId: DRIVER_ID,
    idempotencyKey: input.key,
    location: null,
    now: NOW,
    occurrenceTypeId: input.typeId,
    stopId: STOP_ID,
    unitOfWork: input.unitOfWork,
  })
}

describe('a espera mínima não se duplica na parada (spec 315 D10)', () => {
  test('com uma aberta do mesmo tipo, recusa 409 e não grava nada', async () => {
    const { state, unitOfWork } = buildWorld([`${STOP_ID}:${WAIT_TYPE_ID}`])

    await expect(register({ key: 'k1', typeId: WAIT_TYPE_ID, unitOfWork })).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_ALREADY_OPEN_FOR_TYPE',
      status: 409,
    })
    expect(state.recordedOccurrenceTypeIds).toEqual([])
  })

  test('sem outra aberta, registra normalmente', async () => {
    const { state, unitOfWork } = buildWorld([])

    await register({ key: 'k2', typeId: WAIT_TYPE_ID, unitOfWork })

    expect(state.recordedOccurrenceTypeIds).toEqual([WAIT_TYPE_ID])
  })

  test('tipo sem espera mínima não é barrado, mesmo com outra aberta', async () => {
    const { state, unitOfWork } = buildWorld([`${STOP_ID}:${PLAIN_TYPE_ID}`])

    await register({ key: 'k3', typeId: PLAIN_TYPE_ID, unitOfWork })

    expect(state.recordedOccurrenceTypeIds).toEqual([PLAIN_TYPE_ID])
  })
})
