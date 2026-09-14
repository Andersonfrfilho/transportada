/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { vehicleVolumeReferences } from '../../src/database/database.schema.js'
import { checkSqlByName, columnNames, requiredColumnNames } from '../fiscal-schema/support.js'

describe('vehicle volume reference schema', () => {
  test('stores the market reference for a bed, dimensions and payload together', () => {
    expect(getTableConfig(vehicleVolumeReferences).name).toBe('vehicle_volume_references')

    expect(columnNames(vehicleVolumeReferences)).toEqual([
      'vehicle_type',
      'body_type',
      'cargo_length_m',
      'cargo_width_m',
      'cargo_height_m',
      'max_payload_kg',
      'created_at',
      'updated_at',
    ])
  })

  /**
   * Spec 093: a carga do mercado é **nula quando não há fonte**, nunca zero. Zero é o vocabulário da
   * ficha (`fleet_vehicles`), onde ele significa "ninguém mediu"; aqui a linha existe justamente
   * porque alguém publicou o número, e uma carga zerada afirmaria que o tipo não carrega nada.
   */
  test('lets the payload be absent, and refuses a zero that would claim the type carries nothing', () => {
    expect(requiredColumnNames(vehicleVolumeReferences)).not.toContain('max_payload_kg')
    expect(
      checkSqlByName(vehicleVolumeReferences).vehicle_volume_references_payload_check,
    ).toContain('> 0')
  })

  /**
   * ⚠️ A referência é **piso, não verdade** — a dispersão dentro de um tipo chega a 2× (a van vai de
   * 7,0 a 15,5 m³ na mesma sigla, medido na spec 093). Ela nunca vence a ficha, e por isso as três
   * dimensões continuam obrigatórias: linha sem medida não é referência, é ruído no catálogo.
   */
  test('keeps every dimension required and positive', () => {
    expect(requiredColumnNames(vehicleVolumeReferences)).toContain('cargo_length_m')
    expect(requiredColumnNames(vehicleVolumeReferences)).toContain('cargo_width_m')
    expect(requiredColumnNames(vehicleVolumeReferences)).toContain('cargo_height_m')
    expect(
      checkSqlByName(vehicleVolumeReferences).vehicle_volume_references_dimensions_check,
    ).toContain('> 0')
  })
})
