/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.1–9.2, §9.5): até onde a avaria sem viagem chega — o portal do
 * contratante a vê (com o recorte dele, nunca o de outro), o cadastro de tipos do painel não vê o tipo
 * de recebimento nem o converte, e o catálogo de recebimento nasce uma vez por empresa.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  findContractorOccurrenceDetail,
  findContractorPortalAudience,
  listContractorOccurrences,
} from '../../src/contractor-portal/infrastructure/contractor-occurrence.query.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import { createDrizzleOccurrenceTypeCatalogSeedPort } from '../../src/database/occurrence-type-catalog-seed.repository.js'
import {
  seedOccurrenceTypeCatalog,
  seedReceivingOccurrenceTypeCatalog,
} from '../../src/database/occurrence-type-catalog-seed.service.js'
import { OCCURRENCE_TYPE_CATALOG } from '../../src/shared/occurrence-type-catalog.constant.js'
import { companyOccurrenceTypes, tripOccurrenceCases } from '../../src/database/database.schema.js'
import {
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  OTHER_ISSUER_TAX_ID,
  seedIssuedDocument,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
} from '../fixtures/cargo-arrival-http.fixture.js'
import {
  createOccurrenceHandler,
  occurrenceRequest,
  seedOccurrenceType,
  seedProduct,
} from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { COMPANY_CONTEXT, jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip

async function seedReceivingOccurrence(
  database: TestDatabase,
  tenants: CargoTenants,
): Promise<string> {
  const documentId = await seedIssuedDocument(database, { number: '41' })
  await seedProduct(database, { code: 'P9', documentId, unit: 'UN' })
  const arrivals = createCargoArrivalHandler({ database })
  const registered = await call(
    arrivals,
    buildPostRequest({
      body: {
        arrivedAt: new Date(Date.now() - 3_600_000).toISOString(),
        contractorId: tenants.contractorId,
        documentIds: [documentId],
      },
      key: `arrival-${crypto.randomUUID()}`,
      path: '/cargo-arrivals',
    }),
  )
  const arrivalId = String(registered.body.data?.id)
  await call(
    arrivals,
    buildPostRequest({ path: `/cargo-arrivals/${arrivalId}/documents/${documentId}/receive` }),
  )
  const typeId = await seedOccurrenceType(database, { name: 'Item avariado', stage: 'receiving' })
  const created = await createOccurrenceHandler({ database })(
    occurrenceRequest({
      arrivalId,
      documentId,
      fields: { occurrenceTypeId: typeId, productCodes: ['P9'] },
      key: `reach-${crypto.randomUUID()}`,
    }),
  )
  return ((await created.json()) as { data: { id: string } }).data.id
}

describe('o portal do contratante vê a avaria sem viagem (spec 164, sem mudar o contrato)', () => {
  testWithPostgres(
    'com a tratativa visível, pelo recorte do emitente; nunca pelo de outro',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const occurrenceId = await seedReceivingOccurrence(database, tenants)
        const companyId = COMPANY_CONTEXT.companyId
        const own = resolveContractorScope([
          { contractorId: tenants.contractorId, taxId: ISSUER_TAX_ID },
        ])
        const other = resolveContractorScope([
          { contractorId: tenants.otherContractorId, taxId: OTHER_ISSUER_TAX_ID },
        ])

        expect(
          await listContractorOccurrences(database.db, { companyId, limit: 10, scope: own }),
        ).toEqual([])
        await database.db
          .update(tripOccurrenceCases)
          .set({ status: 'awaiting_contractor' })
          .where(eq(tripOccurrenceCases.occurrenceId, occurrenceId))

        const listed = await listContractorOccurrences(database.db, {
          companyId,
          limit: 10,
          scope: own,
        })
        expect(listed).toHaveLength(1)
        expect(listed[0]).toMatchObject({
          caseStatus: 'awaiting_contractor',
          items: [{ code: 'P9', description: 'Produto P9', quantity: null, unit: null }],
          nfeNumber: '41',
          occurrenceId,
          stage: 'receiving',
        })
        expect(Object.keys(listed[0] ?? {}).sort()).toEqual(
          [
            'caseStatus',
            'decidedAt',
            'decisionKind',
            'items',
            'nfeAccessKey',
            'nfeNumber',
            'nfeSeries',
            'note',
            'occurrenceId',
            'occurrenceTypeName',
            'openedAt',
            'stage',
          ].sort(),
        )
        expect(
          await listContractorOccurrences(database.db, { companyId, limit: 10, scope: other }),
        ).toEqual([])
        expect(
          await findContractorOccurrenceDetail(database.db, {
            companyId,
            occurrenceId,
            scope: own,
          }),
        ).toMatchObject({ occurrenceId })
        expect(
          await findContractorOccurrenceDetail(database.db, {
            companyId,
            occurrenceId,
            scope: other,
          }),
        ).toBeNull()
        expect(
          await findContractorOccurrenceDetail(database.db, {
            companyId: tenants.foreignCompanyId,
            occurrenceId,
            scope: own,
          }),
        ).toBeNull()
        expect(
          await findContractorPortalAudience(database.db, { companyId, occurrenceId }),
        ).toEqual({
          contractorId: tenants.contractorId,
          userIds: [],
        })
      })
    },
  )
})

