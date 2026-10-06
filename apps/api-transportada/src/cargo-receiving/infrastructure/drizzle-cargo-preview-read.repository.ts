/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: as leituras da prévia, sempre filtradas pela empresa do contexto na própria
 * consulta. Contagens e grupos por roteiro numa consulta agrupada cada — nunca uma por item.
 */
import { and, asc, count, desc, eq } from 'drizzle-orm'

import { cargoPreviewRouteLoads } from '../../database/cargo-preview-link.schema.js'
import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import type { CargoPreviewReadRepositoryPort } from '../application/cargo-preview.port.js'
import type { CargoPreviewItemFilters } from '../application/cargo-preview-request.types.js'
import type {
  CargoPreviewDetail,
  CargoPreviewItemPage,
  CargoPreviewRouteGroup,
  CargoPreviewSummary,
} from '../application/cargo-preview.types.js'
import type { Page } from '../application/cargo-arrival.types.js'
import { toPage, type Database } from './cargo-arrival-persistence.support.js'
import { buildPreviewItemFilters, selectPreviewItemRows } from './cargo-preview-item.query.js'
import {
  buildPreviewFilters,
  buildPreviewListFilters,
} from './cargo-preview-persistence.support.js'
import {
  toCargoPreviewItemView,
  toCargoPreviewSummary,
  toStateCounts,
} from './cargo-preview-view.mapper.js'

const SUMMARY_COLUMNS = {
  arrivalId: cargoPreviews.arrivalId,
  contractorId: cargoPreviews.contractorId,
  contractorName: contractors.displayName,
  createdAt: cargoPreviews.createdAt,
  errorCode: cargoPreviews.errorCode,
  fileName: cargoPreviews.fileName,
  fileSha256: cargoPreviews.fileSha256,
  fileSizeBytes: cargoPreviews.fileSizeBytes,
  id: cargoPreviews.id,
  plannedDate: cargoPreviews.plannedDate,
  receivedAt: cargoPreviews.receivedAt,
  rowCount: cargoPreviews.rowCount,
  sheetName: cargoPreviews.sheetName,
  source: cargoPreviews.source,
  status: cargoPreviews.status,
  updatedAt: cargoPreviews.updatedAt,
}

const CONTRACTOR_JOIN = and(
  eq(contractors.companyId, cargoPreviews.companyId),
  eq(contractors.id, cargoPreviews.contractorId),
)

type Scope = { readonly companyId: string; readonly previewId: string }

export class DrizzleCargoPreviewReadRepository implements CargoPreviewReadRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async findSummary(params: Scope): Promise<CargoPreviewSummary | null> {
    const [row] = await this.database
      .select(SUMMARY_COLUMNS)
      .from(cargoPreviews)
      .leftJoin(contractors, CONTRACTOR_JOIN)
      .where(and(...buildPreviewFilters(params)))
    return row === undefined ? null : toCargoPreviewSummary(row)
  }

  public async list(
    params: Parameters<CargoPreviewReadRepositoryPort['list']>[0],
  ): Promise<Page<CargoPreviewSummary>> {
    const rows = await this.database
      .select(SUMMARY_COLUMNS)
      .from(cargoPreviews)
      .leftJoin(contractors, CONTRACTOR_JOIN)
      .where(and(...buildPreviewListFilters(params)))
      .orderBy(desc(cargoPreviews.receivedAt), desc(cargoPreviews.id))
      .limit(params.paging.limit + 1)
    return toPage({
      dateOf: (row) => row.receivedAt,
      limit: params.paging.limit,
      map: toCargoPreviewSummary,
      rows,
    })
  }

  public async findDetail(
    params: Scope & { readonly items: CargoPreviewItemFilters },
  ): Promise<CargoPreviewDetail | null> {
    const summary = await this.findSummary(params)
    if (summary === null) return null
    const [counts, routes, items] = await Promise.all([
      this.countByState(params),
      this.groupByRoute(params),
      this.pageItems({ ...params, ...params.items }),
    ])
    return { ...summary, counts, items, routes }
  }

  private async countByState(params: Scope): Promise<CargoPreviewDetail['counts']> {
    const rows = await this.database
      .select({ count: count(), state: cargoPreviewItems.matchState })
      .from(cargoPreviewItems)
      .where(
        and(
          eq(cargoPreviewItems.companyId, params.companyId),
          eq(cargoPreviewItems.previewId, params.previewId),
        ),
      )
      .groupBy(cargoPreviewItems.matchState)
    return toStateCounts(rows)
  }

  private async groupByRoute(params: Scope): Promise<readonly CargoPreviewRouteGroup[]> {
    const rows = await this.database
      .select({
        count: count(),
        loadOrigin: cargoPreviewRouteLoads.origin,
        loadReference: cargoPreviewRouteLoads.loadReference,
        routeName: cargoPreviewItems.routeName,
        state: cargoPreviewItems.matchState,
      })
      .from(cargoPreviewItems)
      .leftJoin(
        cargoPreviewRouteLoads,
        and(
          eq(cargoPreviewRouteLoads.companyId, cargoPreviewItems.companyId),
          eq(cargoPreviewRouteLoads.previewId, cargoPreviewItems.previewId),
          eq(cargoPreviewRouteLoads.routeName, cargoPreviewItems.routeName),
        ),
      )
      .where(
        and(
          eq(cargoPreviewItems.companyId, params.companyId),
          eq(cargoPreviewItems.previewId, params.previewId),
        ),
      )
      .groupBy(
        cargoPreviewItems.routeName,
        cargoPreviewItems.matchState,
        cargoPreviewRouteLoads.origin,
        cargoPreviewRouteLoads.loadReference,
      )
      .orderBy(asc(cargoPreviewItems.routeName))
    const groups = new Map<string, { rows: typeof rows; first: (typeof rows)[number] }>()
    for (const row of rows) {
      if (row.routeName === null) continue
      const group = groups.get(row.routeName)
      if (group === undefined) groups.set(row.routeName, { first: row, rows: [row] })
      else group.rows.push(row)
    }
    return [...groups.entries()].map(([routeName, group]) => ({
      counts: toStateCounts(group.rows),
      loadOrigin: group.first.loadOrigin,
      loadReference: group.first.loadReference,
      routeName,
    }))
  }

  private async pageItems(params: Scope & CargoPreviewItemFilters): Promise<CargoPreviewItemPage> {
    const rows = await selectPreviewItemRows(this.database, {
      filters: buildPreviewItemFilters(params),
      limit: params.limit + 1,
    })
    const visible = rows.slice(0, params.limit)
    const last = visible.at(-1)
    return {
      items: visible.map(toCargoPreviewItemView),
      nextCursor: rows.length > params.limit && last !== undefined ? String(last.rowNumber) : null,
    }
  }
}
