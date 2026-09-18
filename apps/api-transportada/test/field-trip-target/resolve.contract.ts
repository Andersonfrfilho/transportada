/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T3 (ADR-0067 §2): em nome de qual motorista o escritório registra, e a viagem de outra
 * empresa respondendo como inexistente.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import type { FieldTripCrew } from '../../src/trips/application/field-trip-target.port.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { pickOnBehalfOfDriver } from '../../src/trips/domain/field-trip-target.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const FIRST_DRIVER = '00000000-0000-4000-8000-0000000000a1'
const SECOND_DRIVER = '00000000-0000-4000-8000-0000000000a2'
const OUTSIDER = '00000000-0000-4000-8000-0000000000a9'

function expectApiErrorSync(operation: () => unknown, code: string, status: number): void {
  try {
    operation()
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    expect((error as ApiError).status).toBe(status)
  }
}

async function expectApiError(
  operation: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    expect((error as ApiError).status).toBe(status)
  }
}

function crewPort(crew: FieldTripCrew | null) {
  const calls: unknown[] = []
  return {
    calls,
    repository: {
      async findTripCrew(input: { readonly companyId: string; readonly tripId: string }) {
        calls.push(input)
        return crew
      },
    },
  }
}

const TWO_DRIVERS: FieldTripCrew = {
  /** Fora de ordem de propósito: a política não pode depender da ordem das linhas. */
  drivers: [
    { driverId: SECOND_DRIVER, position: 2 },
    { driverId: FIRST_DRIVER, position: 1 },
  ],
  tripId: TRIP_ID,
  tripStatus: 'in_transit',
}

describe('o motorista em nome de quem o escritório registra (spec 156 T3)', () => {
  it('sem motorista pedido, é o de position 1', () => {
    expect(pickOnBehalfOfDriver({ drivers: TWO_DRIVERS.drivers })).toBe(FIRST_DRIVER)
  })

  it('o motorista pedido vale quando está na tripulação', () => {
    expect(
      pickOnBehalfOfDriver({ drivers: TWO_DRIVERS.drivers, requestedDriverId: SECOND_DRIVER }),
    ).toBe(SECOND_DRIVER)
  })

  it('motorista pedido fora da viagem é 422 DRIVER_NOT_ON_TRIP', () => {
    expectApiErrorSync(
      () => pickOnBehalfOfDriver({ drivers: TWO_DRIVERS.drivers, requestedDriverId: OUTSIDER }),
      'DRIVER_NOT_ON_TRIP',
      422,
    )
  })

  it('viagem sem motorista é 422 TRIP_WITHOUT_DRIVER, com ou sem motorista pedido', () => {
    expectApiErrorSync(() => pickOnBehalfOfDriver({ drivers: [] }), 'TRIP_WITHOUT_DRIVER', 422)
    expectApiErrorSync(
      () => pickOnBehalfOfDriver({ drivers: [], requestedDriverId: OUTSIDER }),
      'TRIP_WITHOUT_DRIVER',
      422,
    )
  })
})

describe('resolver o alvo trip (spec 156 T3)', () => {
  it('viagem de outra empresa (ausente para esta) é 404 TRIP_NOT_FOUND, nunca 403', async () => {
    const port = crewPort(null)

    await expectApiError(
      resolveFieldTripTarget({
        companyId: COMPANY_ID,
        repository: port.repository,
        target: { kind: 'trip', tripId: TRIP_ID },
      }),
      'TRIP_NOT_FOUND',
      404,
    )
  })

  it('a porta recebe a empresa do contexto e o id da viagem, e nada mais', async () => {
    const port = crewPort(TWO_DRIVERS)

    await resolveFieldTripTarget({
      companyId: COMPANY_ID,
      repository: port.repository,
      target: { driverId: SECOND_DRIVER, kind: 'trip', tripId: TRIP_ID },
    })

    expect(port.calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  it('o alvo resolvido leva o motorista efetivo e o status, sem o motorista pedido (R7)', async () => {
    const port = crewPort(TWO_DRIVERS)

    const resolved = await resolveFieldTripTarget({
      companyId: COMPANY_ID,
      repository: port.repository,
      target: { driverId: SECOND_DRIVER, kind: 'trip', tripId: TRIP_ID },
    })

    expect(Object.keys(resolved).sort()).toEqual([
      'kind',
      'onBehalfOfDriverId',
      'tripId',
      'tripStatus',
    ])
    expect(resolved.kind).toBe('trip')
    expect(resolved.onBehalfOfDriverId).toBe(SECOND_DRIVER)
    expect(resolved.tripId).toBe(TRIP_ID)
    expect(resolved.tripStatus).toBe('in_transit')
  })

  it('sem motorista pedido, o alvo resolvido é o de position 1', async () => {
    const resolved = await resolveFieldTripTarget({
      companyId: COMPANY_ID,
      repository: crewPort(TWO_DRIVERS).repository,
      target: { kind: 'trip', tripId: TRIP_ID },
    })

    expect(resolved.onBehalfOfDriverId).toBe(FIRST_DRIVER)
  })

  it('viagem sem tripulação é 422 TRIP_WITHOUT_DRIVER', async () => {
    await expectApiError(
      resolveFieldTripTarget({
        companyId: COMPANY_ID,
        repository: crewPort({ drivers: [], tripId: TRIP_ID, tripStatus: 'dispatched' }).repository,
        target: { kind: 'trip', tripId: TRIP_ID },
      }),
      'TRIP_WITHOUT_DRIVER',
      422,
    )
  })
})
