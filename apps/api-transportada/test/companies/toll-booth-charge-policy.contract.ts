/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  orderTollBoothChargesByUnknownFirst,
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
  type TollBoothCatalogEntry,
  type TollBoothChargeAdjustmentRow,
} from '../../src/companies/domain/toll-booth-charge.policy.js'

const UPDATED_AT = new Date('2026-09-07T12:00:00.000Z')

function catalog(overrides: Partial<TollBoothCatalogEntry> = {}): TollBoothCatalogEntry {
  return {
    chargeCar: '10.50',
    chargePerAxle: '10.50',
    chargePerAxleAutomatic: null,
    name: 'Praça SP-330',
    observedOn: '2026-06-01',
    operator: 'CCR',
    osmNodeId: 123,
    ...overrides,
  }
}

function adjustment(
  overrides: Partial<TollBoothChargeAdjustmentRow> = {},
): TollBoothChargeAdjustmentRow {
  return {
    actorUserId: 'user-1',
    chargeCar: '12.00',
    chargePerAxle: '12.00',
    chargePerAxleAutomatic: null,
    observedOn: '2026-09-01',
    osmNodeId: 123,
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

describe('effective toll booth charge policy contract (spec 095 D1)', () => {
  test('falls back to the catalog when there is no adjustment', () => {
    const result = resolveEffectiveTollBoothCharge({ adjustment: null, catalog: catalog() })

    expect(result.effectiveChargeCar).toBe('10.50')
    expect(result.effectiveChargePerAxle).toBe('10.50')
    expect(result.source).toBe('catalog')
    expect(result.actorUserId).toBeNull()
    expect(result.updatedAt).toBeNull()
    expect(result.observedOn).toBe('2026-06-01')
  })

  test('the adjustment wins over the catalog, field by field', () => {
    const result = resolveEffectiveTollBoothCharge({
      adjustment: adjustment({ chargeCar: null }),
      catalog: catalog(),
    })

    // chargePerAxle veio do ajuste; chargeCar, sem ajuste, continua do catálogo
    expect(result.effectiveChargePerAxle).toBe('12.00')
    expect(result.effectiveChargeCar).toBe('10.50')
    expect(result.source).toBe('manual')
    expect(result.actorUserId).toBe('user-1')
    expect(result.observedOn).toBe('2026-09-01')
    expect(result.updatedAt).toBe(UPDATED_AT)
  })

  /**
   * ⚠️ `0.00` gravado à mão é isenção afirmada por gente, e vence o `null` "desconhecida" do
   * catálogo — a distinção que o OSM não tem (spec 095, achado 3 da revisão da 090).
   */
  test('a manual 0.00 wins over an unknown catalog charge, and is not confused with absence', () => {
    const result = resolveEffectiveTollBoothCharge({
      adjustment: adjustment({ chargeCar: '0.0000', chargePerAxle: '0.0000' }),
      catalog: catalog({ chargeCar: null, chargePerAxle: null }),
    })

    expect(result.effectiveChargeCar).toBe('0.0000')
    expect(result.effectiveChargePerAxle).toBe('0.0000')
    expect(result.source).toBe('manual')
  })

  test('keeps the catalog values alongside the effective ones, for the settings screen', () => {
    const result = resolveEffectiveTollBoothCharge({ adjustment: adjustment(), catalog: catalog() })

    expect(result.catalog).toEqual({
      chargeCar: '10.50',
      chargePerAxle: '10.50',
      chargePerAxleAutomatic: null,
      observedOn: '2026-06-01',
    })
  })
})

describe('origem por campo (conferência de 2026-09-07)', () => {
  /**
   * ⚠️ `source` era **por linha**: um ajuste que corrige só a tarifa de carro marcava a linha
   * inteira como `manual`, incluindo o valor por eixo que continua vindo do mapa. A tela desta
   * página existe para dizer de onde cada número veio — e é o valor por eixo que decide o custo do
   * caminhão. Uma origem só, para dois campos que vencem o catálogo em separado, mente sobre um
   * deles.
   */
  test('diz manual só no campo que a pessoa corrigiu', () => {
    const result = resolveEffectiveTollBoothCharge({
      adjustment: adjustment({ chargeCar: '9.90', chargePerAxle: null }),
      catalog: catalog(),
    })

    expect(result.chargeCarSource).toBe('manual')
    expect(result.chargePerAxleSource).toBe('catalog')
    expect(result.effectiveChargePerAxle).toBe('10.50')
  })

  test('diz catálogo nos dois campos quando não há ajuste', () => {
    const result = resolveEffectiveTollBoothCharge({
      adjustment: null,
      catalog: catalog(),
    })

    expect(result.chargeCarSource).toBe('catalog')
    expect(result.chargePerAxleSource).toBe('catalog')
  })
})

describe('a automática, terceiro campo independente (spec 095 D3)', () => {
  test('o OSM nunca declara a automática — sem ajuste, ela é sempre desconhecida', () => {
    const result = resolveEffectiveTollBoothCharge({ adjustment: null, catalog: catalog() })

    expect(result.effectiveChargePerAxleAutomatic).toBeNull()
    expect(result.chargePerAxleAutomaticSource).toBe('catalog')
  })

  test('o ajuste da empresa é quem informa a automática', () => {
    const result = resolveEffectiveTollBoothCharge({
      adjustment: adjustment({
        chargeCar: null,
        chargePerAxle: null,
        chargePerAxleAutomatic: '9.97',
      }),
      catalog: catalog(),
    })

    expect(result.effectiveChargePerAxleAutomatic).toBe('9.97')
    expect(result.chargePerAxleAutomaticSource).toBe('manual')
    /** Corrigir só a automática não move os outros dois campos. */
    expect(result.effectiveChargeCar).toBe('10.50')
    expect(result.effectiveChargePerAxle).toBe('10.50')
  })
})

describe('order by unknown first (spec 095 item 4)', () => {
  function effectiveWith(overrides: Partial<TollBoothCatalogEntry>): EffectiveTollBoothCharge {
    return resolveEffectiveTollBoothCharge({ adjustment: null, catalog: catalog(overrides) })
  }

  // São o motivo da página existir — sem tarifa antes de 0,00, e 0,00 antes do resto
  test('unknown, then zero, then the rest', () => {
    const known = effectiveWith({ chargePerAxle: '10.5000', name: 'Praça C' })
    const zero = effectiveWith({ chargePerAxle: '0.0000', name: 'Praça B' })
    const unknown = effectiveWith({ chargePerAxle: null, name: 'Praça A' })

    const result = orderTollBoothChargesByUnknownFirst([known, zero, unknown])

    expect(result.map((entry) => entry.name)).toEqual(['Praça A', 'Praça B', 'Praça C'])
  })

  test('ties within a group break by name, then by osmNodeId', () => {
    const first = resolveEffectiveTollBoothCharge({
      adjustment: null,
      catalog: catalog({ name: 'Alfa', osmNodeId: 2 }),
    })
    const second = resolveEffectiveTollBoothCharge({
      adjustment: null,
      catalog: catalog({ name: 'Alfa', osmNodeId: 1 }),
    })
    const third = resolveEffectiveTollBoothCharge({
      adjustment: null,
      catalog: catalog({ name: 'Beta', osmNodeId: 3 }),
    })

    const result = orderTollBoothChargesByUnknownFirst([first, third, second])

    expect(result.map((entry) => entry.osmNodeId)).toEqual([1, 2, 3])
  })

  test('a praça sem nome desempata por osmNodeId, sem quebrar', () => {
    const withoutName = resolveEffectiveTollBoothCharge({
      adjustment: null,
      catalog: catalog({ name: null, osmNodeId: 5 }),
    })

    expect(() => orderTollBoothChargesByUnknownFirst([withoutName])).not.toThrow()
  })
})
