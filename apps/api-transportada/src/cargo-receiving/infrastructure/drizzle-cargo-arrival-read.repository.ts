/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as leituras da chegada, sempre filtradas pela empresa do contexto na própria
 * consulta. As contagens da página vêm numa consulta só, agrupada — nunca uma por chegada.
 */
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { nfeAddresses, nfeDocuments } from '../../database/nfe.schema.js'
import type { ArrivalStateCounts } from '../domain/cargo-arrival-grouping.policy.js'
import type {
  AvailableArrivalDocumentsLookup,
  CargoArrivalReadRepositoryPort,
} from '../application/cargo-arrival.port.js'
import type {
  FindCargoArrivalRecordParams,
  ListAvailableArrivalDocumentsRecordParams,
  ListCargoArrivalsRecordParams,
} from '../application/cargo-arrival-request.types.js'
import type {
  CargoArrivalDetailRecord,
  CargoArrivalListRecord,
  CargoArrivalRecord,
  Page,
} from '../application/cargo-arrival.types.js'
import { selectAvailableDocuments } from './cargo-arrival-available.query.js'
import {
  isInLiveTripSql,
  recipientAddressSql,
  recipientJoin,
  recipientParticipant,
} from './cargo-arrival-document.query.js'
import {
  buildArrivalFilters,
  buildDescendingCursorFilter,
  toPage,
  type Database,
} from './cargo-arrival-persistence.support.js'

const ARRIVAL_COLUMNS = {
  arrivedAt: cargoArrivals.arrivedAt,
  contractorId: cargoArrivals.contractorId,
  contractorName: contractors.displayName,
  createdAt: cargoArrivals.createdAt,
  deliveryDeadlineBusinessDays: cargoArrivals.deliveryDeadlineBusinessDays,
  id: cargoArrivals.id,
  palletCount: cargoArrivals.palletCount,
  reference: cargoArrivals.reference,
  separationDueAt: cargoArrivals.separationDueAt,
  separationWindowHours: cargoArrivals.separationWindowHours,
  status: cargoArrivals.status,
}

const EMPTY_COUNTS: ArrivalStateCounts = { expected: 0, received: 0, separated: 0, total: 0 }

const CONTRACTOR_JOIN = and(
  eq(contractors.companyId, cargoArrivals.companyId),
  eq(contractors.id, cargoArrivals.contractorId),
)

export function buildArrivalListFilters(params: ListCargoArrivalsRecordParams): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(cargoArrivals.companyId, params.companyId),
    params.filters.contractorId === undefined
      ? undefined
      : eq(cargoArrivals.contractorId, params.filters.contractorId),
    params.filters.status === undefined
      ? undefined
      : eq(cargoArrivals.status, params.filters.status),
    buildDescendingCursorFilter({
      cursor: params.paging.cursor,
      dateColumn: cargoArrivals.arrivedAt,
      idColumn: cargoArrivals.id,
    }),
  ]
  return filters.filter((filter): filter is SQL => filter !== undefined)
}

export class DrizzleCargoArrivalReadRepository implements CargoArrivalReadRepositoryPort {
  public constructor(private readonly database: Database) {}

  public listAvailableDocuments(
    params: ListAvailableArrivalDocumentsRecordParams,
  ): Promise<AvailableArrivalDocumentsLookup> {
    return selectAvailableDocuments(this.database, params)
  }

  public async list(params: ListCargoArrivalsRecordParams): Promise<Page<CargoArrivalListRecord>> {
    const rows = await this.database
      .select(ARRIVAL_COLUMNS)
      .from(cargoArrivals)
      .innerJoin(contractors, CONTRACTOR_JOIN)
      .where(and(...buildArrivalListFilters(params)))
      .orderBy(desc(cargoArrivals.arrivedAt), desc(cargoArrivals.id))
      .limit(params.paging.limit + 1)
    const counts = await this.countStates({
      arrivalIds: rows.map((row) => row.id),
      companyId: params.companyId,
    })
    return toPage({
      dateOf: (row) => row.arrivedAt,
      limit: params.paging.limit,
      map: (row): CargoArrivalListRecord => ({
        ...row,
        counts: counts.get(row.id) ?? EMPTY_COUNTS,
      }),
      rows,
    })
  }

  public async findDetail(
    params: FindCargoArrivalRecordParams,
  ): Promise<CargoArrivalDetailRecord | null> {
    const [arrival] = await this.database
      .select(ARRIVAL_COLUMNS)
      .from(cargoArrivals)
      .innerJoin(contractors, CONTRACTOR_JOIN)
      .where(and(...buildArrivalFilters(params)))
    if (arrival === undefined) return null
    return {
      arrival: arrival satisfies CargoArrivalRecord,
      documents: await this.documents(params),
    }
  }

  private documents(params: FindCargoArrivalRecordParams) {
    return this.database
      .select({
        accessKey: nfeDocuments.accessKey,
        cityIbgeCode: cargoArrivalDocuments.cityIbgeCode,
        cityName: recipientAddressSql(nfeAddresses.city),
        isInLiveTrip: isInLiveTripSql(cargoArrivalDocuments.nfeDocumentId).mapWith(Boolean),
        nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
        number: nfeDocuments.number,
        receivedAt: cargoArrivalDocuments.receivedAt,
        recipientName: recipientParticipant.legalName,
        routeName: cargoArrivalDocuments.routeName,
        separatedAt: cargoArrivalDocuments.separatedAt,
        separationState: cargoArrivalDocuments.separationState,
        series: nfeDocuments.series,
      })
      .from(cargoArrivalDocuments)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, cargoArrivalDocuments.companyId),
          eq(nfeDocuments.id, cargoArrivalDocuments.nfeDocumentId),
        ),
      )
      .leftJoin(recipientParticipant, recipientJoin())
      .where(
        and(
          eq(cargoArrivalDocuments.companyId, params.companyId),
          eq(cargoArrivalDocuments.arrivalId, params.arrivalId),
        ),
      )
  }

  /** Uma linha por (chegada, estado) da página; a contagem por estado sai do agrupamento. */
  private async countStates(params: {
    readonly arrivalIds: readonly string[]
    readonly companyId: string
  }): Promise<ReadonlyMap<string, ArrivalStateCounts>> {
    if (params.arrivalIds.length === 0) return new Map()
    const rows = await this.database
      .select({
        arrivalId: cargoArrivalDocuments.arrivalId,
        separationState: cargoArrivalDocuments.separationState,
        total: count(),
      })
      .from(cargoArrivalDocuments)
      .where(
        and(
          eq(cargoArrivalDocuments.companyId, params.companyId),
          inArray(cargoArrivalDocuments.arrivalId, [...params.arrivalIds]),
        ),
      )
      .groupBy(cargoArrivalDocuments.arrivalId, cargoArrivalDocuments.separationState)
    const counts = new Map<string, Record<keyof ArrivalStateCounts, number>>()
    for (const row of rows) {
      const current = counts.get(row.arrivalId) ?? { ...EMPTY_COUNTS }
      current[row.separationState] += row.total
      current.total += row.total
      counts.set(row.arrivalId, current)
    }
    return counts
  }
}
