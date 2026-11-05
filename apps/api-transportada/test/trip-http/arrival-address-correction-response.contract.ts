/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T5.2 (RF14): a resposta do "Cheguei" do motorista leva o que a chegada fez pelo endereço
 * (`addressCorrection`); sem ponto (ou no reenvio) o campo não existe.
 */
import { describe, expect, test } from 'bun:test'

import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { findRoute, send } from '../fixtures/driver-route-request.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function buildRoutes(result: Record<string, unknown>) {
  return createMeTripRoutes({
    attachProof: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: NOT_CALLED,
    findCurrentTrip: NOT_CALLED,
    listFieldOccurrenceTypes: NOT_CALLED,
    readDeliveryProofs: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: async () => result,
    reportDeparture: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveDriverId: async () => DRIVER_ID,
    startFieldTrip: NOT_CALLED,
  } as never)
}

async function arrive(result: Record<string, unknown>) {
  const response = await send({
    body: {},
    pathParameters: { stopId: STOP_ID },
    route: findRoute(buildRoutes(result), '/me/trips/current/stops/:stopId/arrive'),
  })
  return { body: (await response.json()) as { data: Record<string, unknown> }, response }
}

describe('a resposta do Cheguei devolve a correção do endereço (T5.2)', () => {
  test.each(['applied', 'suggested', 'ignored', 'failed'])(
    'devolve addressCorrection "%s"',
    async (addressCorrection) => {
      const { body, response } = await arrive({
        addressCorrection,
        id: 'event-1',
        recordedTogether: ['departed'],
      })
      expect(response.status).toBe(201)
      expect(body.data).toEqual({
        addressCorrection,
        id: 'event-1',
        recordedTogether: ['departed'],
      })
    },
  )

  test('sem ponto, o campo não existe', async () => {
    const { body } = await arrive({ id: 'event-1', recordedTogether: [] })
    expect(body.data).toEqual({ id: 'event-1', recordedTogether: [] })
  })
})
