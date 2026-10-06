/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.3: as cinco sementes do backfill da foto de rua, gravadas antes dele — (a) rua só
 * com a coluna, (b) coluna e uma linha só na posição 2, (c) galpão com duas linhas, (d) lote com um
 * objeto em três ocorrências, (e) rua sem foto — e (f), achado do architect: o mesmo upload do
 * motorista em duas ocorrências. Cada semente tem a sua data, distinta e antiga:
 * copiar `now()` no lugar do `created_at` da ocorrência nunca passa.
 */
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import {
  BATCH_PHOTO_PURPOSE,
  seedAttachmentRow,
  seedDocumentOccurrence,
  seedPhotoObject,
  STREET_PHOTO_PURPOSE,
} from './street-occurrence-attachment.fixture.js'
import { seedDeliveryOccurrenceType, seedTrip } from './trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from './trip-field-office-database.fixture.js'

export type BackfillScenario = {
  readonly batch: readonly [string, string, string]
  readonly batchObject: string
  readonly reusedUpload: readonly [string, string]
  readonly reusedUploadObject: string
  readonly noPhoto: string
  readonly onlyColumn: string
  readonly onlyColumnObject: string
  readonly secondObject: string
  readonly warehouse: string
  readonly warehouseObjects: readonly [string, string]
  readonly withSecond: string
}

export function scenarioDay(value: number): Date {
  return new Date(`2026-09-${String(value).padStart(2, '0')}T10:00:00.000Z`)
}

async function seedSeparationType(database: TestDatabase, company: Company): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    stage: 'separation',
  })
  return id
}

type Seeders = ReturnType<typeof createSeeders>

function createSeeders(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly street: Omit<
    Parameters<typeof seedDocumentOccurrence>[1],
    'attachmentObjectId' | 'createdAt'
  >
}) {
  const { company, database, street } = input
  return {
    occurrence: (attachmentObjectId: string | null, day: number) =>
      seedDocumentOccurrence(database, {
        ...street,
        attachmentObjectId,
        createdAt: scenarioDay(day),
      }),
    photo: () => seedPhotoObject(database, { company, purpose: STREET_PHOTO_PURPOSE }),
    row: (occurrenceId: string, position: number, storedObjectId: string, day: number) =>
      seedAttachmentRow(database, {
        company,
        createdAt: scenarioDay(day),
        occurrenceId,
        position,
        storedObjectId,
      }),
    warehouseOccurrence: async (day: number) =>
      seedDocumentOccurrence(database, {
        ...street,
        attachmentObjectId: null,
        createdAt: scenarioDay(day),
        stage: 'separation',
        typeId: await seedSeparationType(database, company),
      }),
  }
}

/** (a) e (b): a rua com a coluna, sem linha e com uma linha só na posição 2. */
async function seedStreetCases(seeders: Seeders) {
  const onlyColumnObject = await seeders.photo()
  const onlyColumn = await seeders.occurrence(onlyColumnObject, 1)
  const withSecond = await seeders.occurrence(await seeders.photo(), 2)
  const secondObject = await seeders.photo()
  await seeders.row(withSecond, 2, secondObject, 3)
  return { onlyColumn, onlyColumnObject, secondObject, withSecond }
}

/** (c) o galpão com duas linhas e sem coluna. */
async function seedWarehouseCase(seeders: Seeders) {
  const warehouse = await seeders.warehouseOccurrence(4)
  const warehouseObjects = [await seeders.photo(), await seeders.photo()] as const
  await seeders.row(warehouse, 1, warehouseObjects[0], 5)
  await seeders.row(warehouse, 2, warehouseObjects[1], 5)
  return { warehouse, warehouseObjects }
}

export async function seedBackfillScenario(
  database: TestDatabase,
  company: Company,
): Promise<BackfillScenario> {
  const trip = await seedTrip(database, company, 'in_transit')
  const typeId = await seedDeliveryOccurrenceType(database, company)
  const seeders = createSeeders({
    company,
    database,
    street: { company, stage: 'delivery', trip, typeId },
  })
  const streetCases = await seedStreetCases(seeders)
  const warehouseCase = await seedWarehouseCase(seeders)
  // (d) o lote: um objeto do escritório (purpose delivery_proof) em três ocorrências.
  const batchObject = await seedPhotoObject(database, { company, purpose: BATCH_PHOTO_PURPOSE })
  const batch = [
    await seeders.occurrence(batchObject, 6),
    await seeders.occurrence(batchObject, 7),
    await seeders.occurrence(batchObject, 8),
  ] as const
  const noPhoto = await seeders.occurrence(null, 9)
  // (f) o mesmo upload do motorista em duas ocorrências: `findConfirmedUpload` não o consome.
  const reusedUploadObject = await seeders.photo()
  const reusedUpload = [
    await seeders.occurrence(reusedUploadObject, 10),
    await seeders.occurrence(reusedUploadObject, 11),
  ] as const
  return {
    ...streetCases,
    ...warehouseCase,
    batch,
    batchObject,
    noPhoto,
    reusedUpload,
    reusedUploadObject,
  }
}
