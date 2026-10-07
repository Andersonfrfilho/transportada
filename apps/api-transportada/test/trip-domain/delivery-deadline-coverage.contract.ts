/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: a cobertura do calendário de UMA viagem. Do menor ano entre chegadas e entregas (e hoje, só
 * com nota pendente) até o maior entre entregas, hoje e o ano da última chegada + 1 (30/12 + dias úteis cai no ano seguinte); acima de cinco
 * anos de distância o começo é cortado, e a nota que ficou de fora vira "sem prazo".
 */
import { describe, expect, test } from 'bun:test'

import { resolveDeadlineCoverage } from '../../src/trips/domain/delivery-deadline-coverage.policy.js'
import type { ResolveDeadlineCoverageParams } from '../../src/trips/domain/delivery-deadline-coverage.policy.js'

type CoverageCase = {
  readonly expected: { readonly fromYear: number; readonly toYear: number }
  readonly name: string
  readonly params: ResolveDeadlineCoverageParams
}

const COVERAGE_CASES: CoverageCase[] = [
  {
    expected: { fromYear: 2026, toYear: 2027 },
    name: 'chegada deste ano e hoje: o ano seguinte entra pela chegada em 30/12',
    params: { arrivalYears: [2026], deliveryYears: [], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2026, toYear: 2027 },
    name: 'chegada do ano passado e hoje no seguinte',
    params: { arrivalYears: [2026], deliveryYears: [], todayYear: 2027 },
  },
  {
    expected: { fromYear: 2025, toYear: 2027 },
    name: 'a entrega anterior à chegada puxa o começo',
    params: { arrivalYears: [2026], deliveryYears: [2025], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2025, toYear: 2028 },
    name: 'chegada com data futura: o hoje continua dentro',
    params: { arrivalYears: [2027], deliveryYears: [], todayYear: 2025 },
  },
  {
    expected: { fromYear: 2024, toYear: 2027 },
    name: 'várias chegadas: do menor ao maior + 1',
    params: { arrivalYears: [2024, 2026, 2025], deliveryYears: [2024], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2021, toYear: 2026 },
    name: 'seis anos exatos de distância (cinco de vão) não corta',
    params: { arrivalYears: [2021], deliveryYears: [], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2021, toYear: 2026 },
    name: 'acima de cinco anos corta o começo, não o fim',
    params: { arrivalYears: [2018], deliveryYears: [], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2026, toYear: 2031 },
    name: 'a última chegada no futuro estica o fim até o limite',
    params: { arrivalYears: [2030], deliveryYears: [], todayYear: 2026 },
  },
  {
    expected: { fromYear: 2026, toYear: 2027 },
    name: 'sem nota pendente o hoje não entra: viagem entregue lida em 2032 mantém 2026',
    params: { arrivalYears: [2026], deliveryYears: [2026], todayYear: null },
  },
  {
    expected: { fromYear: 2026, toYear: 2028 },
    name: 'sem nota pendente a entrega tardia estica o fim, não o hoje',
    params: { arrivalYears: [2026], deliveryYears: [2028], todayYear: null },
  },
  {
    expected: { fromYear: 2027, toYear: 2032 },
    name: 'com nota pendente o hoje entra, e o vão máximo corta o começo',
    params: { arrivalYears: [2026], deliveryYears: [], todayYear: 2032 },
  },
]

describe('spec 236 T1.2c — a cobertura do calendário da viagem', () => {
  test.each(COVERAGE_CASES)('$name', ({ expected, params }) => {
    expect(resolveDeadlineCoverage(params)).toEqual(expected)
  })
})
