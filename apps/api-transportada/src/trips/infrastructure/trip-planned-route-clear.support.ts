/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T704 (M1): a rota velha morre **na mesma transação** que muda a parada.
 *
 * Antes, o recongelamento rodava depois do commit, dentro de um `catch` que engolia tudo, e nada
 * limpava `planned_*` antes dele. Falhar por qualquer motivo fora do roteirizador — catálogo de
 * praças, barracão, veículo, um SIGTERM no meio — deixava a viagem com `frozen: true` sobre uma
 * sequência de paradas que não existe mais, indistinguível de uma rota boa.
 *
 * Limpar aqui troca esse erro silencioso pelo estado que a D5 já descreve: rota nula é "ninguém
 * calculou ainda", e a tela sabe dizer isso. O congelamento continua best-effort, depois do commit.
 *
 * ⚠️ As sete colunas caem juntas porque `trips_planned_route_check` e `trips_planned_toll_check`
 * são tudo-ou-nada: zerar campo solto faria o Postgres recusar a transação inteira.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { trips } from '../../database/trip.schema.js'
import { TRIP_STATUSES_BEFORE_DISPATCH } from '../domain/trip-state.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export const CLEARED_PLANNED_ROUTE_COLUMNS = [
  'plannedDistanceMeters',
  'plannedDurationSeconds',
  'plannedReturnDistanceMeters',
  'plannedRoute',
  'plannedRouteFrozenAt',
  'plannedToll',
  'plannedTollFrozenAt',
] as const

const CLEARED_PLANNED_ROUTE = Object.fromEntries(
  CLEARED_PLANNED_ROUTE_COLUMNS.map((column) => [column, null]),
) as Readonly<Record<(typeof CLEARED_PLANNED_ROUTE_COLUMNS)[number], null>>

/**
 * A viagem despachada fica de fora: dali em diante o congelado é o roteiro que está na rua, e
 * limpá-lo apagaria a única descrição do que o motorista levou.
 */
export async function clearPlannedRoute(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<void> {
  await queryable
    .update(trips)
    .set({ ...CLEARED_PLANNED_ROUTE, updatedAt: sql`now()` })
    .where(
      and(
        eq(trips.companyId, input.companyId),
        eq(trips.id, input.tripId),
        inArray(trips.status, [...TRIP_STATUSES_BEFORE_DISPATCH]),
      ),
    )
}
