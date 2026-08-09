/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../src/database/postgres-error.support.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import type { TripDatabase } from '../../src/trips/infrastructure/trip-queryable.type.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '44444444-4444-4444-8444-444444444444'
const NFE_DOCUMENT_ID = '44444444-4444-4444-8444-444444444445'

const postgresError = (input: { readonly constraint: string; readonly sqlState: string }): Error =>
  Object.assign(new Error('database rejected the write'), {
    code: input.sqlState,
    constraint: input.constraint,
  })

function createRepository(error: Error): DrizzleTripRepository {
  const database = {
    insert: () => ({
      values: () => ({
        returning: () => {
          throw error
        },
      }),
    }),
  } as unknown as TripDatabase
  return new DrizzleTripRepository(database)
}

const linkDocument = async (repository: DrizzleTripRepository): Promise<ApiError> => {
  try {
    await repository.linkDocument({
      companyId: COMPANY_ID,
      freightCalculationId: null,
      nfeDocumentId: NFE_DOCUMENT_ID,
      tripId: TRIP_ID,
    })
  } catch (caught) {
    return caught as ApiError
  }
  throw new Error('EXPECTED_REFUSAL')
}

describe('trip document link error translation contract', () => {
  test('turns a missing nfe document reference into a not-found domain error', async () => {
    const repository = createRepository(
      postgresError({
        constraint: 'trip_documents_company_nfe_document_fk',
        sqlState: POSTGRES_FOREIGN_KEY_VIOLATION,
      }),
    )

    const error = await linkDocument(repository)

    expect(error.code).toBe('TRIP_DOCUMENT_NOT_FOUND')
    expect(error.status).toBe(404)
  })

  test('turns a missing freight calculation reference into a not-found domain error', async () => {
    const repository = createRepository(
      postgresError({
        constraint: 'trip_documents_company_freight_calculation_fk',
        sqlState: POSTGRES_FOREIGN_KEY_VIOLATION,
      }),
    )

    const error = await linkDocument(repository)

    expect(error.code).toBe('TRIP_DOCUMENT_NOT_FOUND')
    expect(error.status).toBe(404)
  })

  test('keeps translating the live-document uniqueness into a conflict', async () => {
    const repository = createRepository(
      postgresError({
        constraint: 'trip_documents_live_nfe_document_unique',
        sqlState: POSTGRES_UNIQUE_VIOLATION,
      }),
    )

    const error = await linkDocument(repository)

    expect(error.code).toBe('TRIP_DOCUMENT_ALREADY_LINKED')
    expect(error.status).toBe(409)
  })

  test('lets an unrelated database failure through instead of disguising it', async () => {
    const repository = createRepository(
      postgresError({ constraint: 'trips_company_vehicle_fk', sqlState: '23514' }),
    )

    const error = await linkDocument(repository)

    expect(error).not.toBeInstanceOf(ApiError)
    expect(error.message).toBe('database rejected the write')
  })
})
