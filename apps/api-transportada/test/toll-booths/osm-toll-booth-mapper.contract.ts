/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { mapOsmTollBoothFeature } from '../../src/toll-booths/domain/osm-toll-booth.mapper.js'
import type { OsmTollBoothFeature } from '../../src/toll-booths/domain/osm-toll-booth.types.js'

/** Uma feature real do extract (`n33554488`, Pedágio Nova Odessa), como `osmium export` a devolve. */
const NOVA_ODESSA: OsmTollBoothFeature = {
  geometry: { coordinates: [-47.238717, -22.7706642], type: 'Point' },
  id: 'n33554488',
  properties: {
    barrier: 'toll_booth',
    charge: '12.80BRL/motorcar;0.00BRL/motorcycle;12.80BRL/hgv/axle',
    check_date: '2026-07-01',
    direction: '130',
    note: 'Pedágio Nova Odessa (sentido Norte)',
    operator: 'CCR AutoBAn',
  },
  type: 'Feature',
}

describe('osm toll booth mapper (spec 090, T2)', () => {
  test('extrai o id de no do prefixo "n"', () => {
    expect(mapOsmTollBoothFeature(NOVA_ODESSA).osmNodeId).toBe(33554488n)
  })

  /** GeoJSON é `[longitude, latitude]` — inverter a ordem aqui erraria toda praça no mapa. */
  test('mapeia latitude e longitude na ordem certa, nao na ordem do GeoJSON', () => {
    const mapped = mapOsmTollBoothFeature(NOVA_ODESSA)

    expect(mapped.latitude).toBe('-22.7706642')
    expect(mapped.longitude).toBe('-47.2387170')
  })

  test('usa note como nome quando nao ha tag name', () => {
    expect(mapOsmTollBoothFeature(NOVA_ODESSA).name).toBe('Pedágio Nova Odessa (sentido Norte)')
  })

  test('prefere a tag name quando ela existe', () => {
    const withName: OsmTollBoothFeature = {
      ...NOVA_ODESSA,
      properties: { ...NOVA_ODESSA.properties, name: 'Praça Nova Odessa' },
    }

    expect(mapOsmTollBoothFeature(withName).name).toBe('Praça Nova Odessa')
  })

  test('praca sem name nem note fica sem nome, nunca descartada', () => {
    const bare: OsmTollBoothFeature = {
      geometry: { coordinates: [-46.6297836, -22.0165228], type: 'Point' },
      id: 'n9967813149',
      properties: { barrier: 'toll_booth' },
      type: 'Feature',
    }

    expect(mapOsmTollBoothFeature(bare)).toEqual({
      chargeCar: null,
      chargePerAxle: null,
      latitude: '-22.0165228',
      longitude: '-46.6297836',
      name: null,
      operator: null,
      osmNodeId: 9967813149n,
    })
  })

  test('decompoe a tarifa por eixo junto com o resto', () => {
    const mapped = mapOsmTollBoothFeature(NOVA_ODESSA)

    expect(mapped.chargeCar).toBe('12.80')
    expect(mapped.chargePerAxle).toBe('12.80')
  })
})
