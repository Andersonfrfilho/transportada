/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The occurrence type icon end to end against a real Postgres: the catalog write stores it, a PUT
 * without it keeps it, `null` clears it, and the type reads and the occurrence reads carry it.
 */
import { describe, expect } from 'bun:test'

import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  findOccurrenceType,
  findTripOccurrenceById,
  listOccurrenceTypes,
  listTripOccurrences,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 60_000

function buildValues(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Devolução parcial',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

function saveThroughUseCase(
  database: TestDatabase,
  companyId: string,
  values: SaveOccurrenceTypeValues,
) {
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (toSave) => saveOccurrenceType(database.db, { ...toSave, companyId }),
    templates: { hasActiveEmailTemplate: async () => true },
    values,
  })
}

describe('the occurrence type icon through the catalog write (spec 255 RF2, RF3)', () => {
  testWithPostgres(
    'writes, keeps on a PUT without it, clears with null and reads on get and list',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)

        const created = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ iconName: 'money' }),
        )
        expect(created.iconName).toBe('money')

        const renamed = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ name: 'Devolução parcial (SAC)', occurrenceTypeId: created.id }),
        )
        expect(renamed.iconName).toBe('money')

        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (await listOccurrenceTypes(database.db, { companyId })).find(
          (type) => type.id === created.id,
        )
        expect(read?.iconName).toBe('money')
        expect(listed?.iconName).toBe('money')

        const swapped = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ iconName: 'truck', occurrenceTypeId: created.id }),
        )
        expect(swapped.iconName).toBe('truck')

        const cleared = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ iconName: null, occurrenceTypeId: created.id }),
        )
        expect(cleared.iconName).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a type created without the field has no icon',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)

        const created = await saveThroughUseCase(database, companyId, buildValues())

        expect(created.iconName).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('the occurrence reads carry typeIconName (spec 255 RF3)', () => {
  testWithPostgres(
    'the note list and the single read return the icon of the current type, null without one',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const withIcon = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ iconName: 'camera', name: 'Com ícone' }),
        )
        const withoutIcon = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ name: 'Sem ícone' }),
        )
        const occurrenceIds = new Map<string, string>()
        for (const type of [withIcon, withoutIcon]) {
          const id = crypto.randomUUID()
          occurrenceIds.set(type.id, id)
          await database.db.insert(tripDocumentOccurrences).values({
            actorUserId: company.userId,
            companyId: company.companyId,
            id,
            occurrenceTypeId: type.id,
            stage: 'delivery',
            tripDocumentId: trip.documentId,
          })
        }

        const list = await listTripOccurrences(database.db, {
          companyId: company.companyId,
          documentId: trip.documentId,
          tripId: trip.tripId,
        })
        expect(list.find((item) => item.id === occurrenceIds.get(withIcon.id))?.typeIconName).toBe(
          'camera',
        )
        expect(
          list.find((item) => item.id === occurrenceIds.get(withoutIcon.id))?.typeIconName,
        ).toBeNull()

        const single = await findTripOccurrenceById(database.db, {
          companyId: company.companyId,
          occurrenceId: occurrenceIds.get(withIcon.id) ?? '',
        })
        expect(single?.typeIconName).toBe('camera')
      })
    },
    TEST_TIMEOUT_MS,
  )
})
