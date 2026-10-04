/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (RF5, CA04), contra Postgres real: o detalhe, o feed, a lista da nota e o cadastro
 * publicam o `itemsMode` do tipo ATUAL da empresa do token. A ocorrência de parada sai com `null`,
 * e tipo de outra empresa nunca entra na leitura — `trip_document_occurrences.occurrence_type_id`
 * não tem FK, então a junção por `(company_id, id)` é a única barreira.
 */
import { describe, expect } from 'bun:test'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripStopOccurrences,
} from '../../src/database/trip.schema.js'
import {
  listOccurrenceTypes,
  listTripOccurrences,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { listOccurrenceTypeItemsShapesByIds } from '../../src/trips/infrastructure/occurrence-type-items-read.query.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import {
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

async function seedType(
  database: TestDatabase,
  company: Company,
  input: {
    readonly allowsMultipleItems: boolean
    readonly itemsMode: 'off' | 'optional'
    readonly name: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    allowsMultipleItems: input.allowsMultipleItems,
    companyId: company.companyId,
    id,
    itemsMode: input.itemsMode,
    name: input.name,
    notifies: false,
    stage: 'delivery',
  })
  return id
}

async function seedOccurrence(
  database: TestDatabase,
  company: Company,
  input: { readonly occurrenceTypeId: string; readonly trip: SeededTrip },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripDocumentOccurrences).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    id,
    occurrenceTypeId: input.occurrenceTypeId,
    stage: 'delivery',
    tripDocumentId: input.trip.documentId,
  })
  return id
}

describe('as leituras publicam o modo de itens do tipo (spec 241 RF5, CA04)', () => {
  testWithPostgres('detalhe, feed, lista da nota e cadastro leem o tipo da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const otherCompany = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const offTypeId = await seedType(database, company, {
        allowsMultipleItems: false,
        itemsMode: 'off',
        name: 'Cliente pediu prorrogação do boleto',
      })
      const optionalTypeId = await seedType(database, company, {
        allowsMultipleItems: true,
        itemsMode: 'optional',
        name: 'Avaria',
      })
      await seedType(database, otherCompany, {
        allowsMultipleItems: true,
        itemsMode: 'optional',
        name: 'Cliente pediu prorrogação do boleto',
      })
      const offOccurrenceId = await seedOccurrence(database, company, {
        occurrenceTypeId: offTypeId,
        trip,
      })
      const optionalOccurrenceId = await seedOccurrence(database, company, {
        occurrenceTypeId: optionalTypeId,
        trip,
      })
      const stopOccurrenceId = crypto.randomUUID()
      await database.db.insert(tripStopOccurrences).values({
        actorUserId: company.userId,
        channel: 'driver_app',
        companyId: company.companyId,
        description: 'doca fechada',
        id: stopOccurrenceId,
        kind: 'dock_closed',
        stopId: trip.stopId,
      })

      const noteList = await listTripOccurrences(database.db, {
        companyId: company.companyId,
        documentId: trip.documentId,
        tripId: trip.tripId,
      })
      const feed = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        limit: 20,
        order: 'desc',
      })
      const detail = await findTripOccurrenceDetail(database.db, {
        companyId: company.companyId,
        occurrenceId: offOccurrenceId,
      })
      const types = await listOccurrenceTypes(database.db, { companyId: company.companyId })

      const noteOff = noteList.find((item) => item.id === offOccurrenceId)
      const noteOptional = noteList.find((item) => item.id === optionalOccurrenceId)
      expect(noteList).toHaveLength(2)
      expect(noteOff?.occurrenceTypeId).toBe(offTypeId)
      expect(noteOff?.typeItemsMode).toBe('off')
      expect(noteOff?.typeAllowsMultipleItems).toBe(false)
      expect(noteOptional?.occurrenceTypeId).toBe(optionalTypeId)
      expect(noteOptional?.typeItemsMode).toBe('optional')
      expect(noteOptional?.typeAllowsMultipleItems).toBe(true)

      const feedOff = feed.items.find((item) => item.id === offOccurrenceId)
      const feedOptional = feed.items.find((item) => item.id === optionalOccurrenceId)
      const feedStop = feed.items.find((item) => item.id === stopOccurrenceId)
      expect(feed.items).toHaveLength(3)
      expect(feedOff?.occurrenceTypeId).toBe(offTypeId)
      expect(feedOff?.typeItemsMode).toBe('off')
      expect(feedOff?.typeAllowsMultipleItems).toBe(false)
      expect(feedOptional?.typeItemsMode).toBe('optional')
      expect(feedOptional?.typeAllowsMultipleItems).toBe(true)
      expect(feedStop?.occurrenceTypeId).toBeNull()
      expect(feedStop?.typeItemsMode).toBeNull()
      expect(feedStop?.typeAllowsMultipleItems).toBeNull()

      expect(detail?.occurrenceTypeId).toBe(offTypeId)
      expect(detail?.typeItemsMode).toBe('off')
      expect(detail?.typeAllowsMultipleItems).toBe(false)

      expect(types).toHaveLength(2)
      expect(types.find((type) => type.id === offTypeId)?.itemsMode).toBe('off')
      expect(types.find((type) => type.id === optionalTypeId)?.itemsMode).toBe('optional')
    })
  })

  testWithPostgres(
    'tipo de outra empresa não entra: ids reais com o companyId alheio voltam vazios',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const foreignTypeId = await seedType(database, otherCompany, {
          allowsMultipleItems: true,
          itemsMode: 'off',
          name: 'Tipo alheio',
        })
        const ownTypeId = await seedType(database, company, {
          allowsMultipleItems: true,
          itemsMode: 'optional',
          name: 'Tipo próprio',
        })

        const crossRead = await listOccurrenceTypeItemsShapesByIds(database.db, {
          companyId: company.companyId,
          occurrenceTypeIds: [foreignTypeId, ownTypeId],
        })
        const emptyRead = await listOccurrenceTypeItemsShapesByIds(database.db, {
          companyId: company.companyId,
          occurrenceTypeIds: [],
        })

        expect(crossRead.size).toBe(1)
        expect(crossRead.get(ownTypeId)?.itemsMode).toBe('optional')
        expect(crossRead.has(foreignTypeId)).toBe(false)
        expect(emptyRead.size).toBe(0)

        /** Sem FK na ocorrência de nota, a linha pode apontar para o tipo alheio: nunca vaza o modo. */
        const strayOccurrenceId = await seedOccurrence(database, company, {
          occurrenceTypeId: foreignTypeId,
          trip,
        })
        const noteList = await listTripOccurrences(database.db, {
          companyId: company.companyId,
          documentId: trip.documentId,
          tripId: trip.tripId,
        })
        expect(
          noteList.find((item) => item.id === strayOccurrenceId)?.typeItemsMode ?? null,
        ).toBeNull()
      })
    },
  )
})
