/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { tripStops } from '../../src/database/database.schema.js'
import {
  columnNames,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

describe('trip stop coordinates (spec 058 RF-3)', () => {
  test('gains the six columns the route suggestion writes back', () => {
    const columns = columnNames(tripStops)

    expect(columns).toContain('latitude')
    expect(columns).toContain('longitude')
    expect(columns).toContain('geocoding_precision')
    expect(columns).toContain('estimated_arrival_at')
    expect(columns).toContain('distance_from_previous_meters')
    expect(columns).toContain('duration_from_previous_seconds')
  })

  /**
   * A parada nasce do endereço da nota e só ganha coordenada quando é geocodificada. Exigir
   * coordenada aqui obrigaria a migration a inventar uma para toda parada existente — e inventar
   * coordenada é inventar rota.
   */
  test('leaves all six nullable, because a stop without a coordinate is work in progress', () => {
    const required = requiredColumnNames(tripStops)

    expect(required).not.toContain('latitude')
    expect(required).not.toContain('longitude')
    expect(required).not.toContain('geocoding_precision')
    expect(required).not.toContain('estimated_arrival_at')
    expect(required).not.toContain('distance_from_previous_meters')
    expect(required).not.toContain('duration_from_previous_seconds')
  })

  /** Meia coordenada não localiza nada, e a precisão descreve o par — os três andam juntos. */
  test('refuses half a coordinate, and refuses a coordinate with no precision', () => {
    expect(unqualifiedCheckSqlByName(tripStops).trip_stops_coordinates_check).toContain(
      '("latitude" is null) = ("longitude" is null)',
    )
    expect(unqualifiedCheckSqlByName(tripStops).trip_stops_coordinates_check).toContain(
      '"geocoding_precision" is not null',
    )
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
