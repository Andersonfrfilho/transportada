/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_TRIP_BODY,
  CREATE_TRIP_MDFE_MANIFEST_BODY,
  jsonRequest,
  LINK_NFE_DOCUMENT_BODY,
  responseApiError,
  tripClosePath,
  tripDocumentDeliverPath,
  tripDocumentPath,
  tripMdfeManifestsPath,
  TRIPS_PATH,
  TRIP_ID,
} from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture, NO_PERMISSIONS } from '../fixtures/trip-http.fixture'

const TRIP_DOCUMENTS_PATH = `${TRIPS_PATH}/${TRIP_ID}/documents`

/**
 * spec.md § Dúvidas: `fleet.manage` cobre a superfície de mutação de viagens; a criação de
 * manifesto a partir de uma viagem (T009) delega ao use-case de mdfe-manifests e exige
 * `mdfe.manage`. A leitura (`GET /trips`, `GET /trips/:id`) tem seu próprio split para
 * `fleet.read` — coberto em `list.contract.ts`/`detail.contract.ts` (T009b).
 */
describe('trip http security contract', () => {
  test('requires fleet.manage/mdfe.manage for every mutation route', async () => {
    const fixture = await createTripHttpFixture({ permissions: NO_PERMISSIONS })

    const createResponse = await fixture.handle(
      jsonRequest({ body: CREATE_TRIP_BODY, method: 'POST', path: TRIPS_PATH }),
    )
    const linkResponse = await fixture.handle(
      jsonRequest({ body: LINK_NFE_DOCUMENT_BODY, method: 'POST', path: TRIP_DOCUMENTS_PATH }),
    )
    const deliverResponse = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentDeliverPath() }),
    )
    const releaseResponse = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: tripDocumentPath() }),
    )
    const closeResponse = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripClosePath() }),
    )
    const mdfeManifestResponse = await fixture.handle(
      jsonRequest({
        body: CREATE_TRIP_MDFE_MANIFEST_BODY,
        method: 'POST',
        path: tripMdfeManifestsPath(),
      }),
    )

    expect(createResponse.status).toBe(403)
    expect(linkResponse.status).toBe(403)
    expect(deliverResponse.status).toBe(403)
    expect(releaseResponse.status).toBe(403)
    expect(closeResponse.status).toBe(403)
    expect(mdfeManifestResponse.status).toBe(403)
    expect((await responseApiError(createResponse)).code).toBe('FORBIDDEN')
    expect(fixture.createTripCalls).toEqual([])
    expect(fixture.linkTripDocumentCalls).toEqual([])
    expect(fixture.deliverTripDocumentCalls).toEqual([])
    expect(fixture.releaseTripDocumentCalls).toEqual([])
    expect(fixture.closeTripCalls).toEqual([])
    expect(fixture.createTripMdfeManifestCalls).toEqual([])
  })

  test('refuses a body carrying a field the contract does not declare', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, notes: 'observação livre' },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createTripCalls).toEqual([])
  })
})
