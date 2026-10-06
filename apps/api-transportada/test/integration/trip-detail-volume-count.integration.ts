/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 D5/T2.3, contra Postgres real: `documents[].volumeCount` no detalhe da viagem é a soma de
 * `nfe_volumes.quantity` da nota; `null` sem linha de volume ou com soma fracionária; `0` com linhas somando zero. Uma
 * consulta agregada para a viagem inteira (não cresce com as notas) e recortada por empresa.
 */
import { describe, expect } from 'bun:test'

import { nfeVolumes } from '../../src/database/database.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { loadTripDocumentVolumeCounts } from '../../src/trips/infrastructure/trip-document-volume.query.js'
import {
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

async function seedVolumes(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly nfeDocumentId: string
    readonly quantities: readonly string[]
  },
): Promise<void> {
  if (input.quantities.length === 0) return
  await database.db.insert(nfeVolumes).values(
    input.quantities.map((quantity, index) => ({
      companyId: input.company.companyId,
      documentId: input.nfeDocumentId,
      ordinal: BigInt(index + 1),
      quantity,
    })),
  )
}

function countingDatabase(db: TestDatabase['db']): {
  readonly database: TestDatabase['db']
  readonly selectCount: () => number
} {
  let count = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'select') count += 1
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  return { database, selectCount: () => count }
}

describe('volumeCount no detalhe da viagem (spec 233 T2.3)', () => {
  testWithPostgres(
    'soma os volumes da nota; null sem linha de volume; 0 com linhas somando zero',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'draft')
        const withTwoRows = trip.documentId
        const withOneRow = await seedExtraDocument(database, company, trip, {
          separationStatus: 'pending',
          stopId: trip.stopId,
        })
        const withoutRows = await seedExtraDocument(database, company, trip, {
          separationStatus: 'pending',
          stopId: trip.stopId,
        })
        const withZeroSum = await seedExtraDocument(database, company, trip, {
          separationStatus: 'pending',
          stopId: trip.stopId,
        })
        const withFractionalSum = await seedExtraDocument(database, company, trip, {
          separationStatus: 'pending',
          stopId: trip.stopId,
        })
        const nfeIdOf = async (tripDocumentId: string): Promise<string> => {
          const detail = await new DrizzleTripRepository(database.db).findById({
            companyId: company.companyId,
            tripId: trip.tripId,
          })
          const nfeDocumentId = detail?.documents.find(
            (document) => document.id === tripDocumentId,
          )?.nfeDocumentId
          if (nfeDocumentId === null || nfeDocumentId === undefined) throw new Error('EXPECTED_NFE')
          return nfeDocumentId
        }
        await seedVolumes(database, {
          company,
          nfeDocumentId: await nfeIdOf(withTwoRows),
          quantities: ['3.0000', '4.0000'],
        })
        await seedVolumes(database, {
          company,
          nfeDocumentId: await nfeIdOf(withOneRow),
          quantities: ['5.0000'],
        })
        await seedVolumes(database, {
          company,
          nfeDocumentId: await nfeIdOf(withZeroSum),
          quantities: ['0.0000', '0.0000'],
        })

        await seedVolumes(database, {
          company,
          nfeDocumentId: await nfeIdOf(withFractionalSum),
          quantities: ['1.5000', '2.0000'],
        })

        const detail = await new DrizzleTripRepository(database.db).findById({
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        const byDocument = new Map(
          detail?.documents.map((document) => [document.id, document.volumeCount]),
        )

        expect(byDocument.get(withTwoRows)).toBe(7)
        expect(byDocument.get(withOneRow)).toBe(5)
        expect(byDocument.get(withoutRows)).toBeNull()
        expect(byDocument.get(withZeroSum)).toBe(0)
        // Revisão M5: qVol fracionário não é "número de volumes" — sai null, nunca arredondado.
        expect(byDocument.get(withFractionalSum)).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'issues the same number of selects for 1 note as for 12 notes',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const smallTrip = await seedTrip(database, company, 'draft')
        const largeTrip = await seedTrip(database, company, 'draft')
        for (let index = 0; index < 11; index += 1) {
          await seedExtraDocument(database, company, largeTrip, {
            separationStatus: 'pending',
            stopId: largeTrip.stopId,
          })
        }
        const { database: counted, selectCount } = countingDatabase(database.db)
        const repository = new DrizzleTripRepository(counted)

        const small = await repository.findById({
          companyId: company.companyId,
          tripId: smallTrip.tripId,
        })
        const smallSelectCount = selectCount()
        const large = await repository.findById({
          companyId: company.companyId,
          tripId: largeTrip.tripId,
        })
        const largeSelectCount = selectCount() - smallSelectCount

        expect(small?.documents).toHaveLength(1)
        expect(large?.documents).toHaveLength(12)
        expect(largeSelectCount).toBe(smallSelectCount)
      })
    },
    60_000,
  )

  testWithPostgres(
    'never reads the volumes of another company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedCompany(database)
        const stranger = await seedCompany(database)
        const trip = await seedTrip(database, owner, 'draft')
        const detail = await new DrizzleTripRepository(database.db).findById({
          companyId: owner.companyId,
          tripId: trip.tripId,
        })
        const nfeDocumentId = detail?.documents[0]?.nfeDocumentId
        if (nfeDocumentId === null || nfeDocumentId === undefined) throw new Error('EXPECTED_NFE')
        await seedVolumes(database, { company: owner, nfeDocumentId, quantities: ['9.0000'] })

        const asOwner = await loadTripDocumentVolumeCounts(database.db, {
          companyId: owner.companyId,
          nfeDocumentIds: [nfeDocumentId],
        })
        const asStranger = await loadTripDocumentVolumeCounts(database.db, {
          companyId: stranger.companyId,
          nfeDocumentIds: [nfeDocumentId],
        })
        const strangerDetail = await new DrizzleTripRepository(database.db).findById({
          companyId: stranger.companyId,
          tripId: trip.tripId,
        })

        expect(asOwner.get(nfeDocumentId)).toBe(9)
        expect(asStranger.size).toBe(0)
        expect(strangerDetail).toBeNull()
      })
    },
    60_000,
  )
})
