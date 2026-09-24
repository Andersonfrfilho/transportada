/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14b: `DrizzleRedeliveryApplicationRepository.applyRedeliveryApplication` contra
 * Postgres de verdade. `seedTrip` (`trip-field-office-database.fixture.ts`) sempre nasce
 * `in_transit` (já despachada) — aqui o teste monta a própria viagem/parada/documento com o status
 * que cada cenário precisa, e uma tratativa já `decided`/`redelivery_authorized` (o estado normal
 * antes deste endpoint ser chamado).
 */
import { eq } from 'drizzle-orm'
import { describe, expect } from 'bun:test'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { OccurrenceCaseTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { DrizzleRedeliveryApplicationRepository } from '../../src/trips/infrastructure/drizzle-redelivery-application.repository.js'
import {
  seedCompany,
  seedNfeDocument,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function seedTripWithStatus(
  database: TestDatabase,
  company: Company,
  status: 'dispatched' | 'route_planned',
): Promise<{ readonly tripId: string }> {
  const tripId = crypto.randomUUID()
  await database.db.insert(trips).values({
    companyId: company.companyId,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    id: tripId,
    status,
    vehicleId: company.vehicleId,
  })
  return { tripId }
}

async function seedStop(
  database: TestDatabase,
  company: Company,
  tripId: string,
  input: { readonly label: string; readonly sequence: bigint },
): Promise<string> {
  const stopId = crypto.randomUUID()
  await database.db.insert(tripStops).values({
    addressKey: `key-${stopId}`,
    companyId: company.companyId,
    id: stopId,
    label: input.label,
    sequence: input.sequence,
    tripId,
  })
  return stopId
}

async function seedDocumentWithOccurrenceCase(
  database: TestDatabase,
  company: Company,
  input: { readonly stopId: string | null; readonly tripId: string },
): Promise<{ readonly caseId: string; readonly tripDocumentId: string }> {
  const tripDocumentId = crypto.randomUUID()
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: tripDocumentId,
    nfeDocumentId: await seedNfeDocument(database, company),
    separationStatus: 'loaded',
    stopId: input.stopId,
    tripId: input.tripId,
  })

  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: occurrenceTypeId,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
  })

  const occurrenceId = crypto.randomUUID()
  await database.db.insert(tripDocumentOccurrences).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    id: occurrenceId,
    occurrenceTypeId,
    stage: 'separation',
    tripDocumentId,
  })

  const caseId = crypto.randomUUID()
  await database.db.insert(tripOccurrenceCases).values({
    companyId: company.companyId,
    decidedAt: new Date('2026-09-22T12:00:00.000Z'),
    decidedByUserId: company.userId,
    decisionKind: 'redelivery_authorized',
    id: caseId,
    occurrenceId,
    redeliveryPolicy: 'allowed',
    status: 'decided',
  })

  return { caseId, tripDocumentId }
}

