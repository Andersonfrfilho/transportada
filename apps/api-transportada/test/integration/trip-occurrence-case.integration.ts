/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T12, contra Postgres real: a máquina inteira sobre linhas reais, as duas consultas do
 * portal (T9), o isolamento por empresa/contratante e a corrida das duas abas. `explain` das duas
 * consultas novas registrado no `evidence.md` da spec (RNF5).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractorPortalBindings,
  contractors,
  identityUsers,
  nfeParticipants,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDocuments,
  tripOccurrenceCaseEvents,
  tripOccurrenceCases,
} from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import { DrizzleContractorPortalRepository } from '../../src/contractor-portal/infrastructure/drizzle-contractor-portal.repository.js'
import {
  findContractorOccurrenceDetail,
  listContractorOccurrences,
} from '../../src/contractor-portal/infrastructure/contractor-occurrence.query.js'
import { createDecideOccurrenceCaseUseCase } from '../../src/contractor-portal/application/decide-occurrence-case.use-case.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
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

const OWN_TAX_ID = '30290856000160'
const OTHER_TAX_ID = '12345678000190'

async function seedOccurrenceType(
  database: TestDatabase,
  company: Company,
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
  name: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name,
    notifies: false,
    redeliveryPolicy,
    stage: 'separation',
  })
  return id
}

async function registerOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
  redeliveryPolicy: 'allowed' | 'blocked',
) {
  const uploads: { objectId: string; objectKey: string }[] = []
  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy,
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  return registered
}

/**
 * Amarra a nota da viagem ao contratante (o cadastro dele e o vínculo do portal) e devolve o
 * `CompanyContext` autenticado como aquela conta — molde de `seedPortal`
 * (`contractor-portal.integration.ts`).
 */
async function bindContractor(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  taxId: string,
): Promise<CompanyContext> {
  const [tripDocument] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
    .limit(1)
  if (tripDocument === undefined || tripDocument.nfeDocumentId === null) {
    throw new Error('EXPECTED_TRIP_DOCUMENT')
  }
  const nfeDocumentId = tripDocument.nfeDocumentId

  const contractorId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()

  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: company.companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Spani Atacadista',
    id: contractorId,
    taxId,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: company.companyId,
    documentId: nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Participante',
    role: 'recipient',
    taxId,
  })
  await database.db
    .insert(contractorPortalBindings)
    .values({ companyId: company.companyId, contractorId, id: crypto.randomUUID(), membershipId })

  return { companyId: company.companyId, membershipId, userId } as unknown as CompanyContext
}

function buildPortalUseCase(database: TestDatabase) {
  const cases = new DrizzleOccurrenceCaseRepository(database.db)
  const repository = new DrizzleContractorPortalRepository(database.db)
  return {
    cases,
    useCase: createDecideOccurrenceCaseUseCase({
      cases: { transition: (input) => cases.transition(input) },
      occurrences: {
        findDetail: (input) => findContractorOccurrenceDetail(database.db, input),
        list: (input) => listContractorOccurrences(database.db, input),
      },
      repository,
    }),
  }
}

