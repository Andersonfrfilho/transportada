/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, RF13): o selo "possível cobrança na entrega" por parada, lido do cliente da nota (destinatário →
 * `delivery_clients.receiving_charge_flagged_at`). Duas consultas, sempre pela empresa do contexto: o interruptor do
 * tipo e as paradas marcadas.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import { deliveryClients } from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { companyOccurrenceTypes, tripDocuments } from '../../database/trip.schema.js'
import type { DriverStopChargeSealPort } from '../application/driver-stop-charge-seal.port.js'
import type { TripQueryable } from './trip-queryable.type.js'

const RECIPIENT_ROLE = 'recipient'
const RECEIVING_CHARGE_STOP_KIND = 'unexpected_charge'

export class DrizzleDriverStopChargeSealRepository implements DriverStopChargeSealPort {
  constructor(private readonly database: TripQueryable) {}

  async listSealedStops(input: {
    readonly companyId: string
    readonly stopIds: readonly string[]
  }): Promise<ReadonlyMap<string, string>> {
    if (input.stopIds.length === 0) return new Map()
    const [enabled] = await this.database
      .select({ id: companyOccurrenceTypes.id })
      .from(companyOccurrenceTypes)
      .where(
        and(
          eq(companyOccurrenceTypes.companyId, input.companyId),
          eq(companyOccurrenceTypes.stopKind, RECEIVING_CHARGE_STOP_KIND),
          eq(companyOccurrenceTypes.active, true),
          eq(companyOccurrenceTypes.showClientChargeSealToDriver, true),
        ),
      )
      .limit(1)
    if (enabled === undefined) return new Map()

    const rows = await this.database
      .select({
        flaggedAt: sql<Date>`max(${deliveryClients.receivingChargeFlaggedAt})`,
        stopId: tripDocuments.stopId,
      })
      .from(tripDocuments)
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_ROLE),
        ),
      )
      .innerJoin(
        deliveryClients,
        and(
          eq(deliveryClients.companyId, nfeParticipants.companyId),
          eq(deliveryClients.taxId, nfeParticipants.taxId),
          isNotNull(deliveryClients.receivingChargeFlaggedAt),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          inArray(tripDocuments.stopId, [...input.stopIds]),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .groupBy(tripDocuments.stopId)

    return new Map(
      rows.flatMap((row) =>
        row.stopId === null ? [] : [[row.stopId, new Date(row.flaggedAt).toISOString()] as const],
      ),
    )
  }
}
