/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { MdfeManifestDocumentsBlockedError } from '../../src/mdfe-manifests/domain/mdfe-manifest.error.js'
import {
  CREATE_TRIP_MDFE_MANIFEST_BODY,
  DRIVER_ID,
  jsonRequest,
  MDFE_MANIFEST_ID,
  responseApiError,
  responseData,
  SECOND_DRIVER_ID,
  TRIP_ID,
  tripMdfeManifestsPath,
  VEHICLE_ID,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

describe('trip mdfe-manifest creation http contract', () => {
  // plan.md: substitui a criação direta, delegando ao use-case existente com tripId/vehicleId/driverIds da viagem
  test('creates a manifest from the trip, resolving crew and vehicle from it', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: CREATE_TRIP_MDFE_MANIFEST_BODY,
        method: 'POST',
        path: tripMdfeManifestsPath(),
      }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toMatchObject({
      id: MDFE_MANIFEST_ID,
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
    })
    expect(fixture.createTripMdfeManifestCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'trip-http-correlation',
        manifest: {
          additionalInformation: '',
          cargoProduct: '',
          cargoProductNcm: '',
          cargoType: '',
          cargoUnit: '01',
          contractorName: '',
          contractorTaxId: '',
          destinationState: '',
          dischargePostalCode: '',
          emitterType: '1',
          freightValue: '0.00',
          insuranceEndorsement: '',
          loadingPostalCode: '',
          transporterType: '',
          tripStartedAt: null,
        },
        tripId: TRIP_ID,
      },
    ])
  })

  // spec.md: nota sem CT-e associado deve recusar — igual à criação direta de manifesto
  test('refuses when the selected note has no CT-e, like the direct creation route', async () => {
    const fixture = await createTripHttpFixture({
      createTripMdfeManifestError: new MdfeManifestDocumentsBlockedError([{ reason: 'no_cte' }]),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: CREATE_TRIP_MDFE_MANIFEST_BODY,
        method: 'POST',
        path: tripMdfeManifestsPath(),
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_DOCUMENTS_BLOCKED')
  })

  test('rejects a body carrying driverIds or vehicleId — those come from the trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_MDFE_MANIFEST_BODY, driverIds: [DRIVER_ID, SECOND_DRIVER_ID] },
        method: 'POST',
        path: tripMdfeManifestsPath(),
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createTripMdfeManifestCalls).toEqual([])
  })
})
