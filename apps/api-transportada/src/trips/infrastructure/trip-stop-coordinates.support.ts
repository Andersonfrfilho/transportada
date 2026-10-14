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
 * ⚠️ Spec 153 T704 (M4) mandava devolver `null` para qualquer parada sem coordenada ("sem
 * coordenada, sem rota"). **Revertido em parte por decisão do usuário (13/10/2026):** uma parada sem
 * ponto travava a viagem inteira em Rascunho (caso ef64efdd). Agora a parada sem coordenada é
 * **pulada** e a rota segue com as demais; `null` só quando há parada e nenhuma tem coordenada. A
 * tela nomeia as paradas que ficaram fora ("Sem localização no mapa: …"), então a rota parcial não é
 * silenciosa — mas a distância, e com ela combustível e valoração, não inclui a perna pulada.
 */
import { and, asc, eq, sql } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Parada sem nota viva (todas liberadas, ou nenhuma) não é parada: ninguém vai descarregar ali, e o
 * seu endereço sem coordenada derrubava o roteiro inteiro. A liberação normal já apaga a parada que
 * esvazia (`reconcileStopOnUnlink`); isto cobre a que sobrou por outro caminho.
 */
export function stopHasLiveDocument() {
  return sql`exists (select 1 from ${tripDocuments} where ${tripDocuments.companyId} = ${tripStops.companyId} and ${tripDocuments.stopId} = ${tripStops.id} and ${tripDocuments.releasedAt} is null)`
}

export async function listTripStopCoordinates(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly RouteGeometryPoint[] | null> {
  const rows = await queryable
    .select({ latitude: geocodedAddresses.latitude, longitude: geocodedAddresses.longitude })
    .from(tripStops)
    /** `leftJoin` de propósito: a parada sem cache geocodificado precisa **aparecer** para vetar. */
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.tripId, input.tripId),
        stopHasLiveDocument(),
      ),
    )
    .orderBy(asc(tripStops.sequence))

  const coordinates: RouteGeometryPoint[] = []
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) continue
    coordinates.push({ latitude: Number(row.latitude), longitude: Number(row.longitude) })
  }
  if (rows.length > 0 && coordinates.length === 0) return null

  return coordinates
}
