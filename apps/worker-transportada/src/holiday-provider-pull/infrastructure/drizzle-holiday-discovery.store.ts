/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O adaptador Drizzle da descoberta. A junção dos endereços é a do roteirizador
 * (`readPoolStops`): `nfe_participants` nos papéis `delivery`/`recipient` e `nfe_addresses`; a
 * **escolha** entre os dois fica em TypeScript (`resolvePhysicalDestination`), nunca aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  companyHolidayImportSettings,
  holidayImportCities,
} from '../../database/holiday-import.schema.js'
import { nfeAddresses, nfeParticipants } from '../../database/nfe.schema.js'
import { PHYSICAL_DESTINATION_ORIGINS } from '../../routing/domain/physical-destination.policy.js'
import type {
  DestinationRow,
  DiscoveryCompany,
  DiscoveryCursor,
  HolidayDiscoveryStore,
  SaveDiscoveryBatchParams,
} from '../application/holiday-discovery.port.js'

import {
  buildDocumentBatchQuery,
  LIST_DISCOVERY_COMPANIES_QUERY,
} from './holiday-discovery.query.js'

export type HolidayDiscoveryDatabase = ReturnType<typeof createDrizzleProvider>['db']

type CompanyRow = {
  readonly company_id: string
  readonly cursor_document_id: string | null
  readonly cursor_issued_at: string | null
  readonly cursor_updated_at: string | null
}

type DocumentRow = {
  readonly document_id: string
  readonly issued_at: string
  readonly updated_at: string
}

function toCompany(row: CompanyRow): DiscoveryCompany {
  const hasCursor =
    row.cursor_document_id !== null &&
    row.cursor_issued_at !== null &&
    row.cursor_updated_at !== null

  return {
    companyId: row.company_id,
    cursor: hasCursor
      ? {
          documentId: row.cursor_document_id,
          issuedAt: row.cursor_issued_at,
          updatedAt: row.cursor_updated_at,
        }
      : undefined,
  }
}

type Transaction = Parameters<Parameters<HolidayDiscoveryDatabase['transaction']>[0]>[0]

async function upsertCityCounts(transaction: Transaction, params: SaveDiscoveryBatchParams) {
  const { cityCounts, companyId, seenAt } = params
  if (cityCounts.size === 0) return

  await transaction
    .insert(holidayImportCities)
    .values(
      [...cityCounts].map(([cityIbgeCode, documentCount]) => ({
        cityIbgeCode,
        companyId,
        documentCount,
        lastSeenAt: seenAt,
      })),
    )
    .onConflictDoUpdate({
      set: {
        documentCount: sql`${holidayImportCities.documentCount} + excluded.document_count`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
      target: [holidayImportCities.companyId, holidayImportCities.cityIbgeCode],
    })
}

async function upsertCursor(transaction: Transaction, params: SaveDiscoveryBatchParams) {
  const { companyId, cursor } = params

  await transaction
    .insert(companyHolidayImportSettings)
    .values({
      companyId,
      cursorDocumentId: cursor.documentId,
      cursorIssuedAt: sql`${cursor.issuedAt}::timestamptz`,
      cursorUpdatedAt: sql`${cursor.updatedAt}::timestamptz`,
    })
    .onConflictDoUpdate({
      set: {
        cursorDocumentId: sql`excluded.cursor_document_id`,
        cursorIssuedAt: sql`excluded.cursor_issued_at`,
        cursorUpdatedAt: sql`excluded.cursor_updated_at`,
      },
      target: companyHolidayImportSettings.companyId,
    })
}

async function saveBatch(
  database: HolidayDiscoveryDatabase,
  params: SaveDiscoveryBatchParams,
): Promise<void> {
  // Uma transação: o lote contado e o cursor movido juntos, ou nenhum dos dois — senão a falha entre
  // os dois recontaria o lote no ciclo seguinte.
  await database.transaction(async (transaction) => {
    await upsertCityCounts(transaction, params)
    await upsertCursor(transaction, params)
  })
}

async function readDestinationRows(
  database: HolidayDiscoveryDatabase,
  params: { readonly companyId: string; readonly documentIds: readonly string[] },
): Promise<readonly DestinationRow[]> {
  const rows = await database
    .select({
      cityCode: nfeAddresses.cityCode,
      documentId: nfeParticipants.documentId,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
    })
    .from(nfeParticipants)
    .innerJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, params.companyId),
        inArray(nfeParticipants.documentId, [...params.documentIds]),
        inArray(nfeParticipants.role, [...PHYSICAL_DESTINATION_ORIGINS]),
      ),
    )

  return rows.map((row) => ({
    cityCode: row.cityCode,
    documentId: row.documentId,
    number: row.number,
    origin: row.role === 'delivery' ? ('delivery' as const) : ('recipient' as const),
    postalCode: row.postalCode,
  }))
}

export function createDrizzleHolidayDiscoveryStore(
  database: HolidayDiscoveryDatabase,
): HolidayDiscoveryStore {
  return {
    async listCompanies() {
      const rows = await database.execute<CompanyRow>(LIST_DISCOVERY_COMPANIES_QUERY)
      return [...rows].map(toCompany)
    },

    readDestinations: (params) => readDestinationRows(database, params),

    async readDocumentBatch(input) {
      const rows = await database.execute<DocumentRow>(buildDocumentBatchQuery(input))
      return [...rows].map(
        (row): DiscoveryCursor => ({
          documentId: row.document_id,
          issuedAt: row.issued_at,
          updatedAt: row.updated_at,
        }),
      )
    },

    saveBatch: (params) => saveBatch(database, params),
  }
}
