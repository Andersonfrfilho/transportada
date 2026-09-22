/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T208 (CA01/CA02): a quantidade/unidade por item contra o Postgres de verdade — os
 * contratos (T202/T203) não tocam o banco, e é aqui que os dois CHECKs novos
 * (`trip_document_occurrence_products_quantity_*`) e a migration aditiva de T201 são exercitados de
 * fato, não simulados.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
} from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
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

async function seedSeparationOccurrenceType(
  database: TestDatabase,
  company: Company,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    allowsMultipleItems: true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    stage: 'separation',
  })
  return id
}

async function register(input: {
  readonly database: TestDatabase
  readonly company: Company
  readonly items: readonly {
    readonly code: string
    readonly quantity: null | string
    readonly unit: null | 'box' | 'unit'
  }[]
  readonly occurrenceTypeId: string
  readonly trip: SeededTrip
}) {
  const uploads: { objectId: string; objectKey: string }[] = []
  const productCodes = input.items.map((item) => item.code)

  const saved = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: input.company.userId,
      companyId: input.company.companyId,
      documentId: input.trip.documentId,
      items: input.items,
      note: 'caixa com avaria visível',
      occurrenceTypeId: input.occurrenceTypeId,
      productCode: productCodes[0] ?? '',
      productCodes,
      stage: 'separation',
      tripId: input.trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(input.database.db, 'test-bucket'),
  })
  if (saved === null) throw new Error('esperava a ocorrência gravada')
  return saved
}

describe('quantidade/unidade por item contra o Postgres (spec 166 T208)', () => {
  testWithPostgres(
    'item com quantidade e unidade persiste os dois; sem quantidade persiste dois nulos (CA02)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

        const saved = await register({
          company,
          database,
          items: [
            { code: 'ZG-4410', quantity: '3.5', unit: 'box' },
            { code: 'ZG-4411', quantity: null, unit: null },
          ],
          occurrenceTypeId,
          trip,
        })

        const rows = await database.db
          .select({
            position: tripDocumentOccurrenceProducts.position,
            productCode: tripDocumentOccurrenceProducts.productCode,
            quantity: tripDocumentOccurrenceProducts.quantity,
            quantityUnit: tripDocumentOccurrenceProducts.quantityUnit,
          })
          .from(tripDocumentOccurrenceProducts)
          .where(
            and(
              eq(tripDocumentOccurrenceProducts.companyId, company.companyId),
              eq(tripDocumentOccurrenceProducts.occurrenceId, saved.id),
            ),
          )
          .orderBy(tripDocumentOccurrenceProducts.position)

        expect(rows).toEqual([
          { position: 1, productCode: 'ZG-4410', quantity: '3.500', quantityUnit: 'box' },
          { position: 2, productCode: 'ZG-4411', quantity: null, quantityUnit: null },
        ])
      })
    },
  )

  testWithPostgres(
    'quantidade sem unidade é recusada pelo CHECK do banco, nunca só pela API (CA03)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

        const error = await register({
          company,
          database,
          items: [{ code: 'ZG-4410', quantity: '2', unit: null }],
          occurrenceTypeId,
          trip,
        }).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(Error)
        expect(String((error as { readonly cause?: unknown }).cause)).toContain(
          'trip_document_occurrence_products_quantity_presence_check',
        )
      })
    },
  )

  testWithPostgres('quantidade zero é recusada pelo CHECK do banco (CA04)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

      const error = await register({
        company,
        database,
        items: [{ code: 'ZG-4410', quantity: '0', unit: 'unit' }],
        occurrenceTypeId,
        trip,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(String((error as { readonly cause?: unknown }).cause)).toContain(
        'trip_document_occurrence_products_quantity_positive_check',
      )
    })
  })
})
