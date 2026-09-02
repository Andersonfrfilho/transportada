/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, gte } from 'drizzle-orm'

import { geocodingRefinementRequests } from '../../database/database.schema.js'
import type { RefineAddressTrail } from '../application/refine-address.use-case.js'

export type GeocodingRefinementDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * RF11: a marca **gasta dinheiro**, e `geocoded_addresses` não tem tenant — o endereço que uma
 * empresa manda reconsultar é reconsultado para todas. O teto por janela é o que impede um laço de
 * tela chamar o provedor pago em série.
 *
 * A janela é contada na própria trilha: a mesma tabela que registra também limita, e assim não há
 * duas verdades sobre quantas marcas houve.
 */
export const GEOCODING_REFINEMENT_WINDOW_MINUTES = 60
export const GEOCODING_REFINEMENT_WINDOW_LIMIT = 60

export function createDrizzleGeocodingRefinementRepository(
  database: GeocodingRefinementDatabase,
): RefineAddressTrail & {
  readonly countInWindow: (input: { readonly companyId: string }) => Promise<number>
} {
  return {
    async countInWindow(input) {
      const since = new Date(Date.now() - GEOCODING_REFINEMENT_WINDOW_MINUTES * 60_000)
      const [row] = await database
        .select({ total: count() })
        .from(geocodingRefinementRequests)
        .where(
          and(
            eq(geocodingRefinementRequests.companyId, input.companyId),
            gte(geocodingRefinementRequests.createdAt, since),
          ),
        )

      return row?.total ?? 0
    },

    async record(entry) {
      await database.insert(geocodingRefinementRequests).values({
        actorUserId: entry.actorUserId,
        addressKey: entry.addressKey,
        companyId: entry.companyId,
        outcome: entry.outcome,
        precision: entry.precision ?? null,
      })
    },
  }
}
