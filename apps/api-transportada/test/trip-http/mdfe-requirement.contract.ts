/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseData,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

const PATH = `${TRIPS_PATH}/${TRIP_ID}/mdfe-requirement`

describe('a exigência de MDF-e da viagem, pela rota', () => {
  test('grava a dispensa com o motivo e o autor do token', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { reason: 'frota própria, carga retorna hoje', requiresMdfe: false },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ requiresMdfe: false })
    expect(fixture.setMdfeRequirementCalls).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        reason: 'frota própria, carga retorna hoje',
        requiresMdfe: false,
        tripId: TRIP_ID,
      },
    ])
  })

  /** `null` é um dos três estados, não ausência: voltar ao derivado é comando, não omissão. */
  test('aceita null como valor e o repassa sem virar undefined', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { requiresMdfe: null }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(fixture.setMdfeRequirementCalls[0]).toMatchObject({
      reason: null,
      requiresMdfe: null,
    })
  })

  test('recusa o corpo sem o campo, em vez de adivinhar o estado', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { reason: 'sem o campo' }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.setMdfeRequirementCalls).toEqual([])
  })

  /**
   * Dispensar manifesto é decisão fiscal com multa do outro lado: quem só gerencia viagem não
   * alcança. É `mdfe.manage`, a mesma permissão que emite.
   */
  test('exige mdfe.manage, não trip.manage', async () => {
    const fixture = await createTripHttpFixture({
      permissions: new Set(['trip.manage', 'fleet.read']),
    })

    const response = await fixture.handle(
      jsonRequest({ body: { requiresMdfe: null }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.setMdfeRequirementCalls).toEqual([])
  })
})
