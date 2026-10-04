/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T309: correção e cancelamento contra Postgres de verdade. A linha da correção com o
 * conjunto anterior (CA02), a correção sem mudança real não grava nada (CA03), a tratativa aberta
 * recusa os dois com 409 (CA06), cancelar a mesma ocorrência duas vezes é 409 (CA07), e a ocorrência
 * cancelada sai da tratativa (CA08 — como `hasOpenCase` nunca vira `true` depois do cancelamento, a
 * cobrança da spec 164 nunca a alcança).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyOccurrenceTypes, tripOccurrenceCases } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { cancelOccurrence } from '../../src/trips/application/cancel-occurrence.use-case.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import {
  OccurrenceAlreadyCancelledError,
  OccurrenceCaseAlreadyOpenError,
  OccurrenceTypeItemsNotAllowedError,
  OccurrenceCancelledError,
} from '../../src/trips/domain/trip.error.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
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

async function seedSeparationOccurrenceType(
  database: TestDatabase,
  company: Company,
  overrides: {
    readonly allowsMultipleItems?: boolean
    readonly redeliveryPolicy?: 'allowed' | 'blocked' | 'unset'
  } = {},
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    allowsMultipleItems: overrides.allowsMultipleItems ?? true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: overrides.redeliveryPolicy ?? 'unset',
    stage: 'separation',
  })
  return id
}

async function register(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
  input: {
    readonly items?: readonly { code: string; quantity: null | string; unit: null | 'unit' }[]
    readonly productCode?: string
    readonly productCodes?: readonly string[]
    readonly redeliveryPolicy?: 'allowed' | 'blocked' | 'unset'
  } = {},
) {
  const uploads: { objectId: string; objectKey: string }[] = []
  return persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: input.items ?? [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: input.productCode ?? '',
      productCodes: input.productCodes ?? [],
      redeliveryPolicy: input.redeliveryPolicy ?? 'unset',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
}

describe('correção de itens da ocorrência (spec 167 T301/T309)', () => {
  testWithPostgres('grava o conjunto anterior e passa a valer o novo (CA02)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

      const saved = await register(database, company, trip, occurrenceTypeId, {
        items: [{ code: 'ITEM-1', quantity: null, unit: null }],
        productCode: 'ITEM-1',
        productCodes: ['ITEM-1'],
      })
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      /** Destino é a nota inteira (`productCodes: []`) — não exige validação contra `nfe_products`. */
      const corrected = await correctOccurrenceItems({
        actorUserId: company.userId,
        companyId: company.companyId,
        occurrenceId: saved.id,
        productCode: '',
        productCodes: [],
        unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
      })

      expect(corrected.productCodes).toEqual([])
      expect(corrected.corrections).toHaveLength(1)
      expect(corrected.corrections[0]?.previousItems).toEqual([
        { code: 'ITEM-1', quantity: null, unit: null },
      ])
      /** O fixture não semeia `identity_user_profiles` — `null` é o comportamento correto sem perfil. */
      expect(corrected.corrections[0]?.correctedByName).toBeNull()
    })
  })

  testWithPostgres(
    'tipo que virou off recusa produto e aceita esvaziar (spec 241 CA03)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

        const saved = await register(database, company, trip, occurrenceTypeId, {
          items: [{ code: 'ITEM-1', quantity: null, unit: null }],
          productCode: 'ITEM-1',
          productCodes: ['ITEM-1'],
        })
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        await database.db
          .update(companyOccurrenceTypes)
          .set({ itemsMode: 'off' })
          .where(eq(companyOccurrenceTypes.id, occurrenceTypeId))
        const correct = (productCodes: readonly string[]) =>
          correctOccurrenceItems({
            actorUserId: company.userId,
            companyId: company.companyId,
            occurrenceId: saved.id,
            productCode: '',
            productCodes,
            unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
          })

        await expect(correct(['ITEM-1'])).rejects.toBeInstanceOf(OccurrenceTypeItemsNotAllowedError)
        const emptied = await correct([])

        expect(emptied.productCodes).toEqual([])
        expect(emptied.corrections).toHaveLength(1)
      })
    },
  )

  testWithPostgres('sem mudança real não grava histórico e responde 200 (CA03)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

      const saved = await register(database, company, trip, occurrenceTypeId, {})
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      /** Nota inteira → nota inteira: mesmo conjunto (vazio), nada muda. */
      const corrected = await correctOccurrenceItems({
        actorUserId: company.userId,
        companyId: company.companyId,
        occurrenceId: saved.id,
        productCode: '',
        productCodes: [],
        unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
      })

      expect(corrected.corrections).toHaveLength(0)
      expect(corrected.productCodes).toEqual([])
    })
  })

  testWithPostgres('tratativa aberta recusa a correção com 409 (CA06)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company, {
        redeliveryPolicy: 'blocked',
      })

      const saved = await register(database, company, trip, occurrenceTypeId, {
        redeliveryPolicy: 'blocked',
      })
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      const [caseRow] = await database.db
        .select({ id: tripOccurrenceCases.id })
        .from(tripOccurrenceCases)
        .where(
          and(
            eq(tripOccurrenceCases.companyId, company.companyId),
            eq(tripOccurrenceCases.occurrenceId, saved.id),
          ),
        )
      if (caseRow === undefined) throw new Error('EXPECTED_CASE')

      await expect(
        correctOccurrenceItems({
          actorUserId: company.userId,
          companyId: company.companyId,
          occurrenceId: saved.id,
          productCode: '',
          productCodes: [],
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        }),
      ).rejects.toBeInstanceOf(OccurrenceCaseAlreadyOpenError)
    })
  })

  testWithPostgres(
    'corrigir uma ocorrência cancelada é 409 — cancelada é fim de linha',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

        const saved = await register(database, company, trip, occurrenceTypeId, {})
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        await cancelOccurrence({
          actorUserId: company.userId,
          companyId: company.companyId,
          occurrenceId: saved.id,
          reason: 'registrada por engano',
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        })

        await expect(
          correctOccurrenceItems({
            actorUserId: company.userId,
            companyId: company.companyId,
            occurrenceId: saved.id,
            productCode: '',
            productCodes: [],
            unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
          }),
        ).rejects.toBeInstanceOf(OccurrenceCancelledError)
      })
    },
  )
})

