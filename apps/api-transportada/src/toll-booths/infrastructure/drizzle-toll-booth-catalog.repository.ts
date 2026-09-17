/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Plano 154 item 4: `toll_booths LEFT JOIN company_toll_booth_charges` da empresa do contexto. O
 * ajuste é pré-filtrado por `companyId` numa subconsulta antes do join — nunca no `ON` da tabela
 * crua — porque um `FULL JOIN` com o filtro só no `ON` deixaria vazar linha de outra empresa como
 * praça "órfã"; com `toll_booths` do lado esquerdo, este risco nem existe, mas a subconsulta
 * continua sendo a forma de nunca ler `company_toll_booth_charges` sem o filtro de tenant.
 *
 * `seen` é calculado em memória a partir de `seenOsmNodeIds` (já extraído por
 * `toll-booth-sighting.policy.ts`) — nunca uma consulta jsonb aqui, e nunca um `IN` por praça (a
 * página inteira decide de uma vez, sem N+1, code-standart §15).
 *
 * T202 (`seenFilter`): `'only'` nunca pagina — `seenOsmNodeIds` é o conjunto pequeno já conhecido
 * da empresa (spec 154 D1), e o use case que o chama precisa do grupo inteiro para ordenar as
 * vistas sem tarifa antes das vistas com tarifa. `'exclude'` pagina por `offset` explícito (nunca
 * `page`), porque o use case concatena [vistas] ++ [resto] e o corte de página pode cair no meio.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, ilike, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm'

import { companyTollBoothCharges } from '../../database/company-toll-booth-charge.schema.js'
import { tollBooths } from '../../database/toll-booth.schema.js'
import type { TollBoothChargeAdjustmentRow } from '../../companies/domain/toll-booth-charge.policy.js'
import {
  TOLL_BOOTH_CATALOG_DEFAULT_PAGE,
  TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE,
  TOLL_BOOTH_CATALOG_MAX_PER_PAGE,
} from '../application/toll-booth-catalog.constant.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
  TollBoothCatalogRow,
} from '../application/toll-booth-catalog.port.js'

