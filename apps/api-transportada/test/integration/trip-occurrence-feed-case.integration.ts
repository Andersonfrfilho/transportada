/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T8 (RF10/RF11), contra Postgres real: o `left join` da tratativa no feed de ocorrências.
 * Ocorrência sem tratativa (`unset`) devolve `case: null` — nunca um estado inventado; o filtro por
 * estado da tratativa inclui `'none'` (sem tratativa).
 */
import { describe, expect } from 'bun:test'

import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

async function seedOccurrenceType(
  database: TestDatabase,
  company: Company,
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
  name: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name,
    notifies: false,
    redeliveryPolicy,
    stage: 'separation',
  })
  return id
}

async function register(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
  typeName: string,
) {
  const uploads: { objectId: string; objectKey: string }[] = []
  return persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy,
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName,
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
}

describe('o feed enxerga a tratativa (spec 164 T8)', () => {
  testWithPostgres(
    'ocorrência com tratativa devolve case; ocorrência sem tratativa devolve null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')

        const blockedTypeId = await seedOccurrenceType(
          database,
          company,
          'blocked',
          'Caixa violada',
        )
        const withCase = await register(
          database,
          company,
          trip,
          blockedTypeId,
          'blocked',
          'Caixa violada',
        )
        if (withCase === null) throw new Error('EXPECTED_OCCURRENCE')

        const unsetTypeId = await seedOccurrenceType(database, company, 'unset', 'Etiqueta rasgada')
        const withoutCase = await register(
          database,
          company,
          trip,
          unsetTypeId,
          'unset',
          'Etiqueta rasgada',
        )
        if (withoutCase === null) throw new Error('EXPECTED_OCCURRENCE')

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })

        const withCaseItem = page.items.find((item) => item.id === withCase.id)
        const withoutCaseItem = page.items.find((item) => item.id === withoutCase.id)
        if (withCaseItem === undefined || withoutCaseItem === undefined) {
          throw new Error('EXPECTED_BOTH_ITEMS')
        }

        expect(withCaseItem.case).toMatchObject({
          decision: null,
          redeliveryPolicy: 'blocked',
          settlementTotal: null,
          status: 'recorded',
        })
        expect(withoutCaseItem.case).toBeNull()
      })
    },
  )

  testWithPostgres('o filtro por estado da tratativa inclui "sem tratativa" (none)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')

      const blockedTypeId = await seedOccurrenceType(database, company, 'blocked', 'Caixa violada')
      const withCase = await register(
        database,
        company,
        trip,
        blockedTypeId,
        'blocked',
        'Caixa violada',
      )
      if (withCase === null) throw new Error('EXPECTED_OCCURRENCE')

      const unsetTypeId = await seedOccurrenceType(database, company, 'unset', 'Etiqueta rasgada')
      const withoutCase = await register(
        database,
        company,
        trip,
        unsetTypeId,
        'unset',
        'Etiqueta rasgada',
      )
      if (withoutCase === null) throw new Error('EXPECTED_OCCURRENCE')

      const onlyRecorded = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['recorded'] },
        limit: 20,
        order: 'desc',
      })
      expect(onlyRecorded.items.map((item) => item.id)).toEqual([withCase.id])

      const onlyNone = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['none'] },
        limit: 20,
        order: 'desc',
      })
      expect(onlyNone.items.map((item) => item.id)).toEqual([withoutCase.id])

      const both = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['none', 'recorded'] },
        limit: 20,
        order: 'desc',
      })
      expect(new Set(both.items.map((item) => item.id))).toEqual(
        new Set([withCase.id, withoutCase.id]),
      )
    })
  })
})
