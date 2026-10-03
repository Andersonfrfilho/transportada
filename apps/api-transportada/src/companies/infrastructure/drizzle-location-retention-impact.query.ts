/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, count, eq, isNotNull, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'
import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../database/trip.schema.js'
import type { LocationRetentionImpactEntry } from '../application/location-retention-settings.port.js'
import { summarizeImpactCount } from '../domain/location-retention-impact.policy.js'
import {
  LOCATION_RETENTION_IMPACT_CAP,
  LOCATION_RETENTION_IMPACT_KIND,
  type LocationRetentionImpactKind,
} from '../domain/location-retention.constant.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

type LocatedEventTable =
  | typeof tripDeliveryProofs
  | typeof tripDocumentOccurrences
  | typeof tripStatusEvents
  | typeof tripStopEvents
  | typeof tripStopOccurrences
type ImpactSource = {
  readonly kind: LocationRetentionImpactKind
  readonly table: LocatedEventTable
  readonly timeColumn: AnyPgColumn
}

/** Mesma ordem e mesma coluna de tempo dos redatores do worker (spec 239 D6). */
const IMPACT_SOURCES: readonly ImpactSource[] = [
  {
    kind: LOCATION_RETENTION_IMPACT_KIND.stopEvent,
    table: tripStopEvents,
    timeColumn: tripStopEvents.createdAt,
  },
  {
    kind: LOCATION_RETENTION_IMPACT_KIND.deliveryProof,
    table: tripDeliveryProofs,
    timeColumn: tripDeliveryProofs.createdAt,
  },
  {
    kind: LOCATION_RETENTION_IMPACT_KIND.statusEvent,
    table: tripStatusEvents,
    timeColumn: tripStatusEvents.recordedAt,
  },
  {
    kind: LOCATION_RETENTION_IMPACT_KIND.stopOccurrence,
    table: tripStopOccurrences,
    timeColumn: tripStopOccurrences.createdAt,
  },
  {
    kind: LOCATION_RETENTION_IMPACT_KIND.documentOccurrence,
    table: tripDocumentOccurrences,
    timeColumn: tripDocumentOccurrences.createdAt,
  },
]

/**
 * Uma consulta por tabela (sem N+1), lendo no máximo `CAP + 1` linhas da empresa do contexto pelo
 * índice parcial `(company_id, tempo) where latitude is not null`. Só `count`: nenhum id, data ou
 * coordenada de evento sai daqui.
 */
export function countLocationRetentionImpact(
  database: CompanySettingsDatabase,
  input: { readonly companyId: string; readonly now: Date; readonly retentionDays: number },
): Promise<readonly LocationRetentionImpactEntry[]> {
  return Promise.all(
    IMPACT_SOURCES.map(async (source) => {
      const limited = database
        .select({ one: sql<number>`1`.as('one') })
        .from(source.table)
        .where(
          and(
            eq(source.table.companyId, input.companyId),
            isNotNull(source.table.latitude),
            sql`${source.timeColumn} < ${timestamptzParameter(input.now)} - make_interval(days => ${input.retentionDays})`,
          ),
        )
        .limit(LOCATION_RETENTION_IMPACT_CAP + 1)
        .as('limited_rows')
      const [row] = await database.select({ total: count() }).from(limited)

      return { kind: source.kind, ...summarizeImpactCount(row?.total ?? 0) }
    }),
  )
}
