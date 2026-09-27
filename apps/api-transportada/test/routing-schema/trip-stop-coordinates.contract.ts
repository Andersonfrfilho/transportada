/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ A spec 215 tirou daqui as três colunas de coordenada (`latitude`, `longitude`,
 * `geocoding_precision`) e o `trip_stops_coordinates_check`: elas nunca foram escritas, e o pino da
 * parada mora em `geocoded_addresses` pela `address_key` (ADR-0044). Quem vigia a volta delas é
 * `test/trip-schema/dead-coordinate-columns.contract.ts`. O que sobrou aqui é o roteiro — previsão
 * de chegada e perna —, que a spec 207 passa a gravar.
 */
import { describe, expect, test } from 'bun:test'

import { tripStops } from '../../src/database/database.schema.js'
import {
  columnNames,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

describe('trip stop route columns (spec 058 RF-3, spec 215)', () => {
  test('gains the columns the route suggestion writes back', () => {
    const columns = columnNames(tripStops)

    expect(columns).toContain('estimated_arrival_at')
    expect(columns).toContain('distance_from_previous_meters')
    expect(columns).toContain('duration_from_previous_seconds')
  })

  /**
   * A parada nasce do endereço da nota e o roteiro só chega depois. Exigir estes valores obrigaria a
   * migration a inventar um para toda parada existente — e inventar distância é inventar rota.
   */
  test('leaves them nullable, because a stop without a route is work in progress', () => {
    const required = requiredColumnNames(tripStops)

    expect(required).not.toContain('estimated_arrival_at')
    expect(required).not.toContain('distance_from_previous_meters')
    expect(required).not.toContain('duration_from_previous_seconds')
  })

  /** Distância negativa é conta errada, não rota curta. */
  test('refuses a negative leg', () => {
    expect(unqualifiedCheckSqlByName(tripStops).trip_stops_leg_check).toContain(
      '"distance_from_previous_meters" >= 0',
    )
    expect(unqualifiedCheckSqlByName(tripStops).trip_stops_leg_check).toContain(
      '"duration_from_previous_seconds" >= 0',
    )
  })
})
