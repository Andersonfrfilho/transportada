/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.1 (RF23, CA13; ADR-0116 §7): a lista "Fora do padrão" só traz o que passa do limite sobre a média dos
 * últimos 3 meses, para cima ou para baixo. Limite padrão de 10%, configurável por empresa; exatamente no limite não alerta.
 */
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT,
  detectOutOfPattern,
  type OutOfPatternItem,
} from '../../src/expenses/domain/expense-forecast.policy.js'

function item(
  current: string,
  previousMonths: readonly string[] = ['100.00', '100.00', '100.00'],
  key = 'k1',
): OutOfPatternItem {
  return { current, key, kind: 'expense', label: `Conta ${key}`, previousMonths }
}

const run = (
  items: readonly OutOfPatternItem[],
  thresholdPercent = DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT,
) => detectOutOfPattern({ items, thresholdPercent })

describe('CA13: só além do limite', () => {
  it('o limite padrão é 10%', () => {
    expect(DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT).toBe(10)
  })

  it('exatamente no limite (10% acima ou abaixo da média) não alerta', () => {
    expect(run([item('110.00'), item('90.00', undefined, 'k2')])).toEqual([])
  })

  it('um centavo além do limite alerta, para cima', () => {
    const [alert, ...rest] = run([item('110.01')])
    expect(rest).toEqual([])
    expect(alert).toEqual({
      average: '100.00',
      current: '110.01',
      difference: '10.01',
      direction: 'above',
      key: 'k1',
      kind: 'expense',
      label: 'Conta k1',
    })
  })

  it('um centavo além do limite alerta, para baixo, com diferença negativa', () => {
    const [alert, ...rest] = run([item('89.99')])
    expect(rest).toEqual([])
    expect(alert?.direction).toBe('below')
    expect(alert?.difference).toBe('-10.01')
  })

  it('dentro do limite não aparece', () => {
    expect(
      run([item('100.00'), item('105.00', undefined, 'k2'), item('95.50', undefined, 'k3')]),
    ).toEqual([])
  })

  it('mistura: só os que passam do limite entram, e trazem a chave do item', () => {
    const alerts = run([
      item('100.00', undefined, 'ok'),
      item('150.00', undefined, 'high'),
      item('50.00', undefined, 'low'),
    ])
    expect(alerts.map((a) => a.key).sort()).toEqual(['high', 'low'])
  })

  it('o limite é configurável: com 20%, 115,00 não alerta e 120,01 alerta', () => {
    expect(run([item('115.00')], 20)).toEqual([])
    expect(run([item('120.01')], 20).map((a) => a.key)).toEqual(['k1'])
  })
})

describe('CA13: a média é dos 3 meses mais recentes', () => {
  it('usa só os 3 primeiros de previousMonths (mais recente primeiro) e arredonda a média ao centavo', () => {
    const [alert] = run([item('200.00', ['100.00', '100.00', '100.01', '9999.00'])])
    expect(alert?.average).toBe('100.00')
  })

  it('com menos de 3 meses de histórico não alerta (sem padrão para comparar)', () => {
    expect(run([item('500.00', ['100.00', '100.00'])])).toEqual([])
    expect(run([item('500.00', [])])).toEqual([])
  })

  it('serve a conta, a categoria e o custo por km do veículo', () => {
    const kinds = (['category', 'expense', 'vehicle_cost_per_km'] as const).map((kind) => ({
      ...item('300.00', undefined, kind),
      kind,
    }))
    expect(
      run(kinds)
        .map((a) => a.kind)
        .sort(),
    ).toEqual(['category', 'expense', 'vehicle_cost_per_km'])
  })
})
