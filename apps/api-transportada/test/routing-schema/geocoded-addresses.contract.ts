/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  GEOCODING_PRECISIONS,
  GEOCODING_SOURCES,
  geocodedAddresses,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  unqualifiedCheckSqlByName,
  columnNames,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

describe('geocoded addresses (ADR-0044 §3)', () => {
  test('is keyed by the same normalized address the stops already group by', () => {
    expect(columnNames(geocodedAddresses)).toEqual([
      'address_key',
      'latitude',
      'longitude',
      'external_place_id',
      'source',
      'precision',
      'geocoded_at',
      /** ADR-0062: "já gastamos por este endereço", e não "já tentamos". */
      'paid_refined_at',
      'created_at',
      'updated_at',
    ])
  })

  /**
   * A coordenada de um endereço não é de ninguém: duas empresas que entregam na mesma rua não
   * geocodificam duas vezes. `company_id` aqui seria cobrar o mesmo endereço por tenant.
   */
  test('carries no tenant column, because a coordinate belongs to no company', () => {
    expect(columnNames(geocodedAddresses)).not.toContain('company_id')
  })

  test('closes source and precision on the cascade, both ends of it', () => {
    const checks = checkSqlByName(geocodedAddresses)

    for (const source of GEOCODING_SOURCES) {
      expect(checks.geocoded_addresses_source_check).toContain(`'${source}'`)
    }
    for (const precision of GEOCODING_PRECISIONS) {
      expect(checks.geocoded_addresses_precision_check).toContain(`'${precision}'`)
    }
  })

  /**
   * Mitigação 1 da ADR-0044 §3, e a única que sobrevive a uma mudança de licença: o `place_id` é
   * armazenável indefinidamente sem exceção nenhuma. Uma mitigação que falha em silêncio não é
   * mitigação — por isso o banco recusa uma linha do Google sem ele.
   */
  test('refuses a Google-sourced row without the place id that is the licence exit', () => {
    expect(
      unqualifiedCheckSqlByName(geocodedAddresses).geocoded_addresses_place_id_check,
    ).toContain(`"source" <> 'google' or length("external_place_id") > 0`)
  })

  test('bounds the coordinate to the globe, so a swapped pair fails loudly', () => {
    const checks = checkSqlByName(geocodedAddresses)

    expect(checks.geocoded_addresses_latitude_check).toContain('between -90 and 90')
    expect(checks.geocoded_addresses_longitude_check).toContain('between -180 and 180')
  })

  test('requires the coordinate itself — a row without one localizes nothing', () => {
    expect(requiredColumnNames(geocodedAddresses)).toContain('latitude')
    expect(requiredColumnNames(geocodedAddresses)).toContain('longitude')
    expect(requiredColumnNames(geocodedAddresses)).toContain('source')
    expect(requiredColumnNames(geocodedAddresses)).toContain('precision')
  })
})
