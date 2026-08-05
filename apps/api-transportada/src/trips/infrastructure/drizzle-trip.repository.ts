/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  nfeDocuments,
} from '../../database/database.schema.js'
import { tripDocuments, tripDrivers, trips } from '../../database/trip.schema.js'
import {
  violatedForeignKeyConstraint,
  violatedUniqueConstraint,
} from '../../database/postgres-error.support.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  CreateTripRecord,
  TripDetail,
  TripDocument,
  TripFilters,
  TripPage,
  TripRepositoryPort,
} from '../application/trip.port.js'
import { TripDocumentAlreadyLinkedError, TripDocumentNotFoundError } from '../domain/trip.error.js'
import type { TripDriverCandidate, TripVehicleCandidate } from '../domain/trip.policy.js'
import { mapTrip, mapTripDocument, mapTripDocumentDetail, mapTripDriver } from './trip.mapper.js'
import {
  buildTripDocumentListFilters,
  buildTripListFilters,
  cteAuthorizedExpression,
} from './trip.query.js'
import type { TripDatabase, TripQueryable } from './trip-queryable.type.js'

const LIVE_DOCUMENT_CONSTRAINTS = new Set([
  'trip_documents_live_nfe_document_unique',
  'trip_documents_live_freight_calculation_unique',
])

/** Nota/frete de UUID válido mas inexistente nesta empresa — sem tradução vira 500 genérico. */
const MISSING_REFERENCE_CONSTRAINTS = new Set([
  'trip_documents_company_nfe_document_fk',
  'trip_documents_company_freight_calculation_fk',
])

export class DrizzleTripRepository implements TripRepositoryPort {
  public constructor(private readonly database: TripDatabase) {}

  public async close(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return this.database.transaction(async (transaction) => {
      const [closed] = await transaction
        .update(trips)
        .set({ status: 'closed', updatedAt: sql`now()` })
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .returning({ id: trips.id })
      if (closed === undefined) return null
      return readTripDetail(transaction, input)
    })
  }

  public async create(input: CreateTripRecord): Promise<TripDetail> {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(trips)
        .values({ companyId: input.companyId, vehicleId: input.vehicleId })
        .returning({ id: trips.id })
      if (created === undefined) throw new Error('TRIP_CREATE_FAILED')

      if (input.crew.length > 0) {
        await transaction.insert(tripDrivers).values(
          input.crew.map((driver) => ({
            companyId: input.companyId,
            driverId: driver.driverId,
            driverName: driver.driverName,
            driverTaxId: driver.driverTaxId,
            position: BigInt(driver.position),
            tripId: created.id,
          })),
        )
      }

      const detail = await readTripDetail(transaction, {
        companyId: input.companyId,
        tripId: created.id,
      })
      if (detail === null) throw new Error('TRIP_CREATE_FAILED')
      return detail
    })
  }

  public async deliverDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    const [delivered] = await this.database
      .update(tripDocuments)
      .set({ deliveredAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(...buildTripDocumentFilters(input), tripStillOpen(input)))
      .returning()
    return delivered === undefined ? null : mapTripDocument(delivered)
  }

  public async findById(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return readTripDetail(this.database, input)
  }

  public async findDocumentById(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    const [record] = await this.database
      .select()
      .from(tripDocuments)
      .where(and(...buildTripDocumentFilters(input)))
      .limit(1)
    return record === undefined ? null : mapTripDocument(record)
  }

  public async findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<TripVehicleCandidate | null> {
    const [record] = await this.database
      .select({ id: fleetVehicles.id, role: fleetVehicles.role, status: fleetVehicles.status })
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)
    return record ?? null
  }

  public async linkDocument(input: {
    readonly companyId: string
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
    readonly tripId: string
  }): Promise<TripDocument> {
    // LIMITAÇÃO CONHECIDA: o insert não tem `WHERE` onde pendurar a condição de viagem aberta como
    // `deliverDocument`/`releaseDocument` têm, então segue a janela entre o `assertTripOpen` do caso
    // de uso e esta escrita — fechá-la exigiria transação com lock da viagem em outra tabela.
    const record = await runGuarded(async () => {
      const [created] = await this.database
        .insert(tripDocuments)
        .values({
          companyId: input.companyId,
          freightCalculationId: input.freightCalculationId,
          nfeDocumentId: input.nfeDocumentId,
          tripId: input.tripId,
        })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('TRIP_DOCUMENT_LINK_FAILED')
    return mapTripDocument(record)
  }

  public async listDrivers(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly TripDriverCandidate[]> {
    if (input.driverIds.length === 0) return []
    return this.database
      .select({
        id: fleetDrivers.id,
        name: fleetDrivers.name,
        status: fleetDrivers.status,
        taxId: fleetDrivers.taxId,
      })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          inArray(fleetDrivers.id, [...input.driverIds]),
        ),
      )
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: TripFilters
    readonly limit: number
  }): Promise<TripPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const conditions = buildTripListFilters({
      companyId: input.companyId,
      cursor,
      ...(input.filters === undefined ? {} : { filters: input.filters }),
    })

    const records = await this.database
      .select()
      .from(trips)
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt), desc(trips.id))
      .limit(input.limit + 1)

    const page = records.slice(0, input.limit)
    const last = page.at(-1)
    const nextCursor =
      records.length > input.limit && last !== undefined
        ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
        : null

    return { items: page.map(mapTrip), nextCursor }
  }

  public async releaseDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    const [released] = await this.database
      .update(tripDocuments)
      .set({ releasedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          ...buildTripDocumentFilters(input),
          isNull(tripDocuments.deliveredAt),
          isNull(tripDocuments.releasedAt),
          tripStillOpen(input),
        ),
      )
      .returning()
    return released === undefined ? null : mapTripDocument(released)
  }
}

