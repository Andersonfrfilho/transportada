/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão final, M2), contra Postgres real: o `PUT` da exceção nunca estoura a CHECK do par
 * `items_mode` + `items_minimum_count` (500). Trocar o modo de produtos para outro que não `required`
 * (ou para nulo) sem mandar o mínimo **zera o mínimo** — dado morto que um `PUT` futuro religaria —, e
 * um mínimo sem `required` no estado resultante é 422 estável, pelo nome da CHECK de forma de cada
 * tabela de exceção, como a 241 fez em `saveOccurrenceType`.
 */
import { describe, expect } from 'bun:test'

import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { OccurrenceTypeItemsMinimumRequiresRequiredError } from '../../src/trips/domain/trip.error.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const RECIPIENT_TAX_ID = '12345678000190'
const EMITTER_TAX_ID = '30290856000160'

async function seedScope(database: Parameters<Parameters<typeof withDisposableDatabase>[0]>[0]) {
  const company = await seedCompany(database)
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: RECIPIENT_TAX_ID })
  const type = await saveOccurrenceType(database.db, {
    active: true,
    companyId: company.companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  return {
    contractorId,
    repository: new DrizzleOccurrenceAttachmentOverridesRepository(database.db),
    scope: { companyId: company.companyId, occurrenceTypeId: type.id },
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('o PUT da exceção não estoura a CHECK do par produtos (spec 246, revisão final M2)', () => {
  testWithPostgres(
    'trocar o modo para outro que não required, ou para nulo, sem mínimo: o mínimo vai a nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { contractorId, repository, scope } = await seedScope(database)
        const seedRequired = async () => {
          await repository.replaceContractorOverrides({
            ...scope,
            overrides: [
              {
                attachmentMode: 'optional',
                contractorId,
                itemsMinimumCount: 3,
                itemsMode: 'required',
              },
            ],
          })
          await repository.replaceRecipientOverrides({
            ...scope,
            overrides: [
              {
                attachmentMode: 'optional',
                itemsMinimumCount: 3,
                itemsMode: 'required',
                taxId: RECIPIENT_TAX_ID,
              },
            ],
          })
        }

        for (const itemsMode of ['optional', 'off', null] as const) {
          await seedRequired()

          await repository.replaceContractorOverrides({
            ...scope,
            overrides: [{ attachmentMode: 'optional', contractorId, itemsMode }],
          })
          await repository.replaceRecipientOverrides({
            ...scope,
            overrides: [{ attachmentMode: 'optional', itemsMode, taxId: RECIPIENT_TAX_ID }],
          })

          expect(await repository.listContractorOverrides(scope)).toMatchObject([
            { itemsMinimumCount: null, itemsMode },
          ])
          expect(await repository.listRecipientOverrides(scope)).toMatchObject([
            { itemsMinimumCount: null, itemsMode },
          ])
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'mínimo sem required no estado resultante: 422 estável, e a linha fica como estava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { contractorId, repository, scope } = await seedScope(database)
        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'optional', contractorId, itemsMode: 'optional' }],
        })
        await repository.replaceRecipientOverrides({
          ...scope,
          overrides: [
            { attachmentMode: 'optional', itemsMode: 'optional', taxId: RECIPIENT_TAX_ID },
          ],
        })

        const refusals = await Promise.all([
          rejection(
            repository.replaceContractorOverrides({
              ...scope,
              overrides: [
                {
                  attachmentMode: 'optional',
                  contractorId,
                  itemsMinimumCount: 2,
                  itemsMode: 'off',
                },
              ],
            }),
          ),
          rejection(
            repository.replaceContractorOverrides({
              ...scope,
              overrides: [{ attachmentMode: 'optional', contractorId, itemsMinimumCount: 2 }],
            }),
          ),
          rejection(
            repository.replaceRecipientOverrides({
              ...scope,
              overrides: [
                {
                  attachmentMode: 'optional',
                  itemsMinimumCount: 2,
                  itemsMode: null,
                  taxId: RECIPIENT_TAX_ID,
                },
              ],
            }),
          ),
          rejection(
            repository.replaceRecipientOverrides({
              ...scope,
              overrides: [
                { attachmentMode: 'optional', itemsMinimumCount: 2, taxId: RECIPIENT_TAX_ID },
              ],
            }),
          ),
        ])

        for (const refusal of refusals) {
          expect(refusal).toBeInstanceOf(OccurrenceTypeItemsMinimumRequiresRequiredError)
          expect((refusal as OccurrenceTypeItemsMinimumRequiresRequiredError).status).toBe(422)
        }
        expect(await repository.listContractorOverrides(scope)).toMatchObject([
          { itemsMinimumCount: null, itemsMode: 'optional' },
        ])
      })
    },
    60_000,
  )
})
