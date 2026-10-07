/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.5: `POST /v1/trips/:id/crew-transfers` — o contrato HTTP que o painel já consome
 * (`plan.md` § Contrato HTTP). O que se prova aqui é a fronteira: permissão, corpo estrito, o recorte
 * exato do resumo e o mapa de erros. A regra de janela e de elegibilidade é do caso de uso
 * (`test/trip-application/trip-crew-transfer.contract.ts`).
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyRole } from '../../src/database/database.schema.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import {
  TripCrewUnchangedError,
  TripDriverNotAvailableError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import {
  CORRELATION_ID,
  DRIVER_ID,
  HELPER_ID,
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_DETAIL,
  TRIP_ID,
  tripCrewTransfersPath,
  tripDetailPath,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

/** Cópia plana: o `Set` que `resolveCompanyPermissions` devolve não sobrevive ao `structuredClone` da fixture. */
function permissionsOf(role: CompanyRole) {
  return new Set(resolveCompanyPermissions([role]))
}

const REASON = 'Motorista passou mal na estrada'

const TRANSFER_KEYS = [
  'costAfter',
  'costBefore',
  'costDifference',
  'costHasGaps',
  'id',
  'mdfeDriverDivergence',
]

function transferRequest(
  body: unknown = { driverIds: [DRIVER_ID], helperIds: [], reason: REASON },
) {
  return jsonRequest({ body, method: 'POST', path: tripCrewTransfersPath() })
}

describe('trip crew transfer http contract', () => {
  test('responde 201 com a viagem e o resumo, e nada além deles', async () => {
    const fixture = await createTripHttpFixture({
      getTripResult: { ...TRIP_DETAIL, status: 'in_transit' },
      transferTripCrewResult: {
        transfer: {
          costAfter: '1350.00',
          costBefore: '1200.00',
          costDifference: '150.00',
          costHasGaps: false,
          /** Campo interno que a rota nunca pode publicar. */
          actorUserId: '00000000-0000-4000-8000-000000000001',
          id: '00000000-0000-4000-8000-000000000b01',
          mdfeDriverDivergence: true,
          previousCrew: [{ driverId: DRIVER_ID, name: 'Ana Souza', position: 1, role: 'driver' }],
        },
        trip: { ...TRIP_DETAIL, status: 'in_transit' },
      },
    })

    const response = await fixture.handle(transferRequest())
    const body = await responseData<{ transfer: Record<string, unknown>; trip: object }>(response)
    const detail = await responseData(
      await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() })),
    )

    expect(response.status).toBe(201)
    expect(Object.keys(body).sort()).toEqual(['transfer', 'trip'])
    expect(Object.keys(body.transfer).sort()).toEqual(TRANSFER_KEYS)
    expect(body.transfer).toEqual({
      costAfter: '1350.00',
      costBefore: '1200.00',
      costDifference: '150.00',
      costHasGaps: false,
      id: '00000000-0000-4000-8000-000000000b01',
      mdfeDriverDivergence: true,
    })
    expect(body.trip).toEqual(detail)
  })

  test('entrega ao caso de uso o contexto, a trilha, a tripulação pedida e o motivo', async () => {
    const fixture = await createTripHttpFixture()

    await fixture.handle(
      transferRequest({ driverIds: [DRIVER_ID], helperIds: [HELPER_ID], reason: `  ${REASON}  ` }),
    )

    expect(fixture.transferTripCrewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        driverIds: [DRIVER_ID],
        helperIds: [HELPER_ID],
        ipAddress: 'unknown',
        reason: REASON,
        tripId: TRIP_ID,
      },
    ])
  })

  test('helperIds ausente vale lista vazia', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      transferRequest({ driverIds: [DRIVER_ID], reason: REASON }),
    )

    expect(response.status).toBe(201)
    expect(fixture.transferTripCrewCalls).toEqual([expect.objectContaining({ helperIds: [] })])
  })

  describe('permissão trip.report-on-behalf', () => {
    test.each(['company-admin', 'operator', 'finance'] as const)(
      'o papel %s alcança a rota',
      async (role) => {
        const fixture = await createTripHttpFixture({
          permissions: permissionsOf(role),
        })

        const response = await fixture.handle(transferRequest())

        expect(response.status).toBe(201)
      },
    )

    test.each(['separator', 'viewer'] as const)(
      'o papel %s recebe 403 e nada é executado',
      async (role) => {
        const fixture = await createTripHttpFixture({
          permissions: permissionsOf(role),
        })

        const response = await fixture.handle(transferRequest())

        expect(response.status).toBe(403)
        expect(fixture.transferTripCrewCalls).toEqual([])
      },
    )

    test('trip.manage sozinho não basta: o separador monta a viagem, não a transfere', async () => {
      const fixture = await createTripHttpFixture({
        permissions: new Set(['fleet.read', 'trip.manage']),
      })

      const response = await fixture.handle(transferRequest())

      expect(response.status).toBe(403)
    })
  })

  describe('corpo estrito, todos os erros de uma vez', () => {
    async function refusedFields(body: unknown): Promise<readonly string[]> {
      const fixture = await createTripHttpFixture()
      const response = await fixture.handle(transferRequest(body))
      const payload = (await response.json()) as {
        error: { code: string; details?: readonly { field: string }[] }
      }

      expect(response.status).toBe(400)
      expect(payload.error.code).toBe('INVALID_REQUEST')
      expect(fixture.transferTripCrewCalls).toEqual([])
      return (payload.error.details ?? []).map((detail) => detail.field)
    }

    test('motivo e motoristas inválidos juntos aparecem juntos', async () => {
      const fields = await refusedFields({
        driverIds: [],
        helperIds: ['not-a-uuid'],
        reason: '   ',
      })

      expect(fields).toContain('driverIds')
      expect(fields).toContain('reason')
      expect(fields).toContain('helperIds.0')
    })

    test('motivo ausente é recusado', async () => {
      expect(await refusedFields({ driverIds: [DRIVER_ID] })).toContain('reason')
    })

    test('motivo com mais de 500 caracteres é recusado', async () => {
      expect(await refusedFields({ driverIds: [DRIVER_ID], reason: 'x'.repeat(501) })).toContain(
        'reason',
      )
    })

    test('motivo com exatamente 500 caracteres passa', async () => {
      const fixture = await createTripHttpFixture()

      const response = await fixture.handle(
        transferRequest({ driverIds: [DRIVER_ID], reason: 'x'.repeat(500) }),
      )

      expect(response.status).toBe(201)
    })

    test('driverIds ausente ou vazio é recusado: a posição 1 exige condutor', async () => {
      expect(await refusedFields({ reason: REASON })).toContain('driverIds')
      expect(await refusedFields({ driverIds: [], reason: REASON })).toContain('driverIds')
    })

    test('vehicleId é recusado: trocar o caminhão apagaria a rota congelada', async () => {
      await refusedFields({
        driverIds: [DRIVER_ID],
        reason: REASON,
        vehicleId: '00000000-0000-4000-8000-000000000a12',
      })
    })

    test('mais de dez pessoas no total é recusado', async () => {
      const helperIds = Array.from({ length: 10 }, () => crypto.randomUUID())

      expect(await refusedFields({ driverIds: [DRIVER_ID], helperIds, reason: REASON })).toContain(
        'helperIds',
      )
    })
  })

  describe('mapa de erros', () => {
    test('viagem inexistente ou de outra empresa: 404', async () => {
      const fixture = await createTripHttpFixture({
        transferTripCrewError: new TripNotFoundError(),
      })

      const response = await fixture.handle(transferRequest())

      expect(response.status).toBe(404)
      expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
    })

    test.each(['TRIP_CANCELLED', 'TRIP_COMPLETED', 'TRIP_NOT_DISPATCHED'] as const)(
      'fora da janela (%s): 409 STATE_TRANSITION_NOT_ALLOWED',
      async (reason) => {
        const fixture = await createTripHttpFixture({
          transferTripCrewError: new TripStateTransitionNotAllowedError(reason),
        })

        const response = await fixture.handle(transferRequest())

        expect(response.status).toBe(409)
        expect((await responseApiError(response)).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
      },
    )

    test('tripulação igual à atual: 409 TRIP_CREW_UNCHANGED', async () => {
      const fixture = await createTripHttpFixture({
        transferTripCrewError: new TripCrewUnchangedError(),
      })

      const response = await fixture.handle(transferRequest())

      expect(response.status).toBe(409)
      expect((await responseApiError(response)).code).toBe('TRIP_CREW_UNCHANGED')
    })

    test('ficha inelegível: 422', async () => {
      const fixture = await createTripHttpFixture({
        transferTripCrewError: new TripDriverNotAvailableError(),
      })

      const response = await fixture.handle(transferRequest())

      expect(response.status).toBe(422)
      expect((await responseApiError(response)).code).toBe('TRIP_DRIVER_NOT_AVAILABLE')
    })

    test('id que não é uuid nunca casa a rota', async () => {
      const fixture = await createTripHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { driverIds: [DRIVER_ID], reason: REASON },
          method: 'POST',
          path: tripCrewTransfersPath('not-a-uuid'),
        }),
      )

      expect(response.status).toBe(404)
      expect(fixture.transferTripCrewCalls).toEqual([])
    })
  })
})