describe('cancelamento da ocorrência (spec 167 T303/T309)', () => {
  testWithPostgres('cancela com motivo, autor e hora (CA08)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

      const saved = await register(database, company, trip, occurrenceTypeId, {})
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      const cancelled = await cancelOccurrence({
        actorUserId: company.userId,
        companyId: company.companyId,
        occurrenceId: saved.id,
        reason: 'registrada por engano',
        unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
      })

      expect(cancelled.cancellation).not.toBeNull()
      expect(cancelled.cancellation?.reason).toBe('registrada por engano')
      /** Mesma ausência de perfil do fixture — ver o comentário acima. */
      expect(cancelled.cancellation?.cancelledByName).toBeNull()

      /** RF7: a ocorrência cancelada nunca abre tratativa depois — não há como ela entrar em cobrança. */
      const cases = await database.db
        .select({ id: tripOccurrenceCases.id })
        .from(tripOccurrenceCases)
        .where(eq(tripOccurrenceCases.occurrenceId, saved.id))
      expect(cases).toHaveLength(0)
    })
  })

  testWithPostgres('cancelar duas vezes é 409, nunca 204 silencioso (CA07)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company)

      const saved = await register(database, company, trip, occurrenceTypeId, {})
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      await cancelOccurrence({
        actorUserId: company.userId,
        companyId: company.companyId,
        occurrenceId: saved.id,
        reason: 'primeiro cancelamento',
        unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
      })

      await expect(
        cancelOccurrence({
          actorUserId: company.userId,
          companyId: company.companyId,
          occurrenceId: saved.id,
          reason: 'segunda tentativa',
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        }),
      ).rejects.toBeInstanceOf(OccurrenceAlreadyCancelledError)
    })
  })

  testWithPostgres('tratativa aberta recusa o cancelamento com 409 (CA06)', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceTypeId = await seedSeparationOccurrenceType(database, company, {
        redeliveryPolicy: 'allowed',
      })

      const saved = await register(database, company, trip, occurrenceTypeId, {
        redeliveryPolicy: 'allowed',
      })
      if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

      await expect(
        cancelOccurrence({
          actorUserId: company.userId,
          companyId: company.companyId,
          occurrenceId: saved.id,
          reason: 'não pode mais',
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        }),
      ).rejects.toBeInstanceOf(OccurrenceCaseAlreadyOpenError)
    })
  })
})
