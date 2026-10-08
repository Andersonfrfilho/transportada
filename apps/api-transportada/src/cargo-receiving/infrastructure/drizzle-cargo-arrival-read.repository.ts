/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as leituras da chegada, sempre filtradas pela empresa do contexto na própria
 * consulta. As contagens da página vêm numa consulta só, agrupada — nunca uma por chegada.
 */
import { and, count, eq, inArray } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import type { ArrivalStateCounts } from '../domain/cargo-arrival-grouping.policy.js'
import { isPendingSeparation } from '../domain/cargo-arrival-return.policy.js'
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
  CargoArrivalDocumentRecord,
  CargoArrivalListRecord,
  CargoArrivalRecord,
  Page,
} from '../application/cargo-arrival.types.js'
import { selectAvailableDocuments } from './cargo-arrival-available.query.js'
import {
  NO_ARRIVAL_DESTINATION_CITY,
  selectArrivalDestinationCities,
} from './cargo-arrival-destination.query.js'
import {
  isInLiveTripSql,
  recipientJoin,
  recipientParticipant,
} from './cargo-arrival-document.query.js'
import {
  buildArrivalListFilters,
  buildArrivalListOrderBy,
  toArrivalListPage,
} from './cargo-arrival-list.query.js'
import { buildArrivalFilters, type Database } from './cargo-arrival-persistence.support.js'

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

type ArrivalCounts = {
  readonly counts: ArrivalStateCounts
  readonly pendingSeparationCount: number
}
type MutableArrivalCounts = {
  counts: Record<keyof ArrivalStateCounts, number>
  pendingSeparationCount: number
}

const CONTRACTOR_JOIN = and(
  eq(contractors.companyId, cargoArrivals.companyId),
  eq(contractors.id, cargoArrivals.contractorId),
)

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
      .orderBy(...buildArrivalListOrderBy(params.order))
      .limit(params.paging.limit + 1)
    const counts = await this.countStates({
      arrivalIds: rows.map((row) => row.id),
      companyId: params.companyId,
    })
    return toArrivalListPage({
      limit: params.paging.limit,
      map: (row): CargoArrivalListRecord => ({
        ...row,
        counts: counts.get(row.id)?.counts ?? EMPTY_COUNTS,
        pendingSeparationCount: counts.get(row.id)?.pendingSeparationCount ?? 0,
      }),
      order: params.order,
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

  /** A cidade é lida do destino físico de agora, nunca do código gravado no registro. */
  private async documents(
    params: FindCargoArrivalRecordParams,
  ): Promise<CargoArrivalDocumentRecord[]> {
    const rows = await this.documentRows(params)
    const cities = await selectArrivalDestinationCities(this.database, {
      companyId: params.companyId,
      documentIds: rows.map((row) => row.nfeDocumentId),
    })
    return rows.map((row) => {
      const { cityIbgeCode, cityName } =
        cities.get(row.nfeDocumentId) ?? NO_ARRIVAL_DESTINATION_CITY
      return { ...row, cityIbgeCode, cityName }
    })
  }

  private documentRows(params: FindCargoArrivalRecordParams) {
    return this.database
      .select({
        accessKey: nfeDocuments.accessKey,
        isInLiveTrip: isInLiveTripSql(cargoArrivalDocuments.nfeDocumentId).mapWith(Boolean),
        nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
        number: nfeDocuments.number,
        receivedAt: cargoArrivalDocuments.receivedAt,
        recipientName: recipientParticipant.legalName,
        returnToContractor: cargoArrivalDocuments.returnToContractor,
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

  /** Uma linha por (chegada, estado, marcação) da página; contagens e pendente saem do agrupamento. */
  private async countStates(params: {
    readonly arrivalIds: readonly string[]
    readonly companyId: string
  }): Promise<ReadonlyMap<string, ArrivalCounts>> {
    if (params.arrivalIds.length === 0) return new Map()
    const rows = await this.database
      .select({
        arrivalId: cargoArrivalDocuments.arrivalId,
        returnToContractor: cargoArrivalDocuments.returnToContractor,
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
      .groupBy(
        cargoArrivalDocuments.arrivalId,
        cargoArrivalDocuments.separationState,
        cargoArrivalDocuments.returnToContractor,
      )
    const counts = new Map<string, MutableArrivalCounts>()
    for (const row of rows) {
      const current = counts.get(row.arrivalId) ?? {
        counts: { ...EMPTY_COUNTS },
        pendingSeparationCount: 0,
      }
      current.counts[row.separationState] += row.total
      current.counts.total += row.total
      if (isPendingSeparation(row)) current.pendingSeparationCount += row.total
      counts.set(row.arrivalId, current)
    }
    return counts
  }
}