describe('aplicar a proposta de reentrega (spec 164 T14b)', () => {
  testWithPostgres('parada só com a nota: reordena para o fim e registra reordered', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const { tripId } = await seedTripWithStatus(database, company, 'route_planned')
      const otherStopId = await seedStop(database, company, tripId, {
        label: 'Outra parada',
        sequence: 1n,
      })
      const targetStopId = await seedStop(database, company, tripId, {
        label: 'Parada da ocorrência',
        sequence: 2n,
      })
      const { caseId } = await seedDocumentWithOccurrenceCase(database, company, {
        stopId: targetStopId,
        tripId,
      })

      const repository = new DrizzleRedeliveryApplicationRepository(database.db)
      const result = await repository.applyRedeliveryApplication({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
      })

      expect(result).toEqual({ application: 'reordered' })

      const stops = await database.db
        .select({ id: tripStops.id, sequence: tripStops.sequence })
        .from(tripStops)
        .where(eq(tripStops.tripId, tripId))
        .orderBy(tripStops.sequence)
      expect(stops.map((stop) => stop.id)).toEqual([otherStopId, targetStopId])

      const [caseRow] = await database.db
        .select()
        .from(tripOccurrenceCases)
        .where(eq(tripOccurrenceCases.id, caseId))
      expect(caseRow?.redeliveryApplication).toBe('reordered')
      expect(caseRow?.redeliveryAppliedAt).not.toBeNull()
      expect(caseRow?.redeliveryAppliedByUserId).toBe(company.userId)
    })
  })

  testWithPostgres('parada com outra nota viva: libera a nota, a outra fica intocada', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const { tripId } = await seedTripWithStatus(database, company, 'route_planned')
      const stopId = await seedStop(database, company, tripId, { label: 'Parada', sequence: 1n })
      const { caseId, tripDocumentId } = await seedDocumentWithOccurrenceCase(database, company, {
        stopId,
        tripId,
      })
      const [otherDocument] = await database.db
        .insert(tripDocuments)
        .values({
          companyId: company.companyId,
          nfeDocumentId: await seedNfeDocument(database, company),
          separationStatus: 'loaded',
          stopId,
          tripId,
        })
        .returning({ id: tripDocuments.id })

      const repository = new DrizzleRedeliveryApplicationRepository(database.db)
      const result = await repository.applyRedeliveryApplication({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
      })

      expect(result).toEqual({ application: 'released' })

      const [releasedDocument] = await database.db
        .select({ releasedAt: tripDocuments.releasedAt, stopId: tripDocuments.stopId })
        .from(tripDocuments)
        .where(eq(tripDocuments.id, tripDocumentId))
      expect(releasedDocument?.releasedAt).not.toBeNull()
      expect(releasedDocument?.stopId).toBeNull()

      const [untouchedDocument] = await database.db
        .select({ releasedAt: tripDocuments.releasedAt, stopId: tripDocuments.stopId })
        .from(tripDocuments)
        .where(eq(tripDocuments.id, otherDocument?.id ?? ''))
      expect(untouchedDocument?.releasedAt).toBeNull()
      expect(untouchedDocument?.stopId).toBe(stopId)

      const [caseRow] = await database.db
        .select({ redeliveryApplication: tripOccurrenceCases.redeliveryApplication })
        .from(tripOccurrenceCases)
        .where(eq(tripOccurrenceCases.id, caseId))
      expect(caseRow?.redeliveryApplication).toBe('released')
    })
  })

  testWithPostgres(
    'despachar a viagem entre a proposta e a aplicação deixa trip_stops intocada e grava refused',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const { tripId } = await seedTripWithStatus(database, company, 'route_planned')
        const stopId = await seedStop(database, company, tripId, { label: 'Parada', sequence: 1n })
        const { caseId } = await seedDocumentWithOccurrenceCase(database, company, {
          stopId,
          tripId,
        })

        const stopsBefore = await database.db
          .select({ id: tripStops.id, sequence: tripStops.sequence })
          .from(tripStops)
          .where(eq(tripStops.tripId, tripId))

        /** A viagem despacha entre o GET da proposta e este POST — o TOCTOU que a task fecha. */
        await database.db.update(trips).set({ status: 'dispatched' }).where(eq(trips.id, tripId))

        const repository = new DrizzleRedeliveryApplicationRepository(database.db)
        const result = await repository.applyRedeliveryApplication({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
        })

        expect(result).toEqual({ application: 'refused' })

        const stopsAfter = await database.db
          .select({ id: tripStops.id, sequence: tripStops.sequence })
          .from(tripStops)
          .where(eq(tripStops.tripId, tripId))
        expect(stopsAfter).toEqual(stopsBefore)

        const [caseRow] = await database.db
          .select({ redeliveryApplication: tripOccurrenceCases.redeliveryApplication })
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.id, caseId))
        expect(caseRow?.redeliveryApplication).toBe('refused')
      })
    },
  )

  testWithPostgres('já aplicada: repetir a chamada é 409, nunca uma segunda escrita', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const { tripId } = await seedTripWithStatus(database, company, 'route_planned')
      const stopId = await seedStop(database, company, tripId, { label: 'Parada', sequence: 1n })
      const { caseId } = await seedDocumentWithOccurrenceCase(database, company, {
        stopId,
        tripId,
      })

      const repository = new DrizzleRedeliveryApplicationRepository(database.db)
      await repository.applyRedeliveryApplication({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
      })

      await expect(
        repository.applyRedeliveryApplication({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
        }),
      ).rejects.toBeInstanceOf(OccurrenceCaseTransitionNotAllowedError)
    })
  })
})
