/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm'

import { addressCorrectionSuggestions } from '../../database/address-correction-suggestion.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  ListPendingItemSourceInput,
  PendingItemPage,
  PendingItemSourcePort,
} from '../application/pending-item-source.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 294 T3.2 (ADR-0113 §2.5): o ponto da chegada que o motorista mandou e a API não gravou direto.
 * Sempre da empresa do token — a tabela de coordenadas é global, a sugestão não.
 */
export function buildAddressSuggestionPendingItemFilters(input: {
  readonly companyId: string
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null
}): readonly SQL[] {
  const filters: SQL[] = [
    eq(addressCorrectionSuggestions.companyId, input.companyId),
    eq(addressCorrectionSuggestions.status, 'pending'),
  ]
  if (input.cursor !== null) {
    const cursorClause = or(
      lt(addressCorrectionSuggestions.createdAt, input.cursor.createdAt),
      and(
        eq(addressCorrectionSuggestions.createdAt, input.cursor.createdAt),
        lt(addressCorrectionSuggestions.id, input.cursor.id),
      ),
    )
    if (cursorClause !== undefined) filters.push(cursorClause)
  }
  return filters
}

export function createAddressSuggestionPendingItemSource(dependencies: {
  readonly database: Database
}): PendingItemSourcePort {
  return {
    kind: 'addressSuggestedByDriver',
    async list({ companyId, cursor, limit }: ListPendingItemSourceInput): Promise<PendingItemPage> {
      const rows = await dependencies.database
        .select({
          addressKey: addressCorrectionSuggestions.addressKey,
          createdAt: addressCorrectionSuggestions.createdAt,
          distanceMeters: addressCorrectionSuggestions.distanceMeters,
          id: addressCorrectionSuggestions.id,
          label: tripStops.label,
          latitude: addressCorrectionSuggestions.latitude,
          longitude: addressCorrectionSuggestions.longitude,
          tripStopId: addressCorrectionSuggestions.tripStopId,
        })
        .from(addressCorrectionSuggestions)
        .leftJoin(
          tripStops,
          and(
            eq(tripStops.id, addressCorrectionSuggestions.tripStopId),
            eq(tripStops.companyId, addressCorrectionSuggestions.companyId),
          ),
        )
        .where(
          and(
            ...buildAddressSuggestionPendingItemFilters({
              companyId,
              cursor: decodeKeysetCursor(cursor),
            }),
          ),
        )
        .orderBy(
          desc(addressCorrectionSuggestions.createdAt),
          desc(addressCorrectionSuggestions.id),
        )
        .limit(limit + 1)

      const pageRows = rows.slice(0, limit)
      const last = pageRows.at(-1)
      return {
        items: pageRows.map((row) => ({
          createdAt: row.createdAt,
          details: {
            addressKey: row.addressKey,
            distanceMeters: row.distanceMeters,
            latitude: row.latitude,
            longitude: row.longitude,
            tripStopId: row.tripStopId,
          },
          entityId: row.id,
          entityType: 'addressSuggestion' as const,
          kind: 'addressSuggestedByDriver' as const,
          label: row.label ?? row.addressKey,
        })),
        nextCursor: rows.length > limit && last !== undefined ? encodeKeysetCursor(last) : null,
      }
    },
    requiredPermission: 'trip.manage',
  }
}