/**
 * Fecha a corrida entre o `assertTripOpen` do caso de uso e a escrita: um `POST /trips/:id/close`
 * concorrente pode fechar a viagem no intervalo, e a condição faz o update simplesmente não achar
 * linha em vez de gravar sobre viagem fechada.
 */
function tripStillOpen(input: { readonly companyId: string; readonly tripId: string }) {
  return sql`exists (
    select 1 from ${trips}
    where ${trips.companyId} = ${input.companyId}
      and ${trips.id} = ${input.tripId}
      and ${trips.status} = 'open'
  )`
}

function buildTripDocumentFilters(input: {
  readonly companyId: string
  readonly documentId: string
  readonly tripId: string
}) {
  return [
    eq(tripDocuments.companyId, input.companyId),
    eq(tripDocuments.id, input.documentId),
    eq(tripDocuments.tripId, input.tripId),
  ]
}

async function readTripDetail(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripDetail | null> {
  const [record] = await queryable
    .select()
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (record === undefined) return null

  const driverRecords = await queryable
    .select()
    .from(tripDrivers)
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
    .orderBy(asc(tripDrivers.position))
  const documentRecords = await queryable
    .select({
      cteAuthorized: sql<boolean>`${cteAuthorizedExpression()}`,
      document: tripDocuments,
      freightCalculationStatus: freightCalculations.status,
      nfeDocumentStatus: nfeDocuments.status,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      freightCalculations,
      and(
        eq(freightCalculations.companyId, tripDocuments.companyId),
        eq(freightCalculations.id, tripDocuments.freightCalculationId),
      ),
    )
    .where(and(...buildTripDocumentListFilters(input)))
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))

  return {
    ...mapTrip(record),
    documents: documentRecords.map(mapTripDocumentDetail),
    drivers: driverRecords.map(mapTripDriver),
  }
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    const duplicated = violatedUniqueConstraint(error)
    if (duplicated !== undefined && LIVE_DOCUMENT_CONSTRAINTS.has(duplicated)) {
      throw new TripDocumentAlreadyLinkedError()
    }
    const missing = violatedForeignKeyConstraint(error)
    if (missing !== undefined && MISSING_REFERENCE_CONSTRAINTS.has(missing)) {
      throw new TripDocumentNotFoundError()
    }
    throw error
  }
}
