/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T2.1, contra Postgres real: bairro e cidade da parada vêm do endereço do destinatário da nota (iniciais
 * maiúsculas), a nota sem endereço deixa a parada sem eles, a coordenada é a da parada — tudo em UMA consulta.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq, inArray } from 'drizzle-orm'

import { nfeAddresses, nfeParticipants } from '../../src/database/nfe.schema.js'
import { placeStops } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-place.reader.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { CAMPINAS } from '../fixtures/trip-delivery-deadline-seed.fixture.js'
import { seedTripWithStops } from '../fixtures/trip-holiday-warning-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId

function countingDatabase(db: TestDatabase['db']) {
  let count = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'select' || property === 'execute') count += 1
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  return { database, queryCount: () => count }
}

async function recipientParticipantIds(database: TestDatabase, documentIds: readonly string[]) {
  const rows = await database.db
    .select({ id: nfeParticipants.id })
    .from(nfeParticipants)
    .where(
      and(
        eq(nfeParticipants.companyId, COMPANY_ID),
        eq(nfeParticipants.role, 'recipient'),
        inArray(nfeParticipants.documentId, [...documentIds]),
      ),
    )
  return rows.map((row) => row.id)
}

describe('bairro, cidade e coordenada da parada do bot (spec 300 T2.1)', () => {
  testWithPostgres(
    'a nota com endereço dá bairro e cidade em iniciais maiúsculas; sem endereço a parada fica sem eles',
    async () => {
      await withCargoDatabase(async (database) => {
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
          ],
        })
        const [withAddress, withoutAddress, withoutDistrict] = seeded.documentIds as [
          readonly string[],
          readonly string[],
          readonly string[],
        ]
        await database.db
          .update(nfeAddresses)
          .set({ city: 'SAO JOAQUIM DA BARRA', district: 'CENTRO' })
          .where(
            inArray(
              nfeAddresses.participantId,
              await recipientParticipantIds(database, withAddress),
            ),
          )
        await database.db
          .delete(nfeAddresses)
          .where(
            inArray(
              nfeAddresses.participantId,
              await recipientParticipantIds(database, withoutAddress),
            ),
          )
        await database.db
          .update(nfeAddresses)
          .set({ city: 'RIBEIRAO PRETO', district: null })
          .where(
            inArray(
              nfeAddresses.participantId,
              await recipientParticipantIds(database, withoutDistrict),
            ),
          )
        const [first, second, third] = seeded.stopIds as [string, string, string]
        const counting = countingDatabase(database.db)

        const placed = await placeStops(counting.database, {
          companyId: COMPANY_ID,
          stops: [
            { id: first, latitude: '-20.5900000', longitude: '-47.8800000' },
            { id: second, latitude: null, longitude: null },
            { id: third, latitude: '-21.1700000', longitude: '-47.8100000' },
          ],
        })

        expect(placed).toEqual([
          {
            city: 'Sao Joaquim da Barra',
            coordinate: { latitude: -20.59, longitude: -47.88 },
            district: 'Centro',
            id: first,
            latitude: '-20.5900000',
            longitude: '-47.8800000',
          },
          { id: second, latitude: null, longitude: null },
          {
            city: 'Ribeirao Preto',
            coordinate: { latitude: -21.17, longitude: -47.81 },
            id: third,
            latitude: '-21.1700000',
            longitude: '-47.8100000',
          },
        ])
        expect(counting.queryCount()).toBe(1)
      })
    },
    60_000,
  )
})
