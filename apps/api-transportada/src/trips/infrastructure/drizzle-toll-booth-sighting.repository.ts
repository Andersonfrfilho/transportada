/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 095 item 4: quais praças a empresa já viu, lendo `trips.planned_toll` (congelado pela T11 da
 * spec 090). Nunca uma query jsonb no banco — o parser de fronteira (`parseTollRouteCost`) já decide
 * o que é forma inesperada, e reabrir essa decisão em SQL duplicaria a regra em dois lugares.
 */
import { and, eq, isNotNull } from 'drizzle-orm'

import { trips } from '../../database/trip.schema.js'
import { extractSeenTollBoothNodeIds } from '../../toll-booths/domain/toll-booth-sighting.policy.js'
import type { TollBoothSightingPort } from '../../toll-booths/application/toll-booth-sighting.port.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleTollBoothSightingRepository implements TollBoothSightingPort {
  public constructor(private readonly database: TripDatabase) {}

  public async readSeenOsmNodeIds(input: {
    readonly companyId: string
  }): Promise<readonly number[]> {
    const rows = await this.database
      .select({ plannedToll: trips.plannedToll })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), isNotNull(trips.plannedToll)))

    return extractSeenTollBoothNodeIds(rows.map((row) => row.plannedToll))
  }
}
