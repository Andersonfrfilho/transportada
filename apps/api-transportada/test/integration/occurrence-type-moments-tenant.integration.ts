/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão final, B1), contra Postgres real e com **duas empresas**: a leitura em lote dos
 * momentos (`readOccurrenceTypeMoments`) prende `company_id`. Sem o filtro, perguntar pelo id de um tipo
 * de outra empresa devolveria o conjunto dela — e o id de um tipo é dado que circula (URL, corpo). A FK
 * composta impede a linha de uma empresa apontar para o tipo de outra, mas não impede a leitura cruzada.
 */
import { describe, expect } from 'bun:test'

import {
  OCCURRENCE_MOMENT,
  type OccurrenceMoment,
} from '../../src/shared/trip-occurrence.constant.js'
import {
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { readOccurrenceTypeMoments } from '../../src/trips/infrastructure/occurrence-type-moments.query.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function seedTypeWithMoments(
  database: TestDatabase,
  company: Company,
  moments: readonly OccurrenceMoment[],
): Promise<string> {
  const saved = await saveOccurrenceType(database.db, {
    active: true,
    companyId: company.companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    moments,
    name: `Tipo ${moments.join('+')}`,
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  return saved.id
}

describe('os momentos do tipo respeitam a empresa (spec 246, revisão final B1)', () => {
  testWithPostgres(
    'perguntar pelo tipo de outra empresa devolve vazio; cada empresa lê só o seu',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyA = await seedCompany(database)
        const companyB = await seedCompany(database)
        const typeA = await seedTypeWithMoments(database, companyA, [
          OCCURRENCE_MOMENT.document,
          OCCURRENCE_MOMENT.office,
        ])
        const typeB = await seedTypeWithMoments(database, companyB, [OCCURRENCE_MOMENT.document])

        const ownRead = await readOccurrenceTypeMoments(database.db, {
          companyId: companyA.companyId,
          occurrenceTypeIds: [typeA],
        })
        expect([...(ownRead.get(typeA) ?? [])].sort()).toEqual(['document', 'office'])

        const crossRead = await readOccurrenceTypeMoments(database.db, {
          companyId: companyB.companyId,
          occurrenceTypeIds: [typeA, typeB],
        })
        expect(crossRead.has(typeA)).toBe(false)
        expect([...(crossRead.get(typeB) ?? [])]).toEqual(['document'])

        const listedForB = await listOccurrenceTypes(database.db, {
          companyId: companyB.companyId,
        })
        expect(listedForB.map((type) => type.id)).toEqual([typeB])
      })
    },
    60_000,
  )
})