describe('a tratativa contra Postgres (spec 164 T12)', () => {
  testWithPostgres('a máquina inteira e o isolamento do portal, sobre linhas reais', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = await seedOccurrenceType(database, company, 'allowed', 'Caixa violada')
      const occurrence = await registerOccurrence(database, company, trip, typeId, 'allowed')

      const otherCompany = await seedCompany(database)
      const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
      const otherTypeId = await seedOccurrenceType(
        database,
        otherCompany,
        'allowed',
        'Caixa violada',
      )
      const otherOccurrence = await registerOccurrence(
        database,
        otherCompany,
        otherTrip,
        otherTypeId,
        'allowed',
      )

      const contractorContext = await bindContractor(database, company, trip, OWN_TAX_ID)
      await bindContractor(database, otherCompany, otherTrip, OTHER_TAX_ID)

      const { cases, useCase } = buildPortalUseCase(database)

      // `recorded`: ainda não visível ao portal.
      expect(await useCase.list({ context: contractorContext })).toHaveLength(0)

      await cases.transition({
        action: 'review',
        actorKind: 'internal',
        actorUserId: company.userId,
        caseId: (await findCaseId(database, company.companyId, occurrence.id)) ?? '',
        companyId: company.companyId,
        hasSettlementItems: false,
        note: '',
      })
      // `under_review`: ainda invisível.
      expect(await useCase.list({ context: contractorContext })).toHaveLength(0)

      await cases.transition({
        action: 'contractor_submission',
        actorKind: 'internal',
        actorUserId: company.userId,
        caseId: (await findCaseId(database, company.companyId, occurrence.id)) ?? '',
        companyId: company.companyId,
        hasSettlementItems: false,
        note: '',
      })

      // `awaiting_contractor`: agora visível — e só a do próprio contratante.
      const visible = await useCase.list({ context: contractorContext })
      expect(visible.map((item) => item.occurrenceId)).toEqual([occurrence.id])
      expect(visible[0]?.caseStatus).toBe('awaiting_contractor')

      // A ocorrência da outra empresa/contratante nunca aparece, mesmo com o mesmo estado.
      const otherCaseId = await findCaseId(database, otherCompany.companyId, otherOccurrence.id)
      if (otherCaseId === null) throw new Error('EXPECTED_OTHER_CASE')
      await cases.transition({
        action: 'review',
        actorKind: 'internal',
        actorUserId: otherCompany.userId,
        caseId: otherCaseId,
        companyId: otherCompany.companyId,
        hasSettlementItems: false,
        note: '',
      })
      await cases.transition({
        action: 'contractor_submission',
        actorKind: 'internal',
        actorUserId: otherCompany.userId,
        caseId: otherCaseId,
        companyId: otherCompany.companyId,
        hasSettlementItems: false,
        note: '',
      })
      expect(
        (await useCase.list({ context: contractorContext })).map((item) => item.occurrenceId),
      ).toEqual([occurrence.id])

      // Decide: converge em repetição, e recusa decisão diferente sobre `decided`.
      const decided = await useCase.decide({
        context: contractorContext,
        kind: 'redelivery_authorized',
        occurrenceId: occurrence.id,
      })
      expect(decided.kind).toBe('changed')
      expect(decided.status).toBe('decided')

      const converged = await useCase.decide({
        context: contractorContext,
        kind: 'redelivery_authorized',
        occurrenceId: occurrence.id,
      })
      expect(converged.kind).toBe('unchanged')

      await expect(
        useCase.decide({
          context: contractorContext,
          kind: 'goods_paid',
          note: 'mudou de ideia',
          occurrenceId: occurrence.id,
        }),
      ).rejects.toMatchObject({ status: 409 })

      // Um evento de decisão só — a convergência não escreveu de novo.
      const decideEvents = await database.db
        .select({ id: tripOccurrenceCaseEvents.id })
        .from(tripOccurrenceCaseEvents)
        .where(
          and(
            eq(tripOccurrenceCaseEvents.companyId, company.companyId),
            eq(tripOccurrenceCaseEvents.toStatus, 'decided'),
          ),
        )
      expect(decideEvents).toHaveLength(1)

      /**
       * ⚠️ O 409 acima passou pelo atalho do caso de uso, que lê **fora** da transação — duas abas
       * simultâneas passariam as duas por ele. Aqui a decisão divergente vai direto ao escritor
       * único, como a corrida faria: a máquina responde `unchanged` (o destino já foi alcançado) e
       * é o escritor que precisa recusar. Sem isso, a segunda decisão sumia com 200.
       */
      await expect(
        cases.transition({
          action: 'decide',
          actorKind: 'contractor',
          actorUserId: contractorContext.userId,
          caseId: (await findCaseId(database, company.companyId, occurrence.id)) ?? '',
          companyId: company.companyId,
          decisionKind: 'goods_paid',
          decisionNote: 'pela porta dos fundos',
          hasSettlementItems: false,
          note: 'pela porta dos fundos',
        }),
      ).rejects.toMatchObject({ code: 'OCCURRENCE_CASE_DECISION_CONFLICT', status: 409 })

      // E a decisão gravada continua sendo a primeira.
      const [stored] = await database.db
        .select({ kind: tripOccurrenceCases.decisionKind })
        .from(tripOccurrenceCases)
        .where(
          and(
            eq(tripOccurrenceCases.companyId, company.companyId),
            eq(tripOccurrenceCases.occurrenceId, occurrence.id),
          ),
        )
      expect(stored?.kind).toBe('redelivery_authorized')
    })
  })

  testWithPostgres('a corrida das duas abas na decisão converge sem duplicar evento', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = await seedOccurrenceType(database, company, 'allowed', 'Caixa violada')
      const occurrence = await registerOccurrence(database, company, trip, typeId, 'allowed')
      const contractorContext = await bindContractor(database, company, trip, OWN_TAX_ID)

      const { cases, useCase } = buildPortalUseCase(database)
      const caseId = await findCaseId(database, company.companyId, occurrence.id)
      if (caseId === null) throw new Error('EXPECTED_CASE')

      await cases.transition({
        action: 'review',
        actorKind: 'internal',
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        hasSettlementItems: false,
        note: '',
      })
      await cases.transition({
        action: 'contractor_submission',
        actorKind: 'internal',
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        hasSettlementItems: false,
        note: '',
      })

      const [first, second] = await Promise.all([
        useCase.decide({
          context: contractorContext,
          kind: 'other',
          note: 'ok',
          occurrenceId: occurrence.id,
        }),
        useCase.decide({
          context: contractorContext,
          kind: 'other',
          note: 'ok',
          occurrenceId: occurrence.id,
        }),
      ])

      const kinds = [first.kind, second.kind].sort()
      expect(kinds).toEqual(['changed', 'unchanged'])

      const decideEvents = await database.db
        .select({ id: tripOccurrenceCaseEvents.id })
        .from(tripOccurrenceCaseEvents)
        .where(
          and(
            eq(tripOccurrenceCaseEvents.companyId, company.companyId),
            eq(tripOccurrenceCaseEvents.toStatus, 'decided'),
          ),
        )
      expect(decideEvents).toHaveLength(1)
    })
  })
})

async function findCaseId(
  database: TestDatabase,
  companyId: string,
  occurrenceId: string,
): Promise<string | null> {
  return new DrizzleOccurrenceCaseRepository(database.db).findIdByOccurrenceId({
    companyId,
    occurrenceId,
  })
}
