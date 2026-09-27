/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T201 (RF1/RF3): o detalhe de uma ocorrência — a forma da listagem, mais o bloco do
 * motorista. O caso de uso só escopa pela empresa do contexto e transforma "não achei" em 404; a
 * leitura das duas fontes (nota e parada) é da query, provada contra Postgres na T202.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripOccurrenceDetailUseCase } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { OCCURRENCE_DETAIL } from '../fixtures/trip-occurrence-detail.fixture.js'

const OCCURRENCE_ID = OCCURRENCE_DETAIL.id

const COMPANY_ID = '00000000-0000-4000-8000-00000000c001'

describe('detalhe da ocorrência — caso de uso (spec 183 T201)', () => {
  test('lê pela empresa do contexto, nunca por outra', async () => {
    const calls: unknown[] = []
    const useCase = createReadTripOccurrenceDetailUseCase({
      reader: {
        findDetail: async (input) => {
          calls.push(input)
          return OCCURRENCE_DETAIL
        },
      },
    })

    const detail = await useCase.execute({
      context: { companyId: COMPANY_ID },
      occurrenceId: OCCURRENCE_ID,
    })

    expect(detail).toEqual(OCCURRENCE_DETAIL)
    expect(calls).toEqual([{ companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID }])
  })

  test('inexistente e de outra empresa respondem igual: 404 TRIP_OCCURRENCE_NOT_FOUND', async () => {
    const useCase = createReadTripOccurrenceDetailUseCase({
      reader: { findDetail: async () => null },
    })

    const attempt = useCase.execute({
      context: { companyId: COMPANY_ID },
      occurrenceId: OCCURRENCE_ID,
    })

    expect(attempt).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
  })
})
