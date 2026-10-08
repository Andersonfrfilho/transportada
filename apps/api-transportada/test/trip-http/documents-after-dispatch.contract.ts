/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 T1.4: `POST /v1/trips/:id/documents/after-dispatch` — a fronteira: permissão, corpo estrito,
 * o recorte exato do resumo e o mapa de erros. A janela de status é do caso de uso e do repositório.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyRole } from '../../src/database/database.schema.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import {
  TripDocumentNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import {
  CORRELATION_ID,
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_DETAIL,
  TRIP_ID,
  tripDetailPath,
  tripDocumentsAfterDispatchPath,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

function permissionsOf(role: CompanyRole) {
  return new Set(resolveCompanyPermissions([role]))
}

const REASON = 'Van quebrou na estrada, a outra vai socorrer'
const NOTE_ID = '00000000-0000-4000-8000-000000000d01'
const LINK_KEYS = [
  'createdStopIds',
  'documentsWithoutCte',
  'eventId',
  'linked',
  'mdfeDocumentDivergence',
  'skipped',
]

function linkRequest(body: unknown = { nfeDocumentIds: [NOTE_ID], reason: REASON }) {
  return jsonRequest({ body, method: 'POST', path: tripDocumentsAfterDispatchPath() })
}

describe('trip documents after dispatch http contract', () => {
  test('responde 201 com a viagem e o resumo, e nada além deles', async () => {
    const fixture = await createTripHttpFixture({
      getTripResult: { ...TRIP_DETAIL, status: 'in_transit' },
      linkTripDocumentsAfterDispatchResult: {
        link: {
          actorUserId: '00000000-0000-4000-8000-000000000001',
          createdStopIds: [],
          documentsWithoutCte: 2,
          eventId: '00000000-0000-4000-8000-000000000c01',
          linked: [
            {
              internalField: 'nunca',
              nfeDocumentId: NOTE_ID,
              stopId: '00000000-0000-4000-8000-000000000e01',
              tripDocumentId: '00000000-0000-4000-8000-000000000f01',
            },
          ],
          mdfeDocumentDivergence: true,
          skipped: [{ nfeDocumentId: 'outra', reason: 'already_linked' }],
          tripStatus: 'in_transit',
        },
        trip: { ...TRIP_DETAIL, status: 'in_transit' },
      },
    })

    const response = await fixture.handle(linkRequest())
    const body = await responseData<{ link: Record<string, unknown>; trip: object }>(response)
    const detail = await responseData(
      await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() })),
    )

    expect(response.status).toBe(201)
    expect(Object.keys(body).sort()).toEqual(['link', 'trip'])
    expect(Object.keys(body.link).sort()).toEqual(LINK_KEYS)
    expect(body.link).toEqual({
      createdStopIds: [],
      documentsWithoutCte: 2,
      eventId: '00000000-0000-4000-8000-000000000c01',
      linked: [
        {
          nfeDocumentId: NOTE_ID,
          stopId: '00000000-0000-4000-8000-000000000e01',
          tripDocumentId: '00000000-0000-4000-8000-000000000f01',
        },
      ],
      mdfeDocumentDivergence: true,
      skipped: [{ nfeDocumentId: 'outra', reason: 'already_linked' }],
    })
    expect(body.trip).toEqual(detail)
  })

  test('entrega ao caso de uso o contexto, a trilha, as notas e o motivo aparado', async () => {
    const fixture = await createTripHttpFixture()

    await fixture.handle(linkRequest({ nfeDocumentIds: [NOTE_ID], reason: `  ${REASON}  ` }))

    expect(fixture.linkTripDocumentsAfterDispatchCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        ipAddress: 'unknown',
        nfeDocumentIds: [NOTE_ID],
        reason: REASON,
        tripId: TRIP_ID,
      },
    ])
  })

  describe('permissão trip.report-on-behalf', () => {
    test.each(['company-admin', 'operator', 'finance'] as const)(
      'o papel %s alcança a rota',
      async (role) => {
        const fixture = await createTripHttpFixture({ permissions: permissionsOf(role) })

        expect((await fixture.handle(linkRequest())).status).toBe(201)
      },
    )

    test.each(['separator', 'viewer'] as const)(
      'o papel %s recebe 403 e nada é executado',
      async (role) => {
        const fixture = await createTripHttpFixture({ permissions: permissionsOf(role) })

        const response = await fixture.handle(linkRequest())

        expect(response.status).toBe(403)
        expect(fixture.linkTripDocumentsAfterDispatchCalls).toEqual([])
      },
    )
  })

  describe('corpo estrito, todos os erros de uma vez', () => {
    async function refusedFields(body: unknown): Promise<readonly string[]> {
      const fixture = await createTripHttpFixture()
      const response = await fixture.handle(linkRequest(body))
      const payload = (await response.json()) as {
        error: { code: string; details?: readonly { field: string }[] }
      }

      expect(response.status).toBe(400)
      expect(payload.error.code).toBe('INVALID_REQUEST')
      expect(fixture.linkTripDocumentsAfterDispatchCalls).toEqual([])
      return (payload.error.details ?? []).map((detail) => detail.field)
    }

    test('notas e motivo inválidos aparecem juntos', async () => {
      const fields = await refusedFields({ nfeDocumentIds: ['not-a-uuid'], reason: '   ' })

      expect(fields).toContain('nfeDocumentIds.0')
      expect(fields).toContain('reason')
    })

    test('lista vazia ou ausente é recusada', async () => {
      expect(await refusedFields({ nfeDocumentIds: [], reason: REASON })).toContain(
        'nfeDocumentIds',
      )
      expect(await refusedFields({ reason: REASON })).toContain('nfeDocumentIds')
    })

    test('mais de 300 notas é recusado; 300 passa', async () => {
      const ids = (count: number) => Array.from({ length: count }, () => crypto.randomUUID())
      expect(await refusedFields({ nfeDocumentIds: ids(301), reason: REASON })).toContain(
        'nfeDocumentIds',
      )

      const fixture = await createTripHttpFixture()
      const response = await fixture.handle(
        linkRequest({ nfeDocumentIds: ids(300), reason: REASON }),
      )
      expect(response.status).toBe(201)
    })

    test('motivo ausente ou com mais de 500 caracteres é recusado; 500 passa', async () => {
      expect(await refusedFields({ nfeDocumentIds: [NOTE_ID] })).toContain('reason')
      expect(await refusedFields({ nfeDocumentIds: [NOTE_ID], reason: 'x'.repeat(501) })).toContain(
        'reason',
      )

      const fixture = await createTripHttpFixture()
      const response = await fixture.handle(
        linkRequest({ nfeDocumentIds: [NOTE_ID], reason: 'x'.repeat(500) }),
      )
      expect(response.status).toBe(201)
    })

    test('campo fora do contrato é recusado', async () => {
      await refusedFields({
        nfeDocumentIds: [NOTE_ID],
        reason: REASON,
        stopId: crypto.randomUUID(),
      })
    })
  })

  describe('mapa de erros', () => {
    test('viagem inexistente ou de outra empresa: 404', async () => {
      const fixture = await createTripHttpFixture({
        linkTripDocumentsAfterDispatchError: new TripNotFoundError(),
      })

      const response = await fixture.handle(linkRequest())

      expect(response.status).toBe(404)
      expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
    })

    test('nota inexistente ou de outra empresa: 404', async () => {
      const fixture = await createTripHttpFixture({
        linkTripDocumentsAfterDispatchError: new TripDocumentNotFoundError(),
      })

      expect((await fixture.handle(linkRequest())).status).toBe(404)
    })

    test.each(['TRIP_CANCELLED', 'TRIP_COMPLETED', 'TRIP_NOT_DISPATCHED'] as const)(
      'fora da janela (%s): 409 STATE_TRANSITION_NOT_ALLOWED',
      async (reason) => {
        const fixture = await createTripHttpFixture({
          linkTripDocumentsAfterDispatchError: new TripStateTransitionNotAllowedError(reason),
        })

        const response = await fixture.handle(linkRequest())

        expect(response.status).toBe(409)
        expect((await responseApiError(response)).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
      },
    )

    test('id que não é uuid nunca casa a rota', async () => {
      const fixture = await createTripHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { nfeDocumentIds: [NOTE_ID], reason: REASON },
          method: 'POST',
          path: tripDocumentsAfterDispatchPath('not-a-uuid'),
        }),
      )

      expect(response.status).toBe(404)
      expect(fixture.linkTripDocumentsAfterDispatchCalls).toEqual([])
    })
  })
})
