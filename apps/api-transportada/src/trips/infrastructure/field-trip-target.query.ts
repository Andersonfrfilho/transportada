/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, sql, type SQL } from 'drizzle-orm'

import { tripDrivers, trips } from '../../database/trip.schema.js'
import type { FieldTripTarget } from '../application/field-trip-target.types.js'

/**
 * Spec 156 T3: o recorte que acha a viagem de campo, num lugar só. A consulta que usa isto já tem
 * `trips` no `from`/`join` e o `company_id` do contexto no `where`.
 *
 * - motorista: a viagem tem este motorista na tripulação. `exists` em vez do `inner join` de antes —
 *   o unique `(company_id, trip_id, driver_id)` garante no máximo uma linha, então o resultado é o
 *   mesmo, e o join deixa de ser pré-requisito da consulta.
 * - escritório: a viagem é a do caminho. O motorista pedido não entra: ele já foi conferido na
 *   resolução do alvo.
 */
export function fieldTripTargetCondition(target: FieldTripTarget): SQL {
  if (target.kind === 'trip') return eq(trips.id, target.tripId)

  return sql`exists (select 1 from ${tripDrivers} where ${tripDrivers.companyId} = ${trips.companyId} and ${tripDrivers.tripId} = ${trips.id} and ${tripDrivers.driverId} = ${target.driverId})`
}
