/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 215 CA2: rede contra a volta das colunas mortas. `latitude`, `longitude` e
 * `geocoding_precision` de `trip_stops` nunca foram escritas (spec 079 T009) — a coordenada viva da
 * parada mora em `geocoded_addresses`, casada pela `address_key` (ADR-0044 §5). Enquanto existiam,
 * respondiam `null` sem reclamar e já causaram três leituras erradas: o mapa da viagem (079 T012),
 * `GET /me/trips/current` (199) e a pontualidade da foto (159). Este contrato reprova se qualquer
 * uma delas voltar a `tripStops` em `trip.schema.ts`.
 *
 * ⚠️ Não confundir com as colunas de **perna** (`distance_from_previous_meters`,
 * `duration_from_previous_seconds`), que ficam — a spec 207 passa a gravá-las — nem com
 * `en_route_since`/`en_route_tapped_at` (spec 206). Nenhuma das duas é assunto deste contrato.
 */
import { describe, expect, test } from 'bun:test'

import { tripStops } from '../../src/database/database.schema.js'
import { columnNames } from '../fiscal-schema/support.js'

describe('trip_stops esqueceu as colunas de coordenada mortas (spec 215 CA2)', () => {
  test('a coordenada da parada só existe em geocoded_addresses, nunca em trip_stops', () => {
    const columns = columnNames(tripStops)

    expect(columns).not.toContain('latitude')
    expect(columns).not.toContain('longitude')
    expect(columns).not.toContain('geocoding_precision')
  })
})
