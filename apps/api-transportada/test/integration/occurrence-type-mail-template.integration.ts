/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.4 (ADR-0106): o tipo de ocorrência escolhe o modelo `occurrence` do cadastro de modelos.
 * Contra um Postgres de verdade: a escolha grava, fica quando o PUT não a manda, limpa com `null`, e o
 * modelo precisa ser da empresa, do tipo `occurrence` e ativo.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { ContractorMailTemplateNotUsableError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { seedOccurrenceMailTemplate } from '../fixtures/occurrence-mail-template.fixture.js'
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
    templates: {
      findContractorTemplate: async () => null,
      hasActiveEmailTemplate: async () => true,
    },
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

async function readSelectedAt(
  database: TestDatabase,
  companyId: string,
  occurrenceTypeId: string,
): Promise<Date | null | undefined> {
  const [row] = await database.db
    .select({ selectedAt: companyOccurrenceTypes.contractorMailTemplateSelectedAt })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrenceTypeId),
      ),
    )
  return row?.selectedAt
}

describe('the mail template of the occurrence type (spec 269 T2.4)', () => {
  testWithPostgres(
    'stamps the selection moment on any change to a non-null template, keeps it otherwise and clears it with null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const { companyId } = company
        const first = await seedOccurrenceMailTemplate(database, company)
        const second = await seedOccurrenceMailTemplate(database, company, { name: 'Outro modelo' })

        const created = await saveThroughUseCase(database, companyId, buildValues())
        expect(await readSelectedAt(database, companyId, created.id)).toBeNull()

        const before = Date.now()
        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorMailTemplateId: first, occurrenceTypeId: created.id }),
        )
        const selectedAt = await readSelectedAt(database, companyId, created.id)
        expect(selectedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000)

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({
            contractorMailTemplateId: first,
            name: 'Só o nome mudou',
            occurrenceTypeId: created.id,
          }),
        )
        expect(await readSelectedAt(database, companyId, created.id)).toEqual(selectedAt!)

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ name: 'Sem o campo', occurrenceTypeId: created.id }),
        )
        expect(await readSelectedAt(database, companyId, created.id)).toEqual(selectedAt!)

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorMailTemplateId: second, occurrenceTypeId: created.id }),
        )
        const reselected = await readSelectedAt(database, companyId, created.id)
        expect(reselected!.getTime()).toBeGreaterThan(selectedAt!.getTime())

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorMailTemplateId: null, occurrenceTypeId: created.id }),
        )
        expect(await readSelectedAt(database, companyId, created.id)).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a type created already with a template is stamped at creation',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const templateId = await seedOccurrenceMailTemplate(database, company)

        const created = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ contractorMailTemplateId: templateId }),
        )

        expect(await readSelectedAt(database, company.companyId, created.id)).toBeInstanceOf(Date)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'writes, keeps on a PUT without it, clears with null and reads on get and list',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const templateId = await seedOccurrenceMailTemplate(database, company)

        const created = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ contractorMailTemplateId: templateId }),
        )
        expect(created.contractorMailTemplateId).toBe(templateId)

        const renamed = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ name: 'Devolução parcial (SAC)', occurrenceTypeId: created.id }),
        )
        expect(renamed.contractorMailTemplateId).toBe(templateId)

        const read = await findOccurrenceType(database.db, {
          companyId: company.companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (
          await listOccurrenceTypes(database.db, { companyId: company.companyId })
        ).find((type) => type.id === created.id)
        expect(read?.contractorMailTemplateId).toBe(templateId)
        expect(listed?.contractorMailTemplateId).toBe(templateId)

        const cleared = await saveThroughUseCase(
          database,
          company.companyId,
          buildValues({ contractorMailTemplateId: null, occurrenceTypeId: created.id }),
        )
        expect(cleared.contractorMailTemplateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a type created without the field has no template',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)

        const created = await saveThroughUseCase(database, company.companyId, buildValues())

        expect(created.contractorMailTemplateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'refuses a template that is missing, of another company, archived or of another mail type',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const type = await saveThroughUseCase(database, company.companyId, buildValues())
        const candidates = [
          crypto.randomUUID(),
          await seedOccurrenceMailTemplate(database, otherCompany),
          await seedOccurrenceMailTemplate(database, company, { status: 'archived' }),
          await seedOccurrenceMailTemplate(database, company, { mailType: 'address_correction' }),
        ]

        for (const contractorMailTemplateId of candidates) {
          const error = await captureError(() =>
            saveThroughUseCase(
              database,
              company.companyId,
              buildValues({ contractorMailTemplateId, occurrenceTypeId: type.id }),
            ),
          )
          expect(error).toBeInstanceOf(ContractorMailTemplateNotUsableError)
        }

        const stored = await findOccurrenceType(database.db, {
          companyId: company.companyId,
          occurrenceTypeId: type.id,
        })
        expect(stored?.contractorMailTemplateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )
})
