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
import { asc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm'

import { companyTollBoothCharges } from '../../database/company-toll-booth-charge.schema.js'
import { tollBooths } from '../../database/toll-booth.schema.js'
import {
  TOLL_BOOTH_CATALOG_DEFAULT_PAGE,
  TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE,
  TOLL_BOOTH_CATALOG_MAX_PER_PAGE,
} from '../application/toll-booth-catalog.constant.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogAxleChargeRow,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
} from '../application/toll-booth-catalog.port.js'
import { combineConditions, toRow } from './toll-booth-catalog-row.mapper.js'

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
    async readCatalogAxleCharges(): Promise<readonly TollBoothCatalogAxleChargeRow[]> {
      const rows = await database
        .select({ chargePerAxle: tollBooths.chargePerAxle, osmNodeId: tollBooths.osmNodeId })
        .from(tollBooths)

      return rows.map((row) => ({
        chargePerAxle: row.chargePerAxle,
        osmNodeId: Number(row.osmNodeId),
      }))
    },
  }
}