describe('o tipo de recebimento é da chegada (ADR-0094 §9.5, ajuste 1)', () => {
  testWithPostgres(
    'o cadastro do painel não lista nem converte o tipo de recebimento',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const companyId = COMPANY_CONTEXT.companyId
        const receiving = await seedOccurrenceType(database, {
          name: 'Avaria na doca',
          stage: 'receiving',
        })
        const separation = await seedOccurrenceType(database, {
          name: 'Item avariado',
          stage: 'separation',
        })
        await seedOccurrenceType(database, {
          companyId: tenants.foreignCompanyId,
          name: 'Alheio',
          stage: 'receiving',
        })
        await seedOccurrenceType(database, {
          active: false,
          name: 'Aposentado',
          stage: 'receiving',
        })

        expect(
          (await listOccurrenceTypes(database.db, { companyId })).map((type) => type.id),
        ).toEqual([separation])
        await expect(
          saveOccurrenceType(database.db, {
            active: true,
            allowsMultipleItems: true,
            companyId,
            emailBody: '',
            emailSubject: '',
            emailTemplateKey: null,
            name: 'Convertido',
            notifies: false,
            occurrenceTypeId: receiving,
            stage: 'separation',
          }),
        ).rejects.toMatchObject({ status: 404 })
        const [kept] = await database.db
          .select({ name: companyOccurrenceTypes.name, stage: companyOccurrenceTypes.stage })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, receiving))
        expect(kept).toEqual({ name: 'Avaria na doca', stage: 'receiving' })

        const response = await createOccurrenceHandler({ database })(
          jsonRequest({ method: 'GET', path: '/cargo-arrivals/occurrence-types' }),
        )
        expect(
          ((await response.json()) as { data: { id: string }[] }).data.map((type) => type.id),
        ).toEqual([receiving])
      })
    },
  )

  /**
   * O caso real: a empresa já tem o catálogo de viagem (com "Item avariado" de galpão), e o nome do
   * tipo é único por empresa em qualquer etapa — o de recebimento não pode colidir nem derrubar o deploy.
   */
  testWithPostgres(
    'o catálogo de recebimento nasce uma vez por empresa, ao lado do de viagem',
    async () => {
      await withCargoDatabase(async (database) => {
        const port = createDrizzleOccurrenceTypeCatalogSeedPort(database.db)

        expect(await seedOccurrenceTypeCatalog({ port })).toBe(OCCURRENCE_TYPE_CATALOG.length * 2)
        expect(await seedReceivingOccurrenceTypeCatalog({ port })).toBe(6)
        expect(await seedReceivingOccurrenceTypeCatalog({ port })).toBe(0)
        expect(await seedOccurrenceTypeCatalog({ port })).toBe(0)
        const seeded = await database.db
          .select({
            itemsMode: companyOccurrenceTypes.itemsMode,
            redeliveryPolicy: companyOccurrenceTypes.redeliveryPolicy,
          })
          .from(companyOccurrenceTypes)
          .where(
            and(
              eq(companyOccurrenceTypes.companyId, COMPANY_CONTEXT.companyId),
              eq(companyOccurrenceTypes.stage, 'receiving'),
            ),
          )
        expect(seeded).toHaveLength(3)
        expect(new Set(seeded.map((type) => `${type.itemsMode}/${type.redeliveryPolicy}`))).toEqual(
          new Set(['optional/blocked']),
        )
      })
    },
  )
})
