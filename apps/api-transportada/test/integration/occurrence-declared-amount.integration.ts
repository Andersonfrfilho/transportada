/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T2.3 (RF1, RF8, RF9, D8): o número do documento do cliente e o valor pago contra o
 * Postgres de verdade. Tipo novo nasce com os padrões (nada muda de comportamento), exceção nasce
 * nula (herda), e as CHECKs recusam o que a API também vai recusar: valor pago por item em tipo sem
 * produtos, valor negativo ou com mais de dois decimais, número fora do padrão. Na corrida do `PUT`,
 * a CHECK de forma vira 422 do domínio, não 500.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { violatedCheckConstraint } from '../../src/database/postgres-error.support.js'
import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
} from '../../src/database/trip.schema.js'
import {
  OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS,
  OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK,
} from '../../src/shared/trip-occurrence.constant.js'
import { OccurrenceTypeDeclaredAmountNeedsItemsError } from '../../src/trips/domain/trip.error.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
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

const RECIPIENT_TAX_ID = '12345678000190'
const EMITTER_TAX_ID = '30290856000160'
const TYPE_NAME = 'Devolução parcial'
const TEST_TIMEOUT_MS = 60_000

type SaveInput = Parameters<typeof saveOccurrenceType>[1]

function typeValues(companyId: string, overrides: Partial<SaveInput> = {}): SaveInput {
  return {
    active: true,
    companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: TYPE_NAME,
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

async function constraintOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => 'accepted',
    (reason: unknown) => violatedCheckConstraint(reason) ?? `unexpected: ${String(reason)}`,
  )
}

async function updateType(
  database: TestDatabase,
  id: string,
  values: Partial<typeof companyOccurrenceTypes.$inferInsert>,
): Promise<string | undefined> {
  return constraintOf(
    database.db.update(companyOccurrenceTypes).set(values).where(eq(companyOccurrenceTypes.id, id)),
  )
}

async function seedOccurrence(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly occurrenceTypeId: string
  readonly trip: SeededTrip
  readonly values?: Partial<typeof tripDocumentOccurrences.$inferInsert>
}): Promise<string | undefined> {
  return constraintOf(
    input.database.db.insert(tripDocumentOccurrences).values({
      actorUserId: input.company.userId,
      companyId: input.company.companyId,
      id: crypto.randomUUID(),
      occurrenceTypeId: input.occurrenceTypeId,
      stage: 'delivery',
      tripDocumentId: input.trip.documentId,
      ...input.values,
    }),
  )
}

