/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.3 (ADR-0107): o escopo de contratantes do tipo de ocorrência, contra um Postgres de
 * verdade. Grava `listed` com a lista, mantém quando o `PUT` não manda as chaves, troca para `all`
 * apagando a lista, e recusa lista vazia, par incompleto, tipo só de parada e contratante de outra empresa.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyOccurrenceTypeContractors } from '../../src/database/occurrence-type-contractor.schema.js'
import { ContractorNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  OccurrenceTypeContractorScopeEmptyError,
  OccurrenceTypeContractorScopeInvalidError,
  OccurrenceTypeContractorScopeNeedsDocumentError,
} from '../../src/trips/domain/occurrence-type-contractor-scope.error.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { toOccurrenceTypeSettingsViews } from '../../src/trips/infrastructure/occurrence-type-contractors.query.js'
import { seedContractor } from '../fixtures/trip-report-database.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 60_000

function buildValues(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailTemplateKey: null,
    flow: 'document',
    name: 'Procedimento da contratante',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

function save(database: TestDatabase, companyId: string, values: SaveOccurrenceTypeValues) {
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (toSave) => saveOccurrenceType(database.db, { ...toSave, companyId }),
    templates: { hasActiveEmailTemplate: async () => true },
    values,
  })
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

async function countListRows(database: TestDatabase, occurrenceTypeId: string): Promise<number> {
  const rows = await database.db
    .select()
    .from(companyOccurrenceTypeContractors)
    .where(eq(companyOccurrenceTypeContractors.occurrenceTypeId, occurrenceTypeId))
  return rows.length
}

