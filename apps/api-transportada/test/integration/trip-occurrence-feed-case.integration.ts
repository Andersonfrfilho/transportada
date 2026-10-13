/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T8 (RF10/RF11), contra Postgres real: o `left join` da tratativa no feed de ocorrências.
 * Ocorrência sem tratativa (`unset`) devolve `case: null` — nunca um estado inventado; o filtro por
 * estado da tratativa inclui `'none'` (sem tratativa).
 */
import { describe, expect } from 'bun:test'

import { identityUserProfiles } from '../../src/database/identity-user-profile.schema.js'
import { identityUsers } from '../../src/database/identity.schema.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import {
  findTripOccurrenceFeedItem,
  listTripOccurrenceFeed,
} from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
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

/** Uma pessoa com perfil completo — o contato existe de propósito, para provar que não sai. */
async function seedProfile(
  database: TestDatabase,
  name: string,
  phone: string,
  existingUserId?: string,
): Promise<string> {
  const userId = existingUserId ?? crypto.randomUUID()
  if (existingUserId === undefined) {
    await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  }
  const username = name.toLowerCase().replace(/\s+/gu, '.')
  await database.db.insert(identityUserProfiles).values({
    contactAddress: `${username}@example.com`,
    contactChannel: 'email',
    email: `${username}@example.com`,
    name,
    phone,
    userId,
    username,
  })
  return userId
}

async function register(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
  typeName: string,
) {
  const uploads: { objectId: string; objectKey: string }[] = []
  return persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      /** Spec 166: a nota inteira, sem item apontado — nada a contar. */
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy,
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName,
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
}

