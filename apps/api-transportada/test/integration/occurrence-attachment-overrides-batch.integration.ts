/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3-api (RF11c), contra Postgres real: a leitura em lote das exceções devolve todos os
 * tipos da empresa do token (ativos e aposentados), cada um com as suas exceções, nunca as de outra
 * empresa, e custa o mesmo número de consultas com 1 ou com 3 tipos.
 */
import { describe, expect } from 'bun:test'

import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { listOccurrenceAttachmentOverridesByType } from '../../src/trips/application/list-occurrence-attachment-overrides.use-case.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import { listOccurrenceTypeIds } from '../../src/trips/infrastructure/occurrence-type-ids-read.query.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const RECIPIENT_TAX_ID = '12345678000190'

async function seedType(
  database: TestDatabase,
  company: Company,
  input: { readonly active?: boolean; readonly name: string },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: input.active ?? true,
    companyId: company.companyId,
    id,
    name: input.name,
    notifies: false,
    stage: 'delivery',
  })
  return id
}

async function seedOverrides(
  database: TestDatabase,
  company: Company,
  occurrenceTypeId: string,
): Promise<{ readonly contractorId: string }> {
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    id: contractorId,
    taxId: String(Math.floor(Math.random() * 1e14)).padStart(14, '1'),
  })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: RECIPIENT_TAX_ID })
  const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
  const scope = { companyId: company.companyId, occurrenceTypeId }
  await repository.replaceContractorOverrides({
    ...scope,
    overrides: [{ attachmentMode: 'required', contractorId, noteMode: null, photoMinimumCount: 2 }],
  })
  await repository.replaceRecipientOverrides({
    ...scope,
    overrides: [{ attachmentMode: 'off', signatureMode: 'required', taxId: RECIPIENT_TAX_ID }],
  })
  return { contractorId }
}

function readBatch(database: Pick<TestDatabase, 'db'>['db'], companyId: string) {
  const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database)
  return listOccurrenceAttachmentOverridesByType({
    companyId,
    port: {
      listOccurrenceTypeIds: (query) => listOccurrenceTypeIds(database, query),
      listOverridesForTypes: (query) => repository.listOverridesForTypes(query),
    },
  })
}

function countSelects(database: TestDatabase): {
  readonly counting: TestDatabase['db']
  readonly reset: () => number
} {
  let selectCount = 0
  const counting = new Proxy(database.db, {
    get: (target, property, receiver) => {
      if (property !== 'select') return Reflect.get(target, property, receiver) as unknown
      return (...args: Parameters<typeof target.select>) => {
        selectCount += 1
        return target.select(...args)
      }
    },
  })
  return {
    counting,
    reset: () => {
      const total = selectCount
      selectCount = 0
      return total
    },
  }
}

describe('exceções de exigência em lote (spec 246 T5.3-api, RF11c)', () => {
  testWithPostgres(
    'agrupa por tipo, inclui o inativo e o tipo sem exceção, e não vaza para outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyA = await seedCompany(database)
        const companyB = await seedCompany(database)
        const typeWithOverrides = await seedType(database, companyA, { name: 'Recusa' })
        const retiredType = await seedType(database, companyA, { active: false, name: 'Antiga' })
        const bareType = await seedType(database, companyA, { name: 'Sem exceção' })
        const foreignType = await seedType(database, companyB, { name: 'De outra empresa' })
        const { contractorId } = await seedOverrides(database, companyA, typeWithOverrides)
        await seedOverrides(database, companyB, foreignType)

        const resultA = await readBatch(database.db, companyA.companyId)
        const resultB = await readBatch(database.db, companyB.companyId)

        expect(resultA.overridesByType.map((group) => group.occurrenceTypeId).sort()).toEqual(
          [typeWithOverrides, retiredType, bareType].sort(),
        )
        const grouped = resultA.overridesByType.find(
          (group) => group.occurrenceTypeId === typeWithOverrides,
        )
        expect(grouped?.contractorOverrides).toEqual([
          {
            attachmentMode: 'required',
            contractorId,
            itemsMinimumCount: null,
            itemsMode: null,
            noteMode: null,
            photoMinimumCount: 2,
            signatureMode: null,
          },
        ])
        expect(grouped?.recipientOverrides).toMatchObject([
          { attachmentMode: 'off', signatureMode: 'required', taxId: RECIPIENT_TAX_ID },
        ])
        for (const emptyType of [retiredType, bareType]) {
          expect(
            resultA.overridesByType.find((group) => group.occurrenceTypeId === emptyType),
          ).toEqual({
            contractorOverrides: [],
            occurrenceTypeId: emptyType,
            recipientOverrides: [],
          })
        }
        expect(resultB.overridesByType.map((group) => group.occurrenceTypeId)).toEqual([
          foreignType,
        ])
        expect(JSON.stringify(resultA)).not.toContain(foreignType)
      })
    },
  )

  testWithPostgres('o número de consultas não cresce com o número de tipos', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const first = await seedType(database, company, { name: 'A' })
      await seedOverrides(database, company, first)
      const { counting, reset } = countSelects(database)

      reset()
      await readBatch(counting, company.companyId)
      const selectsWithOneType = reset()

      await seedType(database, company, { name: 'B' })
      await seedType(database, company, { name: 'C' })
      await seedType(database, company, { name: 'D' })
      reset()
      const result = await readBatch(counting, company.companyId)
      const selectsWithThreeTypes = reset()

      expect(result.overridesByType).toHaveLength(4)
      expect(selectsWithOneType).toBe(3)
      expect(selectsWithThreeTypes).toBe(selectsWithOneType)
    })
  })
})