describe('the contractor scope of the occurrence type (spec 270 T2.3)', () => {
  testWithPostgres(
    'a new type is all, saves listed with the list, keeps it when the keys are absent and clears it on all',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const zaragoza = await seedContractor(database, {
          companyId,
          displayName: 'COMERCIAL ZARAGOZA',
          taxId: '11111111000111',
        })
        const riber = await seedContractor(database, {
          companyId,
          displayName: 'RIBER PET',
          taxId: '22222222000122',
        })

        const created = await save(database, companyId, buildValues())
        expect(created.contractorScope).toBe('all')
        expect(created.contractorIds).toEqual([])

        const listed = await save(
          database,
          companyId,
          buildValues({
            contractorIds: [riber, zaragoza],
            contractorScope: 'listed',
            occurrenceTypeId: created.id,
          }),
        )
        expect(listed.contractorScope).toBe('listed')
        expect([...(listed.contractorIds ?? [])].toSorted()).toEqual([riber, zaragoza].toSorted())

        const [view] = await toOccurrenceTypeSettingsViews(database.db, {
          companyId,
          records: await listOccurrenceTypes(database.db, { companyId }),
        })
        expect(view?.contractorScope).toBe('listed')
        expect(view?.contractors.map((contractor) => contractor.displayName)).toEqual([
          'COMERCIAL ZARAGOZA',
          'RIBER PET',
        ])
        expect(view?.contractors[0]).toEqual({
          displayName: 'COMERCIAL ZARAGOZA',
          id: zaragoza,
          status: 'active',
          taxId: '11111111000111',
        })
        expect(view).not.toHaveProperty('contractorIds')

        await save(
          database,
          companyId,
          buildValues({ name: 'Só o nome mudou', occurrenceTypeId: created.id }),
        )
        const kept = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(kept?.contractorScope).toBe('listed')
        expect(kept?.contractorIds).toHaveLength(2)

        const cleared = await save(
          database,
          companyId,
          buildValues({
            contractorIds: [],
            contractorScope: 'all',
            occurrenceTypeId: created.id,
          }),
        )
        expect(cleared.contractorScope).toBe('all')
        expect(await countListRows(database, created.id)).toBe(0)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'refuses an empty list, an incomplete pair, all with a list and a stop-only type — nothing is written',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const zaragoza = await seedContractor(database, {
          companyId,
          displayName: 'COMERCIAL ZARAGOZA',
          taxId: '11111111000111',
        })
        const created = await save(database, companyId, buildValues())

        const refusals = await Promise.all([
          captureError(() =>
            save(
              database,
              companyId,
              buildValues({
                contractorIds: [],
                contractorScope: 'listed',
                occurrenceTypeId: created.id,
              }),
            ),
          ),
          captureError(() =>
            save(
              database,
              companyId,
              buildValues({ contractorScope: 'listed', occurrenceTypeId: created.id }),
            ),
          ),
          captureError(() =>
            save(
              database,
              companyId,
              buildValues({ contractorIds: [zaragoza], occurrenceTypeId: created.id }),
            ),
          ),
          captureError(() =>
            save(
              database,
              companyId,
              buildValues({
                contractorIds: [zaragoza],
                contractorScope: 'all',
                occurrenceTypeId: created.id,
              }),
            ),
          ),
          captureError(() =>
            save(
              database,
              companyId,
              buildValues({
                contractorIds: [zaragoza],
                contractorScope: 'listed',
                moments: ['stop'],
                occurrenceTypeId: created.id,
              }),
            ),
          ),
        ])

        expect(refusals[0]).toBeInstanceOf(OccurrenceTypeContractorScopeEmptyError)
        expect(refusals[1]).toBeInstanceOf(OccurrenceTypeContractorScopeInvalidError)
        expect(refusals[2]).toBeInstanceOf(OccurrenceTypeContractorScopeInvalidError)
        expect(refusals[3]).toBeInstanceOf(OccurrenceTypeContractorScopeInvalidError)
        expect(refusals[4]).toBeInstanceOf(OccurrenceTypeContractorScopeNeedsDocumentError)
        const stored = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(stored?.contractorScope).toBe('all')
        expect(stored?.moments).toEqual(['document', 'office'])
        expect(await countListRows(database, created.id)).toBe(0)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'moving a listed type to stop only is refused in the transaction and rolls the whole save back',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const zaragoza = await seedContractor(database, {
          companyId,
          displayName: 'COMERCIAL ZARAGOZA',
          taxId: '11111111000111',
        })
        const created = await save(database, companyId, buildValues())
        await save(
          database,
          companyId,
          buildValues({
            contractorIds: [zaragoza],
            contractorScope: 'listed',
            occurrenceTypeId: created.id,
          }),
        )

        const refusal = await captureError(() =>
          save(
            database,
            companyId,
            buildValues({ moments: ['stop'], name: 'Virou parada', occurrenceTypeId: created.id }),
          ),
        )

        expect(refusal).toBeInstanceOf(OccurrenceTypeContractorScopeNeedsDocumentError)
        const stored = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(stored?.name).toBe('Procedimento da contratante')
        expect(stored?.moments).toEqual(['document', 'office'])
        expect(stored?.contractorScope).toBe('listed')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a contractor from another company, or one that does not exist, is the same 404 and nothing is written',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        const foreign = await seedContractor(database, {
          companyId: other.companyId,
          displayName: 'OUTRA EMPRESA',
          taxId: '33333333000133',
        })
        const created = await save(database, companyId, buildValues())

        const foreignRefusal = await captureError(() =>
          save(
            database,
            companyId,
            buildValues({
              contractorIds: [foreign],
              contractorScope: 'listed',
              occurrenceTypeId: created.id,
            }),
          ),
        )
        const missingRefusal = await captureError(() =>
          save(
            database,
            companyId,
            buildValues({
              contractorIds: [crypto.randomUUID()],
              contractorScope: 'listed',
              occurrenceTypeId: created.id,
            }),
          ),
        )

        expect(foreignRefusal).toBeInstanceOf(ContractorNotFoundError)
        expect(missingRefusal).toBeInstanceOf(ContractorNotFoundError)
        const stored = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(stored?.contractorScope).toBe('all')
        expect(await countListRows(database, created.id)).toBe(0)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
