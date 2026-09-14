/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readTripCargoLayout } from '../../src/trips/infrastructure/stored-cargo-layout-read.support.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'
import { NEW_INPUT, OLD_INPUT, drawnWith } from '../fixtures/cargo-layout-label.fixture.js'

const COMPUTED_AT = new Date('2026-09-12T10:00:00.000Z')

/**
 * A cadeia de consulta do Drizzle, respondida em ordem: a linha do hash atual e, quando ela não está
 * pronta, a última pronta da viagem. Conta as consultas para provar que a etiqueta não custa uma a mais.
 */
function queryableWith(answers: {
  readonly current: readonly object[]
  readonly previousReady: readonly object[]
}): { readonly queries: string[]; readonly queryable: TripQueryable } {
  const queries: string[] = []
  const queryable = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            queries.push('current')
            return answers.current
          },
          orderBy: () => ({
            limit: async () => {
              queries.push('previousReady')
              return answers.previousReady
            },
          }),
        }),
      }),
    }),
  }
  return { queries, queryable: queryable as unknown as TripQueryable }
}

const READ_PARAMS = { companyId: 'company', input: NEW_INPUT, leaseMs: 60_000, tripId: 'trip' }

/** Spec 145 D20 (T16): o detalhe reetiqueta a planta com a entrada que ele mesmo montou. */
describe('o detalhe serve a etiqueta de agora (spec 145 D20)', () => {
  test('cliente renomeado depois do ready: o detalhe serve o nome novo, sem consulta a mais', async () => {
    const { queries, queryable } = queryableWith({
      current: [
        {
          computedAt: COMPUTED_AT,
          errorCode: '',
          id: 'layout',
          layout: drawnWith(OLD_INPUT),
          leaseExpired: false,
          status: 'ready',
        },
      ],
      previousReady: [],
    })

    const reading = await readTripCargoLayout(queryable, READ_PARAMS)

    expect(reading.cargoLayout).toEqual(drawnWith(NEW_INPUT))
    expect(reading.cargoLayoutState).toMatchObject({ stale: false, status: 'ready' })
    expect(queries).toEqual(['current'])
  })

  test('a planta anterior (stale) também sai com a etiqueta de agora', async () => {
    const { queries, queryable } = queryableWith({
      current: [],
      previousReady: [{ computedAt: COMPUTED_AT, layout: drawnWith(OLD_INPUT) }],
    })

    const reading = await readTripCargoLayout(queryable, READ_PARAMS)

    expect(reading.cargoLayoutState).toMatchObject({ stale: true, status: 'pending' })
    expect(reading.cargoLayout?.rows.map((row) => row.clientName)).toContain('Cliente Renomeado')
    expect(queries).toEqual(['current', 'previousReady'])
  })
})