export type TollBoothCatalogDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleTollBoothCatalogRepository(
  database: TollBoothCatalogDatabase,
): TollBoothCatalogPort {
  return {
    async listCatalog(input: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage> {
      const seenFilter = input.seenFilter ?? 'all'
      const seenNodeIds = input.seenOsmNodeIds.map((osmNodeId) => BigInt(osmNodeId))

      if (seenFilter === 'only' && seenNodeIds.length === 0) {
        return { page: 1, perPage: 0, rows: [], total: 0 }
      }

      const usesExplicitOffset = input.offset !== undefined
      const page = usesExplicitOffset
        ? 1
        : Math.max(input.page ?? TOLL_BOOTH_CATALOG_DEFAULT_PAGE, 1)
      const perPage = usesExplicitOffset
        ? Math.max(input.perPage ?? 0, 0)
        : Math.min(
            Math.max(input.perPage ?? TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE, 1),
            TOLL_BOOTH_CATALOG_MAX_PER_PAGE,
          )
      const offset = input.offset ?? (page - 1) * perPage

      const scopedCharges = database
        .select({
          actorUserId: companyTollBoothCharges.actorUserId,
          chargeCar: companyTollBoothCharges.chargeCar,
          chargePerAxle: companyTollBoothCharges.chargePerAxle,
          chargePerAxleAutomatic: companyTollBoothCharges.chargePerAxleAutomatic,
          observedOn: companyTollBoothCharges.observedOn,
          osmNodeId: companyTollBoothCharges.osmNodeId,
          updatedAt: companyTollBoothCharges.updatedAt,
        })
        .from(companyTollBoothCharges)
        .where(eq(companyTollBoothCharges.companyId, input.companyId))
        .as('scoped_charges')

      const searchTerm = input.search?.trim()
      const searchCondition =
        searchTerm === undefined || searchTerm === ''
          ? undefined
          : or(
              ilike(tollBooths.name, `%${searchTerm}%`),
              ilike(tollBooths.operator, `%${searchTerm}%`),
            )
      const seenCondition =
        seenFilter === 'only'
          ? inArray(tollBooths.osmNodeId, seenNodeIds)
          : seenFilter === 'exclude' && seenNodeIds.length > 0
            ? notInArray(tollBooths.osmNodeId, seenNodeIds)
            : undefined
      const whereCondition = combineConditions([searchCondition, seenCondition])

      const selection = {
        adjustmentActorUserId: scopedCharges.actorUserId,
        adjustmentChargeCar: scopedCharges.chargeCar,
        adjustmentChargePerAxle: scopedCharges.chargePerAxle,
        adjustmentChargePerAxleAutomatic: scopedCharges.chargePerAxleAutomatic,
        adjustmentObservedOn: scopedCharges.observedOn,
        adjustmentUpdatedAt: scopedCharges.updatedAt,
        catalogChargeCar: tollBooths.chargeCar,
        catalogChargePerAxle: tollBooths.chargePerAxle,
        catalogChargePerAxleAutomatic: tollBooths.chargePerAxleAutomatic,
        catalogName: tollBooths.name,
        catalogObservedOn: tollBooths.observedOn,
        catalogOperator: tollBooths.operator,
        osmNodeId: tollBooths.osmNodeId,
      }

      const seenIds = new Set(input.seenOsmNodeIds)

      if (seenFilter === 'only') {
        const rows = await database
          .select(selection)
          .from(tollBooths)
          .leftJoin(scopedCharges, eq(scopedCharges.osmNodeId, tollBooths.osmNodeId))
          .where(whereCondition)
          .orderBy(asc(tollBooths.osmNodeId))

        return {
          page: 1,
          perPage: rows.length,
          rows: rows.map((row) => toRow(row, seenIds)),
          total: rows.length,
        }
      }

      const [rows, [totalRow]] = await Promise.all([
        database
          .select(selection)
          .from(tollBooths)
          .leftJoin(scopedCharges, eq(scopedCharges.osmNodeId, tollBooths.osmNodeId))
          .where(whereCondition)
          .orderBy(asc(tollBooths.osmNodeId))
          .limit(perPage)
          .offset(offset),
        database
          .select({ total: sql<number>`count(*)::int` })
          .from(tollBooths)
          .leftJoin(scopedCharges, eq(scopedCharges.osmNodeId, tollBooths.osmNodeId))
          .where(whereCondition),
      ])

      return {
        page,
        perPage,
        rows: rows.map((row) => toRow(row, seenIds)),
        total: totalRow?.total ?? 0,
      }
    },
    async readAxleChargeGapCount(): Promise<number> {
      const [row] = await database
        .select({ gapCount: sql<number>`count(*)::int` })
        .from(tollBooths)
        .where(sql`${tollBooths.chargePerAxle} is null`)

      return row?.gapCount ?? 0
    },
  }
}

function combineConditions(conditions: readonly (SQL | undefined)[]): SQL | undefined {
  const defined = conditions.filter((condition): condition is SQL => condition !== undefined)
  if (defined.length === 0) return undefined
  if (defined.length === 1) return defined[0]
  return and(...defined)
}

type CatalogJoinRow = Readonly<{
  adjustmentActorUserId: string | null
  adjustmentChargeCar: string | null
  adjustmentChargePerAxle: string | null
  adjustmentChargePerAxleAutomatic: string | null
  adjustmentObservedOn: string | null
  adjustmentUpdatedAt: Date | null
  catalogChargeCar: string | null
  catalogChargePerAxle: string | null
  catalogChargePerAxleAutomatic: string | null
  catalogName: string | null
  catalogObservedOn: string
  catalogOperator: string | null
  osmNodeId: bigint
}>

function toRow(row: CatalogJoinRow, seenIds: ReadonlySet<number>): TollBoothCatalogRow {
  const osmNodeId = Number(row.osmNodeId)

  return {
    adjustment: toAdjustment(row, osmNodeId),
    catalog: {
      chargeCar: row.catalogChargeCar,
      chargePerAxle: row.catalogChargePerAxle,
      chargePerAxleAutomatic: row.catalogChargePerAxleAutomatic,
      name: row.catalogName,
      observedOn: row.catalogObservedOn,
      operator: row.catalogOperator,
      osmNodeId,
    },
    osmNodeId,
    seen: seenIds.has(osmNodeId),
  }
}

/** `actorUserId` nunca é nulo numa linha de ajuste de verdade — é o marcador de "sem ajuste aqui". */
function toAdjustment(row: CatalogJoinRow, osmNodeId: number): TollBoothChargeAdjustmentRow | null {
  if (row.adjustmentActorUserId === null || row.adjustmentObservedOn === null) return null

  return {
    actorUserId: row.adjustmentActorUserId,
    chargeCar: row.adjustmentChargeCar,
    chargePerAxle: row.adjustmentChargePerAxle,
    chargePerAxleAutomatic: row.adjustmentChargePerAxleAutomatic,
    observedOn: row.adjustmentObservedOn,
    osmNodeId,
    updatedAt: row.adjustmentUpdatedAt as Date,
  }
}
