/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: as duas consultas do prazo de entrega que não cabem no join das notas. Cada uma é UMA
 * por viagem (`selectDistinctOn` por nota), nunca uma por nota, e roda em série dentro da transação.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'

import { deliveredMomentSql } from '../../database/delivered-moment.support.js'
import { deliveryAddressOverrides, tripStopEvents } from '../../database/trip.schema.js'
import { DELIVERED_EVENT_KIND } from '../domain/delivery-event.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

type TripDocumentIdsParams = {
  readonly companyId: string
  readonly tripDocumentIds: readonly string[]
}

/**
 * A cidade do desvio manual mais recente de cada nota que tem desvio. A chave existir com `null` quer
 * dizer "o desvio vale e não diz a cidade" — a nota fica sem calendário, em vez de cair no endereço
 * cadastrado que o operador acabou de trocar.
 */
export async function loadDeliveryAddressOverrideCities(
  queryable: TripQueryable,
  params: TripDocumentIdsParams,
): Promise<ReadonlyMap<string, string | null>> {
  const rows = await queryable
    .selectDistinctOn([deliveryAddressOverrides.tripDocumentId], {
      newCityCode: deliveryAddressOverrides.newCityCode,
      tripDocumentId: deliveryAddressOverrides.tripDocumentId,
    })
    .from(deliveryAddressOverrides)
    .where(
      and(
        eq(deliveryAddressOverrides.companyId, params.companyId),
        inArray(deliveryAddressOverrides.tripDocumentId, [...params.tripDocumentIds]),
      ),
    )
    .orderBy(
      deliveryAddressOverrides.tripDocumentId,
      desc(deliveryAddressOverrides.createdAt),
      desc(deliveryAddressOverrides.id),
    )
  return new Map(rows.map((row) => [row.tripDocumentId, row.newCityCode]))
}

/**
 * O último `delivered` de cada nota pelo momento da 234 (`deliveredMomentSql`), nunca pela chegada ao
 * servidor. O desempate é o mesmo da nota do motorista: `created_at`, depois `id`.
 */
export async function loadDeliveredMoments(
  queryable: TripQueryable,
  params: TripDocumentIdsParams,
): Promise<ReadonlyMap<string, Date>> {
  const rows = await queryable
    .selectDistinctOn([tripStopEvents.tripDocumentId], {
      deliveredAt: deliveredMomentSql(tripStopEvents),
      tripDocumentId: tripStopEvents.tripDocumentId,
    })
    .from(tripStopEvents)
    .where(
      and(
        eq(tripStopEvents.companyId, params.companyId),
        eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
        inArray(tripStopEvents.tripDocumentId, [...params.tripDocumentIds]),
      ),
    )
    .orderBy(tripStopEvents.tripDocumentId, desc(tripStopEvents.createdAt), desc(tripStopEvents.id))
  return new Map(
    rows.flatMap((row) =>
      row.tripDocumentId === null ? [] : [[row.tripDocumentId, row.deliveredAt] as const],
    ),
  )
}
