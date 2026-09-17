/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As coordenadas das paradas, na ordem do roteiro.
 *
 * ⚠️ A coordenada **não mora em `trip_stops`**: quem a guarda é `geocoded_addresses`, casada pela
 * `address_key`. A parada teve colunas de coordenada da 058 até a 215, nulas em toda a base: lê-las
 * devolvia vazio sem erro nenhum, e o mapa desenhava o nada.
 *
 * `geocoded_addresses` não tem tenant de propósito (ADR-0044): é cache de endereço público, e o
 * recorte por empresa está em `trip_stops`, no `where` — o lado de cima da junção.
 *
 * ⚠️ Spec 153 T704 (M4): parada sem coordenada devolve `null`, **nunca** o subconjunto das que
 * têm. Filtrar a parada não geocodificada produzia uma rota parcial silenciosa — traçado sem
 * aquela perna e distância menor do que a viagem de verdade —, e essa distância alimenta cálculo
 * de combustível e valoração. O caso extremo da spec é taxativo: sem coordenada, sem rota.
 */
import { and, asc, eq } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listTripStopCoordinates(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly RouteGeometryPoint[] | null> {
  const rows = await queryable
    .select({ latitude: geocodedAddresses.latitude, longitude: geocodedAddresses.longitude })
    .from(tripStops)
    /** `leftJoin` de propósito: a parada sem cache geocodificado precisa **aparecer** para vetar. */
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(asc(tripStops.sequence))

  const coordinates: RouteGeometryPoint[] = []
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) return null
    coordinates.push({ latitude: Number(row.latitude), longitude: Number(row.longitude) })
  }

  return coordinates
}
