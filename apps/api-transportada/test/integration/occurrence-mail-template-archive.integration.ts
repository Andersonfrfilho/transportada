/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.5 (RF7, D3), contra Postgres real: modelo `occurrence` escolhido por um tipo (ativo ou
 * inativo) ou por uma exceção de contratante não se arquiva — 409 com os nomes —, e arquivar disputando
 * com a gravação da escolha nunca deixa um modelo arquivado referenciado.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { ContractorMailTemplateInUseError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
import { DrizzleContractorMailTemplateRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-template.repository.js'
import { contractorMailTemplates } from '../../src/database/contractor-mail.schema.js'
import { contractors } from '../../src/database/delivery-client.schema.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import { seedOccurrenceMailTemplate } from '../fixtures/occurrence-mail-template.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 90_000
const RACE_ROUNDS = 6

async function seedScope(database: TestDatabase) {
  const company = await seedCompany(database)
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Contratante Alfa',
    id: contractorId,
    taxId: '30290856000160',
  })
  return {
    company,
    contractorId,
    overrides: new DrizzleOccurrenceAttachmentOverridesRepository(database.db),
    templates: new DrizzleContractorMailTemplateRepository(database.db),
  }
}

function saveType(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly contractorMailTemplateId?: null | string
    readonly name: string
    readonly occurrenceTypeId?: string
  },
) {
  return saveOccurrenceType(database.db, {
    active: true,
    companyId: params.companyId,
    emailTemplateKey: null,
    flow: 'document',
    name: params.name,
    notifies: false,
    occurrenceTypeId: params.occurrenceTypeId ?? null,
    stage: 'delivery',
    ...(params.contractorMailTemplateId === undefined
      ? {}
      : { contractorMailTemplateId: params.contractorMailTemplateId }),
  })
}

async function archive(
  scope: Awaited<ReturnType<typeof seedScope>>,
  templateId: string,
): Promise<unknown> {
  const current = await scope.templates.find({ companyId: scope.company.companyId, templateId })
  return scope.templates.update({
    actorUserId: scope.company.userId,
    changes: { status: 'archived' },
    companyId: scope.company.companyId,
    expectedVersion: current?.version ?? 1n,
    templateId,
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

function detailsOf(error: unknown): readonly string[] {
  if (!(error instanceof ContractorMailTemplateInUseError)) throw new Error('IN_USE_EXPECTED')
  return (error.details ?? []).map((detail) => `${detail.field}:${detail.message}`).sort()
}

describe('arquivar o modelo de e-mail da ocorrência (spec 269 T2.5)', () => {
  testWithPostgres(
    'recusa com 409 enquanto um tipo, ativo ou inativo, o escolhe, listando os nomes',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scope = await seedScope(database)
        const templateId = await seedOccurrenceMailTemplate(database, scope.company)
        const active = await saveType(database, {
          companyId: scope.company.companyId,
          contractorMailTemplateId: templateId,
          name: 'Devolução parcial',
        })
        const inactive = await saveType(database, {
          companyId: scope.company.companyId,
          contractorMailTemplateId: templateId,
          name: 'Tipo aposentado',
        })
        await database.db
          .update(companyOccurrenceTypes)
          .set({ active: false })
          .where(eq(companyOccurrenceTypes.id, inactive.id))

        const error = await captureError(() => archive(scope, templateId))

        expect(error).toBeInstanceOf(ContractorMailTemplateInUseError)
        expect((error as ContractorMailTemplateInUseError).status).toBe(409)
        expect((error as ContractorMailTemplateInUseError).code).toBe(
          'CONTRACTOR_MAIL_TEMPLATE_IN_USE',
        )
        expect(detailsOf(error)).toEqual([
          'occurrenceType:Devolução parcial',
          'occurrenceType:Tipo aposentado',
        ])
        const stored = await scope.templates.find({
          companyId: scope.company.companyId,
          templateId,
        })
        expect(stored?.status).toBe('active')
        expect(active.id).not.toBe(inactive.id)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa enquanto uma exceção de contratante o escolhe, e arquiva depois de trocar os dois para nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scope = await seedScope(database)
        const templateId = await seedOccurrenceMailTemplate(database, scope.company)
        const type = await saveType(database, {
          companyId: scope.company.companyId,
          contractorMailTemplateId: templateId,
          name: 'Recusa total',
        })
        const scoped = { companyId: scope.company.companyId, occurrenceTypeId: type.id }
        await scope.overrides.replaceContractorOverrides({
          ...scoped,
          overrides: [
            {
              attachmentMode: 'optional',
              contractorId: scope.contractorId,
              contractorMailTemplateId: templateId,
            },
          ],
        })

        expect(detailsOf(await captureError(() => archive(scope, templateId)))).toEqual([
          'contractorException:Recusa total / Contratante Alfa',
          'occurrenceType:Recusa total',
        ])

        await saveType(database, {
          companyId: scope.company.companyId,
          contractorMailTemplateId: null,
          name: 'Recusa total',
          occurrenceTypeId: type.id,
        })
        expect(detailsOf(await captureError(() => archive(scope, templateId)))).toEqual([
          'contractorException:Recusa total / Contratante Alfa',
        ])

        await scope.overrides.replaceContractorOverrides({
          ...scoped,
          overrides: [
            {
              attachmentMode: 'optional',
              contractorId: scope.contractorId,
              contractorMailTemplateId: null,
            },
          ],
        })
        const archived = await archive(scope, templateId)

        expect((archived as { status: string }).status).toBe('archived')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'modelo de outro tipo de e-mail arquiva sem consultar o uso',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scope = await seedScope(database)
        const templateId = await seedOccurrenceMailTemplate(database, scope.company, {
          mailType: 'address_correction',
        })

        const archived = await archive(scope, templateId)

        expect((archived as { status: string }).status).toBe('archived')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a corrida gravar x arquivar nunca deixa um modelo arquivado referenciado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scope = await seedScope(database)
        const type = await saveType(database, {
          companyId: scope.company.companyId,
          name: 'Devolução parcial',
        })

        for (let round = 0; round < RACE_ROUNDS; round += 1) {
          const templateId = await seedOccurrenceMailTemplate(database, scope.company)
          await Promise.allSettled([
            saveType(database, {
              companyId: scope.company.companyId,
              contractorMailTemplateId: templateId,
              name: 'Devolução parcial',
              occurrenceTypeId: type.id,
            }),
            archive(scope, templateId),
          ])

          const [template] = await database.db
            .select({ status: contractorMailTemplates.status })
            .from(contractorMailTemplates)
            .where(eq(contractorMailTemplates.id, templateId))
          const [stored] = await database.db
            .select({ chosen: companyOccurrenceTypes.contractorMailTemplateId })
            .from(companyOccurrenceTypes)
            .where(eq(companyOccurrenceTypes.id, type.id))
          const isReferenced = stored?.chosen === templateId
          expect(template?.status === 'archived' && isReferenced).toBe(false)

          await saveType(database, {
            companyId: scope.company.companyId,
            contractorMailTemplateId: null,
            name: 'Devolução parcial',
            occurrenceTypeId: type.id,
          })
        }
      })
    },
    TEST_TIMEOUT_MS,
  )
})
