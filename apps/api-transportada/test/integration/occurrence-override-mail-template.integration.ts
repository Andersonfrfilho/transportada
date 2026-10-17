/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.4b (ADR-0106), contra Postgres real: a exceção da contratante escolhe o modelo de e-mail da
 * ocorrência — grava, lê em lote, herda com `null`, fica quando o `PUT` não o manda — e o modelo precisa
 * ser da empresa, `occurrence` e ativo.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { ContractorMailTemplateNotUsableError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
import { companyOccurrenceTypeContractorOverrides } from '../../src/database/trip.schema.js'
import { contractors } from '../../src/database/delivery-client.schema.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import { seedOccurrenceMailTemplate } from '../fixtures/occurrence-mail-template.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 60_000
const EMITTER_TAX_ID = '30290856000160'

async function seedScope(database: TestDatabase) {
  const company = await seedCompany(database)
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  const type = await saveOccurrenceType(database.db, {
    active: true,
    companyId: company.companyId,
    emailTemplateKey: null,
    flow: 'document',
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  return {
    company,
    contractorId,
    repository: new DrizzleOccurrenceAttachmentOverridesRepository(database.db),
    scope: { companyId: company.companyId, occurrenceTypeId: type.id },
  }
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

async function readSelectedAt(database: TestDatabase, companyId: string) {
  const [row] = await database.db
    .select({
      selectedAt: companyOccurrenceTypeContractorOverrides.contractorMailTemplateSelectedAt,
    })
    .from(companyOccurrenceTypeContractorOverrides)
    .where(eq(companyOccurrenceTypeContractorOverrides.companyId, companyId))
  return row?.selectedAt
}

describe('o modelo de e-mail da exceção por contratante (spec 269 T2.4b)', () => {
  testWithPostgres(
    'marca o momento da escolha a cada troca para um modelo, mantém quando nada muda e limpa com null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, contractorId, repository, scope } = await seedScope(database)
        const first = await seedOccurrenceMailTemplate(database, company)
        const second = await seedOccurrenceMailTemplate(database, company, { name: 'Outro modelo' })
        const save = (contractorMailTemplateId?: null | string) =>
          repository.replaceContractorOverrides({
            ...scope,
            overrides: [
              {
                attachmentMode: 'optional',
                contractorId,
                ...(contractorMailTemplateId === undefined ? {} : { contractorMailTemplateId }),
              },
            ],
          })

        await save()
        expect(await readSelectedAt(database, company.companyId)).toBeNull()

        await save(first)
        const selectedAt = await readSelectedAt(database, company.companyId)
        expect(selectedAt).toBeInstanceOf(Date)

        await save(first)
        expect(await readSelectedAt(database, company.companyId)).toEqual(selectedAt!)
        await save()
        expect(await readSelectedAt(database, company.companyId)).toEqual(selectedAt!)

        await save(second)
        const reselected = await readSelectedAt(database, company.companyId)
        expect(reselected!.getTime()).toBeGreaterThan(selectedAt!.getTime())

        await save(null)
        expect(await readSelectedAt(database, company.companyId)).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'grava, lê, mantém quando o PUT não o manda e herda com null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, contractorId, repository, scope } = await seedScope(database)
        const templateId = await seedOccurrenceMailTemplate(database, company)

        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [
            { attachmentMode: 'optional', contractorId, contractorMailTemplateId: templateId },
          ],
        })
        const stored = await repository.listContractorOverrides(scope)
        expect(stored[0]?.contractorMailTemplateId).toBe(templateId)

        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'required', contractorId }],
        })
        const kept = await repository.listContractorOverrides(scope)
        expect(kept[0]?.attachmentMode).toBe('required')
        expect(kept[0]?.contractorMailTemplateId).toBe(templateId)

        const batch = await repository.listOverridesForTypes({
          companyId: scope.companyId,
          occurrenceTypeIds: [scope.occurrenceTypeId],
        })
        expect(batch.contractorOverrides[0]?.contractorMailTemplateId).toBe(templateId)

        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'required', contractorId, contractorMailTemplateId: null }],
        })
        const inherited = await repository.listContractorOverrides(scope)
        expect(inherited[0]?.contractorMailTemplateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a nova exceção sem o campo nasce herdando do tipo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { contractorId, repository, scope } = await seedScope(database)

        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'optional', contractorId }],
        })

        const stored = await repository.listContractorOverrides(scope)
        expect(stored[0]?.contractorMailTemplateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa modelo inexistente, de outra empresa, arquivado ou de outro tipo, sem gravar nada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, contractorId, repository, scope } = await seedScope(database)
        const otherCompany = await seedCompany(database)
        const candidates = [
          crypto.randomUUID(),
          await seedOccurrenceMailTemplate(database, otherCompany),
          await seedOccurrenceMailTemplate(database, company, { status: 'archived' }),
          await seedOccurrenceMailTemplate(database, company, { mailType: 'address_correction' }),
        ]

        for (const contractorMailTemplateId of candidates) {
          const error = await captureError(() =>
            repository.replaceContractorOverrides({
              ...scope,
              overrides: [{ attachmentMode: 'optional', contractorId, contractorMailTemplateId }],
            }),
          )
          expect(error).toBeInstanceOf(ContractorMailTemplateNotUsableError)
        }

        expect(await repository.listContractorOverrides(scope)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
