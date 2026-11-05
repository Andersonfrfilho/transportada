/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T3.2 contra o Postgres de verdade: a sugestão do motorista aparece só na empresa dela, o
 * escritório aplica (correção do operador) ou descarta, e as duas decisões deixam auditoria.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { createDrizzleAddressCorrectionSuggestionDecisions } from '../../src/address-correction-suggestions/infrastructure/drizzle-address-correction-suggestion.repository.js'
import { addressCorrectionSuggestions } from '../../src/database/address-correction-suggestion.schema.js'
import { auditLogs } from '../../src/database/fiscal-operation.schema.js'
import { geocodedAddressCorrections } from '../../src/database/geocoded-address-correction.schema.js'
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import { tripStops } from '../../src/database/trip.schema.js'
import { createListPendingItemsUseCase } from '../../src/pending-items/application/list-pending-items.use-case.js'
import { createAddressSuggestionPendingItemSource } from '../../src/pending-items/infrastructure/drizzle-address-correction-suggestion-pending-item.source.js'
import { createFleetBodyTypePendingItemSource } from '../../src/pending-items/infrastructure/drizzle-fleet-body-type-pending-item.source.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const SUGGESTED_LATITUDE = '-23.5600000'
const SUGGESTED_LONGITUDE = '-46.6400000'

type Seeded = Readonly<{
  addressKey: string
  company: Company
  stopId: string
  suggestionId: string
}>

async function seedSuggestion(database: TestDatabase): Promise<Seeded> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'dispatched')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const [stop] = await database.db
    .select({ addressKey: tripStops.addressKey })
    .from(tripStops)
    .where(eq(tripStops.id, trip.stopId))
  const addressKey = stop?.addressKey ?? ''
  await database.db.insert(geocodedAddresses).values({
    addressKey,
    latitude: '-23.5500000',
    longitude: '-46.6300000',
    precision: 'postal_code',
    source: 'postal_code',
  })
  const [suggestion] = await database.db
    .insert(addressCorrectionSuggestions)
    .values({
      addressKey,
      companyId: company.companyId,
      createdByUserId: driverUserId,
      distanceMeters: 1_400,
      latitude: SUGGESTED_LATITUDE,
      longitude: SUGGESTED_LONGITUDE,
      tripStopId: trip.stopId,
    })
    .returning({ id: addressCorrectionSuggestions.id })

  return { addressKey, company, stopId: trip.stopId, suggestionId: suggestion?.id ?? '' }
}

function listFor(database: TestDatabase, input: { readonly companyId: string }) {
  return createListPendingItemsUseCase({
    sources: [
      createFleetBodyTypePendingItemSource({ database: database.db }),
      createAddressSuggestionPendingItemSource({ database: database.db }),
    ],
  }).execute({
    context: {
      companyId: input.companyId,
      permissions: new Set(['fleet.read', 'trip.manage']),
    },
    cursor: null,
    limit: 25,
  })
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<void> {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).code).toBe(code)
}

