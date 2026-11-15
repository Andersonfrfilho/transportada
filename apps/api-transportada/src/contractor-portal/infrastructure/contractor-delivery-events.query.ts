/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import type {
  ContractorDeliveryEvent,
  ContractorDeliveryEvents,
} from '../application/contractor-portal.types.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'
import { CONTRACTOR_ROLES } from './contractor-delivery.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 340 D4: os marcos da nota **pela chave de acesso**, no mesmo recorte do agendamento. `null`
 * quando a chave não é dele ou não existe. A nota que ainda não entrou em viagem tem só "recebida".
 */
export async function findContractorDeliveryEvents(
  database: Database,
  input: {
    readonly accessKey: string
    readonly companyId: string
    readonly scope: ContractorScope
  },
): Promise<ContractorDeliveryEvents | null> {
  const [row] = await database
    .select({
      addressKey: tripStops.addressKey,
      arrivedAt: tripStops.arrivedAt,
      deliveredAt: tripDocuments.deliveredAt,
      enRouteSince: tripStops.enRouteSince,
      issuedAt: nfeDocuments.issuedAt,
      latitude: geocodedAddresses.latitude,
      loadedAt: tripDocuments.loadedAt,
      longitude: geocodedAddresses.longitude,
      returnedAt: tripDocuments.returnedAt,
      separatedAt: tripDocuments.separatedAt,
    })
    .from(nfeDocuments)
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, nfeDocuments.companyId),
        eq(nfeParticipants.documentId, nfeDocuments.id),
        inArray(nfeParticipants.role, [...CONTRACTOR_ROLES]),
        inArray(nfeParticipants.taxId, [...input.scope.taxIds]),
      ),
    )
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, nfeDocuments.companyId),
        eq(tripDocuments.nfeDocumentId, nfeDocuments.id),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .leftJoin(
      tripStops,
      and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
    )
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(
      and(eq(nfeDocuments.companyId, input.companyId), eq(nfeDocuments.accessKey, input.accessKey)),
    )
    .limit(1)

  if (row === undefined) return null

  const candidates: readonly (readonly [ContractorDeliveryEvent['kind'], Date | null])[] = [
    ['received', row.issuedAt],
    ['separated', row.separatedAt],
    ['loaded', row.loadedAt],
    ['en_route', row.enRouteSince],
    ['arrived', row.arrivedAt],
    ['delivered', row.deliveredAt],
    ['returned', row.returnedAt],
  ]
  const events = candidates.flatMap(([kind, at]) =>
    at === null ? [] : [{ kind, occurredAt: at.toISOString() }],
  )

  return {
    destination:
      row.latitude === null || row.longitude === null
        ? null
        : { latitude: row.latitude, longitude: row.longitude },
    events,
  }
}
