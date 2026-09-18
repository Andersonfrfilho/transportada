/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T6: `createReadTripTimelineUseCase` com dublês — a viagem de outra empresa responde 404
 * **antes** de o leitor ser chamado (o leitor não distingue "vazia" de "inexistente" sozinho), e o
 * `companyId` que chega ao leitor vem sempre do contexto, nunca de um parâmetro solto.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import { TripNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000009'
const TRIP_ID = '00000000-0000-4000-8000-000000000101'

const EMPTY_RESULT = { items: [], nextCursor: null }

describe('createReadTripTimelineUseCase (spec 158 T6)', () => {
  test('viagem de outra empresa: 404 TRIP_NOT_FOUND sem chamar o leitor', async () => {
    const readerCalls: unknown[] = []
    const useCase = createReadTripTimelineUseCase({
      existence: { findTripCompanyScope: async () => null },
      reader: {
        listTripTimeline: async (input) => {
          readerCalls.push(input)
          return EMPTY_RESULT
        },
      },
    })

    await expect(
      useCase.execute({
        context: { companyId: OTHER_COMPANY_ID },
        cursor: null,
        limit: 100,
        tripId: TRIP_ID,
      }),
    ).rejects.toBeInstanceOf(TripNotFoundError)
    expect(readerCalls).toEqual([])
  })

  test('viagem existente: repassa companyId do contexto, cursor e limit ao leitor', async () => {
    const readerCalls: unknown[] = []
    const useCase = createReadTripTimelineUseCase({
      existence: {
        findTripCompanyScope: async (input) => {
          expect(input).toEqual({ companyId: COMPANY_ID, tripId: TRIP_ID })
          return { id: TRIP_ID }
        },
      },
      reader: {
        listTripTimeline: async (input) => {
          readerCalls.push(input)
          return EMPTY_RESULT
        },
      },
    })

    const cursor = {
      id: TRIP_ID,
      kindPriority: 0,
      occurredAt: new Date('2026-09-18T00:00:00.000Z'),
    }
    const result = await useCase.execute({
      context: { companyId: COMPANY_ID },
      cursor,
      limit: 37,
      tripId: TRIP_ID,
    })

    expect(result).toEqual(EMPTY_RESULT)
    expect(readerCalls).toEqual([{ companyId: COMPANY_ID, cursor, limit: 37, tripId: TRIP_ID }])
  })
})