describe('sugestões de endereço do motorista nas pendências (spec 294 T3.2)', () => {
  testWithPostgres('lista só as pendentes da empresa do token', async () => {
    await withDisposableDatabase(async (database) => {
      const mine = await seedSuggestion(database)
      const other = await seedSuggestion(database)

      const page = await listFor(database, { companyId: mine.company.companyId })

      expect(page.items).toHaveLength(1)
      expect(page.items[0]).toMatchObject({
        details: {
          addressKey: mine.addressKey,
          distanceMeters: 1_400,
          latitude: SUGGESTED_LATITUDE,
          longitude: SUGGESTED_LONGITUDE,
          tripStopId: mine.stopId,
        },
        entityId: mine.suggestionId,
        entityType: 'addressSuggestion',
        kind: 'addressSuggestedByDriver',
        label: 'Centro, 100',
      })
      expect(page.items.map((item) => item.entityId)).not.toContain(other.suggestionId)
    })
  })

  testWithPostgres('aplicar grava a correção do operador, marca a sugestão e audita', async () => {
    await withDisposableDatabase(async (database) => {
      const seeded = await seedSuggestion(database)
      const decisions = createDrizzleAddressCorrectionSuggestionDecisions(database.db)

      const decided = await decisions.apply({
        actorUserId: seeded.company.userId,
        companyId: seeded.company.companyId,
        correlationId: 'apply-correlation',
        suggestionId: seeded.suggestionId,
      })

      expect(decided).toEqual({ id: seeded.suggestionId, status: 'applied' })
      const [address] = await database.db
        .select()
        .from(geocodedAddresses)
        .where(eq(geocodedAddresses.addressKey, seeded.addressKey))
      expect(address).toMatchObject({ precision: 'rooftop', source: 'manual' })
      expect(Number(address?.latitude)).toBeCloseTo(-23.56, 6)
      const [correction] = await database.db
        .select()
        .from(geocodedAddressCorrections)
        .where(eq(geocodedAddressCorrections.companyId, seeded.company.companyId))
      expect(correction).toMatchObject({
        actorUserId: seeded.company.userId,
        origin: 'operator',
        previousSource: 'postal_code',
      })
      const [suggestion] = await database.db
        .select()
        .from(addressCorrectionSuggestions)
        .where(eq(addressCorrectionSuggestions.id, seeded.suggestionId))
      expect(suggestion).toMatchObject({
        decidedByUserId: seeded.company.userId,
        status: 'applied',
      })
      expect(suggestion?.decidedAt).not.toBeNull()
      const [audit] = await database.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.companyId, seeded.company.companyId),
            eq(auditLogs.action, 'address_correction_suggestion.applied'),
          ),
        )
      expect(audit).toMatchObject({
        actorUserId: seeded.company.userId,
        correlationId: 'apply-correlation',
        entityId: seeded.suggestionId,
        permission: 'trip.manage',
      })
      expect((await listFor(database, { companyId: seeded.company.companyId })).items).toEqual([])
    })
  })

  testWithPostgres('descartar só marca a sugestão e audita, sem tocar no cadastro', async () => {
    await withDisposableDatabase(async (database) => {
      const seeded = await seedSuggestion(database)
      const decisions = createDrizzleAddressCorrectionSuggestionDecisions(database.db)

      const decided = await decisions.dismiss({
        actorUserId: seeded.company.userId,
        companyId: seeded.company.companyId,
        correlationId: 'dismiss-correlation',
        suggestionId: seeded.suggestionId,
      })

      expect(decided.status).toBe('dismissed')
      const [address] = await database.db
        .select()
        .from(geocodedAddresses)
        .where(eq(geocodedAddresses.addressKey, seeded.addressKey))
      expect(address?.source).toBe('postal_code')
      expect(
        await database.db
          .select()
          .from(geocodedAddressCorrections)
          .where(eq(geocodedAddressCorrections.companyId, seeded.company.companyId)),
      ).toEqual([])
      const audits = await database.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.companyId, seeded.company.companyId))
      expect(audits).toEqual([{ action: 'address_correction_suggestion.dismissed' }])
    })
  })

  testWithPostgres('sugestão de outra empresa: 404 e nada muda, nas duas decisões', async () => {
    await withDisposableDatabase(async (database) => {
      const owner = await seedSuggestion(database)
      const intruder = await seedCompany(database)
      const decisions = createDrizzleAddressCorrectionSuggestionDecisions(database.db)

      for (const verb of ['apply', 'dismiss'] as const) {
        await expectApiError(
          decisions[verb]({
            actorUserId: intruder.userId,
            companyId: intruder.companyId,
            correlationId: 'intruder',
            suggestionId: owner.suggestionId,
          }),
          'ADDRESS_CORRECTION_SUGGESTION_NOT_FOUND',
        )
      }

      const [suggestion] = await database.db
        .select({ status: addressCorrectionSuggestions.status })
        .from(addressCorrectionSuggestions)
        .where(eq(addressCorrectionSuggestions.id, owner.suggestionId))
      expect(suggestion?.status).toBe('pending')
      const [address] = await database.db
        .select({ source: geocodedAddresses.source })
        .from(geocodedAddresses)
        .where(eq(geocodedAddresses.addressKey, owner.addressKey))
      expect(address?.source).toBe('postal_code')
    })
  })

  testWithPostgres('decidir de novo: 409, sem segunda correção nem segunda auditoria', async () => {
    await withDisposableDatabase(async (database) => {
      const seeded = await seedSuggestion(database)
      const decisions = createDrizzleAddressCorrectionSuggestionDecisions(database.db)
      const params = {
        actorUserId: seeded.company.userId,
        companyId: seeded.company.companyId,
        correlationId: 'twice',
        suggestionId: seeded.suggestionId,
      }

      await decisions.apply(params)
      await expectApiError(decisions.apply(params), 'ADDRESS_CORRECTION_SUGGESTION_ALREADY_DECIDED')
      await expectApiError(
        decisions.dismiss(params),
        'ADDRESS_CORRECTION_SUGGESTION_ALREADY_DECIDED',
      )

      expect(
        await database.db
          .select()
          .from(geocodedAddressCorrections)
          .where(eq(geocodedAddressCorrections.companyId, seeded.company.companyId)),
      ).toHaveLength(1)
      expect(
        await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.companyId, seeded.company.companyId)),
      ).toHaveLength(1)
    })
  })
})
