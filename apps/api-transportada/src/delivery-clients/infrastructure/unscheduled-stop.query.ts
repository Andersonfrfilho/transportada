/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'

import { deliveryClients, tripStopSchedules } from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** O papel que decide o cliente de entrega: quem recebe a carga. */
const RECIPIENT_ROLE = 'recipient'

/** Agendamento que ainda não vale: nunca pedido, recusado, ou confirmado para uma data que mudou. */
const BLOCKING_STATUSES = ['pending', 'refused'] as const

/**
 * Spec 060 D3: as paradas que **impedem o despacho**. A pergunta é feita pela nota, não pela linha
 * de agendamento: o cliente `requires_scheduling` cuja parada nunca gerou agendamento bloqueia
 * igual — senão bastaria a linha não ter nascido para a trava sumir, que é o pior jeito de falhar.
 *
 * `diverged_at` entra na mesma lista: a viagem replanejada para outro dia tem agendamento
 * confirmado para a data velha, e seguir com ele é chegar na portaria com hora que não vale.
 */
export async function listUnscheduledStops(
  database: Database,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly string[]> {
  const rows = await database
    .selectDistinct({ stopId: tripStops.id })
    .from(tripStops)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripStops.companyId),
        eq(tripDocuments.stopId, tripStops.id),
        sql`${tripDocuments.releasedAt} is null`,
      ),
    )
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
        eq(deliveryClients.requiresScheduling, true),
      ),
    )
    .leftJoin(
      tripStopSchedules,
      and(
        eq(tripStopSchedules.companyId, tripStops.companyId),
        eq(tripStopSchedules.stopId, tripStops.id),
      ),
    )
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.tripId, input.tripId),
        or(
          sql`${tripStopSchedules.id} is null`,
          inArray(tripStopSchedules.status, [...BLOCKING_STATUSES]),
          isNotNull(tripStopSchedules.divergedAt),
        ),
      ),
    )

  return rows.map((row) => row.stopId)
}
