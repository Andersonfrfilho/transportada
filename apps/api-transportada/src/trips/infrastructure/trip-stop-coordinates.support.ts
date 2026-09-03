/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As coordenadas das paradas, na ordem do roteiro.
 *
 * ⚠️ A coordenada **não mora em `trip_stops`**: as colunas `latitude`/`longitude` da tabela estão
 * nulas em toda a base, e quem a guarda é `geocoded_addresses`, casada pela `address_key`. Ler as
 * colunas devolveria vazio sem erro nenhum — e o mapa desenharia o nada.
 *
 * `geocoded_addresses` não tem tenant de propósito (ADR-0044): é cache de endereço público, e o
 * recorte por empresa está em `trip_stops`, no `where` — o lado de cima da junção.
 */
import { and, asc, eq, isNotNull } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listTripStopCoordinates(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly RouteGeometryPoint[]> {
  const rows = await queryable
    .select({ latitude: geocodedAddresses.latitude, longitude: geocodedAddresses.longitude })
    .from(tripStops)
    .innerJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.tripId, input.tripId),
        isNotNull(geocodedAddresses.latitude),
      ),
    )
    .orderBy(asc(tripStops.sequence))

  return rows.map((row) => ({
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  }))
}
