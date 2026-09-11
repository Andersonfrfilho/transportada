/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  canReadSuggestionValuation,
  TRIP_FINANCIALS_PERMISSION,
} from '@/modules/routing/queries/useSuggestionValuation.query'
import {
  formatDistance,
  formatDuration,
  SUGGESTION_VALUATION_REPORT_KEYS,
  SUGGESTION_VEHICLE_VALUATION_KEYS,
} from '@/modules/routing/shared/suggestionValuation.service'
import { toSuggestionValuation } from '@/modules/routing/shared/suggestionValuationResponse.validation'

const VALUATION = {
  costParcels: [{ amount: '10.0000', detail: null, gap: null, kind: 'fuel', source: 'estimated' }],
  hasGaps: false,
  marginPercentage: '50.0000',
  revenueLines: [],
  revenueSource: 'estimated',
  totalCost: '10.0000',
  totalMargin: '90.0000',
  totalRevenue: '100.0000',
}

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    distanceMeters: 50_000,
    documentCount: 2,
    driverId: null,
    durationSeconds: 3_600,
    stopCount: 3,
    valuation: VALUATION,
    vehicleId: '00000000-0000-4000-8000-0000000000a1',
    ...overrides,
  }
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    gaps: [],
    hasGaps: false,
    totalCost: '10.0000',
    totalDistanceMeters: 50_000,
    totalDurationSeconds: 3_600,
    totalMargin: '90.0000',
    totalRevenue: '100.0000',
    ...overrides,
  }
}

describe('toSuggestionValuation (spec 101)', () => {
  it('lê o corpo envelopado em data', () => {
    const result = toSuggestionValuation({ data: { report: report(), vehicles: [vehicle()] } })

    expect(result?.vehicles).toHaveLength(1)
    expect(result?.report.totalMargin).toBe('90.0000')
    expect(result?.vehicles[0]?.valuation.totalRevenue).toBe('100.0000')
  })

  /**
   * ⚠️ `null` é ausência de medida e **sobrevive** à validação: virar zero faria o relatório somar
   * um veículo sem distância como se ele não rodasse, e a margem apareceria melhor do que é.
   */
  it('distância e duração ausentes continuam ausentes, nunca zero', () => {
    const result = toSuggestionValuation({
      data: {
        report: report({ totalDistanceMeters: null, totalDurationSeconds: null }),
        vehicles: [vehicle({ distanceMeters: null, durationSeconds: null })],
      },
    })

    expect(result?.vehicles[0]?.distanceMeters).toBe(null)
    expect(result?.report.totalDistanceMeters).toBe(null)
  })

  /**
   * ⚠️ A guarda é `hasExactKeys` nas duas formas: campo novo na API com o bundle antigo derruba a
   * validação e o painel some com 200 na rede e nada no console — o defeito de
   * `VEHICLE_DETAIL_KEYS`. **A API sobe primeiro.**
   */
  it('recusa chave desconhecida no relatório', () => {
    expect(
      toSuggestionValuation({
        data: { report: { ...report(), tokenDoTenant: 'x' }, vehicles: [] },
      }),
    ).toBe(null)
  })

  it('recusa chave desconhecida no veículo', () => {
    expect(
      toSuggestionValuation({
        data: { report: report(), vehicles: [{ ...vehicle(), tokenDoTenant: 'x' }] },
      }),
    ).toBe(null)
  })

  it('recusa relatório com chave faltando', () => {
    const incomplete = report()
    delete (incomplete as Record<string, unknown>).totalMargin

    expect(toSuggestionValuation({ data: { report: incomplete, vehicles: [] } })).toBe(null)
  })

  /** Meia distribuição não é distribuição: um veículo malformado invalida o corpo inteiro. */
  it('um veículo malformado invalida o corpo inteiro', () => {
    expect(
      toSuggestionValuation({
        data: { report: report(), vehicles: [vehicle(), { vehicleId: 'x' }] },
      }),
    ).toBe(null)
  })

  it('corpo malformado vira ausência, não exceção', () => {
    expect(toSuggestionValuation(null)).toBe(null)
    expect(toSuggestionValuation({ data: {} })).toBe(null)
    expect(toSuggestionValuation({ data: { report: report() } })).toBe(null)
  })

  /** As chaves são contrato de duas pontas; a lista não pode divergir do que a API serve. */
  it('as listas de chaves cobrem exatamente os campos servidos', () => {
    expect([...SUGGESTION_VALUATION_REPORT_KEYS].toSorted()).toEqual(
      Object.keys(
        report(),
      ).toSorted() as unknown as (typeof SUGGESTION_VALUATION_REPORT_KEYS)[number][],
    )
    expect([...SUGGESTION_VEHICLE_VALUATION_KEYS].toSorted()).toEqual(
      Object.keys(
        vehicle(),
      ).toSorted() as unknown as (typeof SUGGESTION_VEHICLE_VALUATION_KEYS)[number][],
    )
  })
})

describe('permissão da conta da sugestão', () => {
  /**
   * ⚠️ Dinheiro tem permissão própria: quem monta o roteiro (`trip.manage`) **não** ganha a margem
   * de carona. Sem a permissão a seção não existe — nem moldura, nem "—", que já diria que há
   * número do outro lado.
   */
  it('exige trip.financials, e trip.manage não serve', () => {
    expect(canReadSuggestionValuation([TRIP_FINANCIALS_PERMISSION])).toBe(true)
    expect(canReadSuggestionValuation(['trip.manage', 'fleet.read'])).toBe(false)
    expect(canReadSuggestionValuation([])).toBe(false)
  })
})

const DURATION_UNITS = { days: 'd', hours: 'h', minutes: 'min' }

describe('formatação', () => {
  /**
   * Spec 138: uma viagem de muitas paradas passa de 24h com frequência, e "29h47" não lê como
   * jornada. Unidade zerada no meio é omitida ("2 d 3 min", nunca "2 d 0 h 3 min"), e a duração
   * zero preserva a saída de sempre — não vale criar uma segunda forma só para "nada".
   */
  it('duração vira dias, horas e minutos — sem parte zerada no meio', () => {
    expect(formatDuration(107_220, DURATION_UNITS)).toBe('1 d 5 h 47 min')
    expect(formatDuration(347 * 60, DURATION_UNITS)).toBe('5 h 47 min')
    expect(formatDuration(0, DURATION_UNITS)).toBe('0min')
    expect(formatDuration(48 * 3_600, DURATION_UNITS)).toBe('2 d')
    expect(formatDuration(null, DURATION_UNITS)).toBe(null)
  })

  it('duração sem dias nem horas ainda mostra minutos', () => {
    expect(formatDuration(600, DURATION_UNITS)).toBe('10 min')
  })

  it('duração com dias e minutos, sem horas, omite a hora zerada', () => {
    expect(formatDuration(2 * 24 * 3_600 + 3 * 60, DURATION_UNITS)).toBe('2 d 3 min')
  })

  it('distância vira quilômetro', () => {
    expect(formatDistance(125_130)).toBe('125.1 km')
    expect(formatDistance(null)).toBe(null)
  })
})
