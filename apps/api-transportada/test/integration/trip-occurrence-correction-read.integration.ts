/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 RF9 (T0.3), contra Postgres real: as três leituras publicam o que a spec 167 grava. O
 * detalhe e a lista da nota devolvem `corrections` (mais antiga primeiro) e `cancellation`; o feed
 * devolve `cancellation`. A ocorrência cancelada continua nas três, marcada — nunca filtrada.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { nfeProducts } from '../../src/database/nfe.schema.js'
import { companyOccurrenceTypes, tripDocuments } from '../../src/database/trip.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { cancelOccurrence } from '../../src/trips/application/cancel-occurrence.use-case.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { listTripOccurrences } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
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

const CANCELLATION_REASON = 'registrada na nota errada'

async function seedOccurrenceType(database: TestDatabase, company: Company): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    allowsMultipleItems: true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'separation',
  })
  return id
}

async function seedDocumentProducts(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<void> {
  const [document] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  const nfeDocumentId = document?.nfeDocumentId
  if (nfeDocumentId === undefined || nfeDocumentId === null) throw new Error('EXPECTED_DOCUMENT')
  await database.db.insert(nfeProducts).values(
    ['ITEM-A', 'ITEM-B'].map((code, index) => ({
      cfop: '5102',
      code,
      commercialUnit: 'CX',
      companyId: company.companyId,
      description: `Produto ${code}`,
      documentId: nfeDocumentId,
      ncm: '69089000',
      ordinal: BigInt(index + 1),
      quantity: '10',
      totalValue: '500',
      unitValue: '50',
    })),
  )
}

async function registerWholeDocumentOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
): Promise<string> {
  const saved = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'unset',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (saved === null) throw new Error('EXPECTED_OCCURRENCE')
  return saved.id
}

function correctItems(
  database: TestDatabase,
  company: Company,
  occurrenceId: string,
  productCodes: readonly string[],
): Promise<unknown> {
  return correctOccurrenceItems({
    actorUserId: company.userId,
    companyId: company.companyId,
    occurrenceId,
    productCode: '',
    productCodes,
    unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
  })
}

type SeededScenario = {
  readonly cancelledId: string
  readonly company: Company
  readonly correctedId: string
  readonly plainId: string
  readonly trip: SeededTrip
}

/** Uma corrigida duas vezes, uma cancelada, uma intocada — na mesma nota. */
async function seedScenario(database: TestDatabase): Promise<SeededScenario> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const occurrenceTypeId = await seedOccurrenceType(database, company)
  await seedDocumentProducts(database, company, trip)

  const correctedId = await registerWholeDocumentOccurrence(
    database,
    company,
    trip,
    occurrenceTypeId,
  )
  await correctItems(database, company, correctedId, ['ITEM-A'])
  await correctItems(database, company, correctedId, ['ITEM-A', 'ITEM-B'])

  const cancelledId = await registerWholeDocumentOccurrence(
    database,
    company,
    trip,
    occurrenceTypeId,
  )
  await cancelOccurrence({
    actorUserId: company.userId,
    companyId: company.companyId,
    occurrenceId: cancelledId,
    reason: CANCELLATION_REASON,
    unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
  })

  const plainId = await registerWholeDocumentOccurrence(database, company, trip, occurrenceTypeId)
  return { cancelledId, company, correctedId, plainId, trip }
}

describe('leituras publicam correção e cancelamento (spec 235 RF9)', () => {
  testWithPostgres(
    'detalhe: duas correções, mais antiga primeiro, e cancellation nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, correctedId } = await seedScenario(database)

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: company.companyId,
          occurrenceId: correctedId,
        })

        expect(detail?.cancellation).toBeNull()
        expect(detail?.corrections).toHaveLength(2)
        expect(detail?.corrections[0]?.previousItems).toEqual([])
        expect(detail?.corrections[1]?.previousItems).toEqual([
          { code: 'ITEM-A', quantity: null, unit: null },
        ])
        const [first, second] = detail?.corrections ?? []
        expect(Date.parse(first?.correctedAt ?? '')).toBeLessThanOrEqual(
          Date.parse(second?.correctedAt ?? ''),
        )
        expect(Object.keys(first ?? {}).sort()).toEqual([
          'correctedAt',
          'correctedByName',
          'previousItems',
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'detalhe: a cancelada continua lida, com cancellation preenchido',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, cancelledId } = await seedScenario(database)

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: company.companyId,
          occurrenceId: cancelledId,
        })

        expect(detail?.id).toBe(cancelledId)
        expect(detail?.corrections).toEqual([])
        expect(detail?.cancellation?.reason).toBe(CANCELLATION_REASON)
        expect(detail?.cancellation?.cancelledByName).toBeNull()
        expect(Object.keys(detail?.cancellation ?? {}).sort()).toEqual([
          'cancelledAt',
          'cancelledByName',
          'reason',
        ])
        expect(Number.isNaN(Date.parse(detail?.cancellation?.cancelledAt ?? ''))).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'lista da nota: corrections e cancellation por ocorrência, cancelada incluída',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { cancelledId, company, correctedId, plainId, trip } = await seedScenario(database)

        const rows = await listTripOccurrences(database.db, {
          companyId: company.companyId,
          documentId: trip.documentId,
          tripId: trip.tripId,
        })

        expect(rows.map((row) => row.id).sort()).toEqual([cancelledId, correctedId, plainId].sort())
        const byId = new Map(rows.map((row) => [row.id, row]))
        expect(byId.get(correctedId)?.corrections).toHaveLength(2)
        expect(byId.get(correctedId)?.corrections[0]?.previousItems).toEqual([])
        expect(byId.get(correctedId)?.cancellation).toBeNull()
        expect(byId.get(cancelledId)?.cancellation?.reason).toBe(CANCELLATION_REASON)
        expect(byId.get(cancelledId)?.corrections).toEqual([])
        expect(byId.get(plainId)?.corrections).toEqual([])
        expect(byId.get(plainId)?.cancellation).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'feed: cancellation na cancelada e nulo nas demais; a cancelada continua listada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { cancelledId, company, correctedId, plainId } = await seedScenario(database)

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 25,
          order: 'desc',
        })

        const byId = new Map(page.items.map((item) => [item.id, item]))
        expect([...byId.keys()].sort()).toEqual([cancelledId, correctedId, plainId].sort())
        expect(byId.get(cancelledId)?.cancellation?.reason).toBe(CANCELLATION_REASON)
        expect(byId.get(correctedId)?.cancellation).toBeNull()
        expect(byId.get(plainId)?.cancellation).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'a leitura nunca cruza empresa: outra empresa não vê correção nem cancelamento',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { correctedId } = await seedScenario(database)
        const other = await seedCompany(database)

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: other.companyId,
          occurrenceId: correctedId,
        })
        expect(detail).toBeNull()
      })
    },
    60_000,
  )
})
