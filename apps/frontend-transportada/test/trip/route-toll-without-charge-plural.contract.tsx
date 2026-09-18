/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T507, item 4: o resumo de pedágio da rota dizia "1 praças sem tarifa conhecida" (texto da
 * spec 090). A frase passa pela pluralização do i18n nos dois dicionários — `_one` e `_other` — e o
 * contrato cobre 0, 1 e 2 praças no `t()` real e no resumo renderizado.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import { i18n } from '@/modules/shared/i18n/i18n.service'
import { RouteTollSummary } from '@/modules/trip/components/RouteTollSummary.component'
import type {
  RouteGeometryToll,
  RouteGeometryTollBooth,
} from '@/modules/trip/shared/routeGeometry.service'

const WITHOUT_CHARGE_KEY = 'assemblyMap.toll.withoutCharge'

function translate(language: 'en' | 'pt-BR', count: number): string {
  return i18n.getFixedT(language, 'trip')(WITHOUT_CHARGE_KEY, { count })
}

function buildBooth(osmNodeId: number, known: boolean): RouteGeometryTollBooth {
  return {
    chargeCar: null,
    chargePerAxle: null,
    effectiveChargePerAxle: known ? '12.3400' : null,
    fellBackToManual: false,
    latitude: '-22.0175',
    longitude: '-47.8908',
    name: `Praça ${String(osmNodeId)}`,
    operator: 'Operadora Z',
    osmNodeId,
    total: known ? '24.6800' : null,
  }
}

function renderWithUnknownBooths(unknownCount: number): string {
  const booths = [
    buildBooth(1, true),
    ...Array.from({ length: unknownCount }, (_, index) => buildBooth(index + 2, false)),
  ]
  const toll: RouteGeometryToll = {
    axles: { count: 2, source: 'declared' },
    booths,
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: unknownCount,
    catalog: { observedOn: null, status: 'current' },
    chargePerAxle: '12.3400',
    multiplierLabel: '2×',
    paymentMode: 'manual',
    tariffObservedOn: null,
    total: '24.6800',
  }
  return renderToStaticMarkup(<RouteTollSummary canAdjustTollBooth={false} toll={toll} />)
}

describe('plural de "praças sem tarifa conhecida" no resumo da rota (spec 154 T507, item 4)', () => {
  it.each([
    [0, '0 praças sem tarifa conhecida'],
    [1, '1 praça sem tarifa conhecida'],
    [2, '2 praças sem tarifa conhecida'],
  ])('pt-BR: %i vira "%s"', (count, expected) => {
    expect(translate('pt-BR', count)).toBe(expected)
  })

  it.each([
    [0, '0 booths without a known tariff'],
    [1, '1 booth without a known tariff'],
    [2, '2 booths without a known tariff'],
  ])('en: %i vira "%s"', (count, expected) => {
    expect(translate('en', count)).toBe(expected)
  })

  it('o resumo renderizado conta uma praça no singular e duas no plural', () => {
    expect(renderWithUnknownBooths(1)).toContain('>1 praça sem tarifa conhecida<')
    expect(renderWithUnknownBooths(2)).toContain('>2 praças sem tarifa conhecida<')
  })

  it('sem praça desconhecida o resumo não imprime a linha', () => {
    expect(renderWithUnknownBooths(0)).not.toContain('sem tarifa conhecida<')
  })
})