describe('o feed enxerga a tratativa (spec 164 T8)', () => {
  testWithPostgres(
    'ocorrência com tratativa devolve case; ocorrência sem tratativa devolve null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')

        const blockedTypeId = await seedOccurrenceType(
          database,
          company,
          'blocked',
          'Caixa violada',
        )
        const withCase = await register(
          database,
          company,
          trip,
          blockedTypeId,
          'blocked',
          'Caixa violada',
        )
        if (withCase === null) throw new Error('EXPECTED_OCCURRENCE')

        const unsetTypeId = await seedOccurrenceType(database, company, 'unset', 'Etiqueta rasgada')
        const withoutCase = await register(
          database,
          company,
          trip,
          unsetTypeId,
          'unset',
          'Etiqueta rasgada',
        )
        if (withoutCase === null) throw new Error('EXPECTED_OCCURRENCE')

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })

        const withCaseItem = page.items.find((item) => item.id === withCase.id)
        const withoutCaseItem = page.items.find((item) => item.id === withoutCase.id)
        if (withCaseItem === undefined || withoutCaseItem === undefined) {
          throw new Error('EXPECTED_BOTH_ITEMS')
        }

        expect(withCaseItem.case).toMatchObject({
          decision: null,
          redeliveryPolicy: 'blocked',
          settlementTotal: null,
          status: 'recorded',
        })
        expect(withoutCaseItem.case).toBeNull()
      })
    },
  )

  testWithPostgres(
    'quem pegou é o ator do review: ninguém antes, o mesmo depois, sem contato e sem outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const cases = new DrizzleOccurrenceCaseRepository(database.db)

        const colleagueId = await seedProfile(database, 'Carlos Lima', '11977770000')
        await seedProfile(database, 'Marina Souza', '11999990000', company.userId)
        const contractorUserId = await seedProfile(database, 'Fulano Contratante', '11955550000')

        const typeId = await seedOccurrenceType(database, company, 'allowed', 'Caixa violada')
        const occurrence = await register(
          database,
          company,
          trip,
          typeId,
          'allowed',
          'Caixa violada',
        )
        if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
        const caseId = await cases.findIdByOccurrenceId({
          companyId: company.companyId,
          occurrenceId: occurrence.id,
        })
        if (caseId === null) throw new Error('EXPECTED_CASE')
        const read = async () => {
          const page = await listTripOccurrenceFeed(database.db, {
            companyId: company.companyId,
            cursor: null,
            limit: 20,
            order: 'desc',
          })
          return page.items.find((item) => item.id === occurrence.id)
        }

        expect((await read())?.case?.takenBy).toBeNull()

        await cases.transition({
          action: 'review',
          actorKind: 'internal',
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          note: '',
        })
        await cases.transition({
          action: 'contractor_submission',
          actorKind: 'internal',
          actorUserId: colleagueId,
          caseId,
          companyId: company.companyId,
          note: '',
        })
        await cases.transition({
          action: 'decide',
          actorKind: 'contractor',
          actorUserId: contractorUserId,
          caseId,
          companyId: company.companyId,
          decisionKind: 'redelivery_authorized',
          decisionNote: 'autorizo',
          note: '',
        })

        const item = await read()
        expect(item?.case?.takenBy?.displayName).toBe('Marina Souza')
        expect(Number.isNaN(Date.parse(item?.case?.takenBy?.takenAt ?? ''))).toBe(false)
        const serialized = JSON.stringify(item)
        expect(serialized).not.toInclude('11999990000')
        expect(serialized).not.toInclude('@example.com')
        expect(serialized).not.toInclude('Carlos Lima')

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId: company.companyId,
          occurrenceId: occurrence.id,
        })
        const names = (sources ?? []).filter((source) => source.kind === 'case.transition')
        expect(names.map((source) => source.actor.name)).toContain('Marina Souza')
        expect(names.map((source) => source.actor.name)).toContain('Carlos Lima')
        const contractorSource = names.find((source) => source.actor.kind === 'contractor')
        expect(contractorSource?.actor.name).toBeNull()
        expect(JSON.stringify(sources)).not.toInclude('Fulano Contratante')

        const foreign = await listTripOccurrenceFeed(database.db, {
          companyId: otherCompany.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        expect(foreign.items).toHaveLength(0)
        expect(
          await findTripOccurrenceFeedItem(database.db, {
            companyId: otherCompany.companyId,
            occurrenceId: occurrence.id,
          }),
        ).toBeNull()
        expect(
          await findTripOccurrenceTimelineSources(database.db, {
            companyId: otherCompany.companyId,
            occurrenceId: occurrence.id,
          }),
        ).toBeNull()
      })
    },
  )

  testWithPostgres('tratativa cancelada antes de alguém pegar não tem responsável', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const cases = new DrizzleOccurrenceCaseRepository(database.db)
      const typeId = await seedOccurrenceType(database, company, 'allowed', 'Caixa violada')
      const occurrence = await register(database, company, trip, typeId, 'allowed', 'Caixa violada')
      if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
      const caseId = await cases.findIdByOccurrenceId({
        companyId: company.companyId,
        occurrenceId: occurrence.id,
      })
      if (caseId === null) throw new Error('EXPECTED_CASE')

      await cases.transition({
        action: 'cancel',
        actorKind: 'internal',
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        note: 'aberta por engano',
      })

      const page = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        limit: 20,
        order: 'desc',
      })
      const item = page.items.find((candidate) => candidate.id === occurrence.id)
      expect(item?.case?.status).toBe('cancelled')
      expect(item?.case?.takenBy).toBeNull()
    })
  })

  testWithPostgres('o filtro por estado da tratativa inclui "sem tratativa" (none)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')

      const blockedTypeId = await seedOccurrenceType(database, company, 'blocked', 'Caixa violada')
      const withCase = await register(
        database,
        company,
        trip,
        blockedTypeId,
        'blocked',
        'Caixa violada',
      )
      if (withCase === null) throw new Error('EXPECTED_OCCURRENCE')

      const unsetTypeId = await seedOccurrenceType(database, company, 'unset', 'Etiqueta rasgada')
      const withoutCase = await register(
        database,
        company,
        trip,
        unsetTypeId,
        'unset',
        'Etiqueta rasgada',
      )
      if (withoutCase === null) throw new Error('EXPECTED_OCCURRENCE')

      const onlyRecorded = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['recorded'] },
        limit: 20,
        order: 'desc',
      })
      expect(onlyRecorded.items.map((item) => item.id)).toEqual([withCase.id])

      const onlyNone = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['none'] },
        limit: 20,
        order: 'desc',
      })
      expect(onlyNone.items.map((item) => item.id)).toEqual([withoutCase.id])

      const both = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        filters: { caseStatusIn: ['none', 'recorded'] },
        limit: 20,
        order: 'desc',
      })
      expect(new Set(both.items.map((item) => item.id))).toEqual(
        new Set([withCase.id, withoutCase.id]),
      )
    })
  })
})
