/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T4: a abertura da tratativa contra Postgres de verdade — `unset` não abre e o fluxo de
 * hoje fica byte a byte idêntico; `allowed`/`blocked` abrem em `recorded` com o evento de abertura,
 * dentro da **mesma transação** do registro (`persistSeparationOccurrenceWithAttachment`, o mesmo
 * caminho de `register-trip-occurrence.use-case.ts` em produção). E a corrida de verdade sobre
 * `DrizzleOccurrenceCaseRepository.transition`: duas transações competindo pela mesma tratativa —
 * uma grava, a outra relê o status já mudado (o lock de `select … for no key update` serializa) e
 * a própria máquina de estados recusa a transição que deixou de valer, com 409.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  tripOccurrenceCaseEvents,
  tripOccurrenceCases,
} from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { OccurrenceCaseTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
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
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy,
    stage: 'separation',
  })
  return id
}

async function register(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
  redeliveryPolicy: 'allowed' | 'blocked' | 'unset',
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
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
}

describe('abertura da tratativa de ocorrência (spec 164 T4)', () => {
  testWithPostgres(
    'tipo allowed/blocked abre a tratativa em recorded, na mesma transação do registro',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company, 'blocked')

        const saved = await register(database, company, trip, occurrenceTypeId, 'blocked')
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        const [caseRow] = await database.db
          .select()
          .from(tripOccurrenceCases)
          .where(
            and(
              eq(tripOccurrenceCases.companyId, company.companyId),
              eq(tripOccurrenceCases.occurrenceId, saved.id),
            ),
          )
        if (caseRow === undefined) throw new Error('EXPECTED_CASE')
        expect(caseRow.status).toBe('recorded')
        expect(caseRow.redeliveryPolicy).toBe('blocked')
        expect(caseRow.resolvedAt).toBeNull()

        const events = await database.db
          .select()
          .from(tripOccurrenceCaseEvents)
          .where(eq(tripOccurrenceCaseEvents.caseId, caseRow.id))
        expect(events).toHaveLength(1)
        expect(events[0]?.fromStatus).toBeNull()
        expect(events[0]?.toStatus).toBe('recorded')
        expect(events[0]?.actorKind).toBe('internal')
      })
    },
  )

  testWithPostgres(
    'tipo unset não abre tratativa — a ocorrência grava do mesmo jeito de hoje',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company, 'unset')

        const saved = await register(database, company, trip, occurrenceTypeId, 'unset')
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        const cases = await database.db
          .select()
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.occurrenceId, saved.id))
        expect(cases).toHaveLength(0)
      })
    },
  )
})

describe('escritor único da tratativa: corrida real contra Postgres (spec 164 T4)', () => {
  testWithPostgres(
    'a transição perdedora relê o status já mudado e recusa com 409, nunca 404 nem silêncio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceTypeId = await seedSeparationOccurrenceType(database, company, 'allowed')

        const saved = await register(database, company, trip, occurrenceTypeId, 'allowed')
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        const [caseRow] = await database.db
          .select({ id: tripOccurrenceCases.id })
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.occurrenceId, saved.id))
        if (caseRow === undefined) throw new Error('EXPECTED_CASE')

        // `recorded` → `under_review`, para as duas ações da corrida partirem do mesmo estado.
        const repository = new DrizzleOccurrenceCaseRepository(database.db)
        await repository.transition({
          action: 'review',
          actorKind: 'internal',
          actorUserId: company.userId,
          caseId: caseRow.id,
          companyId: company.companyId,
          hasSettlementItems: false,
          note: '',
        })

        const race = await raceAgainstBlocker(database, {
          actorUserId: company.userId,
          blockerNextStatus: 'returned_to_warehouse',
          caseId: caseRow.id,
          companyId: company.companyId,
          loser: () =>
            repository.transition({
              action: 'contractor_submission',
              actorKind: 'internal',
              actorUserId: company.userId,
              caseId: caseRow.id,
              companyId: company.companyId,
              hasSettlementItems: false,
              note: '',
            }),
        })

        expect(race.loserError).toBeInstanceOf(OccurrenceCaseTransitionNotAllowedError)

        const [finalCase] = await database.db
          .select({ status: tripOccurrenceCases.status })
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.id, caseRow.id))
        expect(finalCase?.status).toBe('returned_to_warehouse')

        // A perdedora nunca grava evento para uma transição que a máquina já tinha recusado.
        const events = await database.db
          .select({ toStatus: tripOccurrenceCaseEvents.toStatus })
          .from(tripOccurrenceCaseEvents)
          .where(eq(tripOccurrenceCaseEvents.caseId, caseRow.id))
        const toStatuses: readonly string[] = events.map((event) => event.toStatus)
        expect([...toStatuses].sort()).toEqual(
          ['recorded', 'returned_to_warehouse', 'under_review'].sort(),
        )
      })
    },
  )
})

/**
 * Molde de `raceAgainstBlocker` em `trip-status-write-guard.integration.ts`. Segura o lock da
 * linha da tratativa numa transação bloqueadora e, só depois que o escritor real (`loser`) já está
 * bloqueado esperando o mesmo lock, muda o status para `blockerNextStatus` e libera — a exclusão
 * vem do `for no key update` do próprio Postgres, sem `pg_sleep` nem espera de relógio. O escritor
 * real relê o status (já mudado) na própria transação e decide sozinho, pela mesma
 * `checkOccurrenceCaseTransition`, que a ação dele não vale mais.
 */
async function raceAgainstBlocker(
  database: TestDatabase,
  input: {
    readonly actorUserId: string
    readonly blockerNextStatus: 'returned_to_warehouse'
    readonly caseId: string
    readonly companyId: string
    readonly loser: () => Promise<unknown>
  },
): Promise<{ readonly loserError: unknown }> {
  let resolveLockAcquired: () => void
  const lockAcquired = new Promise<void>((resolve) => {
    resolveLockAcquired = resolve
  })
  let releaseBlocker: () => void
  const blockerReleased = new Promise<void>((resolve) => {
    releaseBlocker = resolve
  })

  const blockerPromise = database.db.transaction(async (transaction) => {
    await transaction
      .select({ status: tripOccurrenceCases.status })
      .from(tripOccurrenceCases)
      .where(
        and(
          eq(tripOccurrenceCases.companyId, input.companyId),
          eq(tripOccurrenceCases.id, input.caseId),
        ),
      )
      .for('no key update')
      .limit(1)
    resolveLockAcquired()
    await blockerReleased
    await transaction
      .update(tripOccurrenceCases)
      .set({ status: input.blockerNextStatus, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(tripOccurrenceCases.id, input.caseId))
    await transaction.insert(tripOccurrenceCaseEvents).values({
      actorKind: 'internal',
      actorUserId: input.actorUserId,
      caseId: input.caseId,
      companyId: input.companyId,
      fromStatus: 'under_review',
      note: 'devolvido ao galpão',
      toStatus: input.blockerNextStatus,
    })
  })

  await lockAcquired

  const loserPromise = input.loser().then(
    () => ({ error: null }),
    (error: unknown) => ({ error }),
  )

  releaseBlocker!()
  await blockerPromise
  const loserOutcome = await loserPromise

  return { loserError: loserOutcome.error }
}