describe('número do cliente e valor pago contra o Postgres (spec 247 T2.3)', () => {
  testWithPostgres(
    'tipo novo nasce com os padrões e a exceção nasce nula — herda do tipo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const contractorId = crypto.randomUUID()
        await database.db
          .insert(contractors)
          .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
        await database.db
          .insert(deliveryClients)
          .values({ companyId: company.companyId, taxId: RECIPIENT_TAX_ID })
        const type = await saveOccurrenceType(database.db, typeValues(company.companyId))

        const [stored] = await database.db
          .select({
            declaredAmountLabel: companyOccurrenceTypes.declaredAmountLabel,
            declaredAmountMode: companyOccurrenceTypes.declaredAmountMode,
            declaredAmountScope: companyOccurrenceTypes.declaredAmountScope,
            referenceNumberLabel: companyOccurrenceTypes.referenceNumberLabel,
            referenceNumberMode: companyOccurrenceTypes.referenceNumberMode,
          })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, type.id))
        expect(stored).toEqual({ ...OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS })
        const [template] = await database.db
          .select({ line: companyOccurrenceTypes.emailItemLineTemplate })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, type.id))
        expect(template?.line).toBe('')

        const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
        const scope = { companyId: company.companyId, occurrenceTypeId: type.id }
        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'optional', contractorId }],
        })
        await repository.replaceRecipientOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'optional', taxId: RECIPIENT_TAX_ID }],
        })
        const inheritedModes = {
          declaredAmountMode: companyOccurrenceTypeContractorOverrides.declaredAmountMode,
          referenceNumberMode: companyOccurrenceTypeContractorOverrides.referenceNumberMode,
        }
        expect(
          await database.db.select(inheritedModes).from(companyOccurrenceTypeContractorOverrides),
        ).toEqual([{ declaredAmountMode: null, referenceNumberMode: null }])
        expect(
          await database.db
            .select({
              declaredAmountMode: companyOccurrenceTypeRecipientOverrides.declaredAmountMode,
              referenceNumberMode: companyOccurrenceTypeRecipientOverrides.referenceNumberMode,
            })
            .from(companyOccurrenceTypeRecipientOverrides),
        ).toEqual([{ declaredAmountMode: null, referenceNumberMode: null }])

        // Declarado na exceção, o vocabulário é o mesmo do tipo.
        expect(
          await constraintOf(
            database.db
              .update(companyOccurrenceTypeContractorOverrides)
              .set({ referenceNumberMode: 'always' as never }),
          ),
        ).toBe('occurrence_type_contractor_overrides_reference_mode_check')
        expect(
          await constraintOf(
            database.db
              .update(companyOccurrenceTypeRecipientOverrides)
              .set({ declaredAmountMode: 'always' as never }),
          ),
        ).toBe('occurrence_type_recipient_overrides_declared_amount_mode_check')
        expect(
          await constraintOf(
            database.db
              .update(companyOccurrenceTypeRecipientOverrides)
              .set({ declaredAmountMode: 'required', referenceNumberMode: 'optional' }),
          ),
        ).toBe('accepted')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'valor pago por item exige produtos; pela ocorrência, ou desligado, não',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const type = await saveOccurrenceType(
          database.db,
          typeValues(company.companyId, { itemsMode: 'off' }),
        )

        for (const declaredAmountMode of ['optional', 'required'] as const) {
          expect(
            await updateType(database, type.id, {
              declaredAmountMode,
              declaredAmountScope: 'item',
            }),
          ).toBe(OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK)
        }
        expect(
          await updateType(database, type.id, {
            declaredAmountMode: 'required',
            declaredAmountScope: 'occurrence',
          }),
        ).toBe('accepted')
        expect(
          await updateType(database, type.id, {
            declaredAmountMode: 'off',
            declaredAmountScope: 'item',
          }),
        ).toBe('accepted')
        expect(
          await updateType(database, type.id, {
            declaredAmountMode: 'required',
            declaredAmountScope: 'item',
            itemsMode: 'optional',
          }),
        ).toBe('accepted')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'vocabulário, rótulos e teto da linha de item no tipo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const type = await saveOccurrenceType(database.db, typeValues(company.companyId))

        const refusals: readonly (readonly [
          Partial<typeof companyOccurrenceTypes.$inferInsert>,
          string,
        ])[] = [
          [
            { referenceNumberMode: 'always' as never },
            'company_occurrence_types_reference_number_mode_check',
          ],
          [
            { declaredAmountMode: 'always' as never },
            'company_occurrence_types_declared_amount_mode_check',
          ],
          [
            { declaredAmountScope: 'line' as never },
            'company_occurrence_types_declared_amount_scope_check',
          ],
          [
            { referenceNumberLabel: '   ' },
            'company_occurrence_types_reference_number_label_check',
          ],
          [{ declaredAmountLabel: '' }, 'company_occurrence_types_declared_amount_label_check'],
          [
            { emailItemLineTemplate: 'x'.repeat(401) },
            'company_occurrence_types_email_item_line_template_check',
          ],
        ]
        for (const [values, constraint] of refusals) {
          expect(await updateType(database, type.id, values)).toBe(constraint)
        }
        expect(
          await updateType(database, type.id, {
            declaredAmountLabel: 'Valor da NFD',
            emailItemLineTemplate: 'x'.repeat(400),
            referenceNumberLabel: 'Número da NFD',
          }),
        ).toBe('accepted')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a ocorrência e os produtos recusam valor negativo, centavo fracionado e número inválido',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const type = await saveOccurrenceType(database.db, typeValues(company.companyId))
        const occurrence = (values: Partial<typeof tripDocumentOccurrences.$inferInsert>) =>
          seedOccurrence({ company, database, occurrenceTypeId: type.id, trip, values })

        expect(await occurrence({ declaredAmount: '-0.01' })).toBe(
          'trip_document_occurrences_declared_amount_check',
        )
        expect(await occurrence({ declaredAmount: '10.005' })).toBe(
          'trip_document_occurrences_declared_amount_check',
        )
        for (const referenceNumber of ['45029;', 'NFD_1', 'Nº 12', '   ', '']) {
          expect(await occurrence({ referenceNumber })).toBe(
            'trip_document_occurrences_reference_number_check',
          )
        }

        const occurrenceId = crypto.randomUUID()
        expect(
          await occurrence({
            declaredAmount: '199.99',
            id: occurrenceId,
            referenceNumber: 'NFD 45029',
          }),
        ).toBe('accepted')
        const [stored] = await database.db
          .select({
            declaredAmount: tripDocumentOccurrences.declaredAmount,
            referenceNumber: tripDocumentOccurrences.referenceNumber,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, occurrenceId))
        expect(stored).toEqual({ declaredAmount: '199.9900', referenceNumber: 'NFD 45029' })
        expect(await occurrence({})).toBe('accepted')

        const product = (
          position: number,
          values: Partial<typeof tripDocumentOccurrenceProducts.$inferInsert>,
        ) =>
          constraintOf(
            database.db.insert(tripDocumentOccurrenceProducts).values({
              companyId: company.companyId,
              occurrenceId,
              position,
              productCode: `2073170-${position}`,
              ...values,
            }),
          )
        expect(await product(1, { declaredAmount: '-1' })).toBe(
          'trip_document_occurrence_products_declared_amount_check',
        )
        expect(await product(1, { declaredAmount: '0.001' })).toBe(
          'trip_document_occurrence_products_declared_amount_check',
        )
        expect(await product(1, { unitValue: '-0.0001' })).toBe(
          'trip_document_occurrence_products_unit_value_check',
        )
        expect(await product(1, { declaredAmount: '50.00', unitValue: '49.9950' })).toBe('accepted')
        expect(await product(2, {})).toBe('accepted')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'na corrida do PUT, a CHECK de forma vira 422 do domínio e nada é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const type = await saveOccurrenceType(
          database.db,
          typeValues(company.companyId, { itemsMode: 'optional' }),
        )
        // Outro `PUT` gravou o valor pago por item enquanto este lia o tipo com produtos.
        expect(
          await updateType(database, type.id, {
            declaredAmountMode: 'required',
            declaredAmountScope: 'item',
          }),
        ).toBe('accepted')

        await expect(
          saveOccurrenceType(
            database.db,
            typeValues(company.companyId, { itemsMode: 'off', occurrenceTypeId: type.id }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeDeclaredAmountNeedsItemsError)
        const [stored] = await database.db
          .select({ itemsMode: companyOccurrenceTypes.itemsMode })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, type.id))
        expect(stored?.itemsMode).toBe('optional')
      })
    },
    TEST_TIMEOUT_MS,
  )
})
