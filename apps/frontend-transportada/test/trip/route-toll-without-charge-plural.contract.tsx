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
  return renderToStaticMarkup(
    <RouteTollSummary canAdjustTollBooth={false} isNoTollRoute={false} toll={toll} />,
  )
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

/**
 * A linha de cima do mesmo resumo ("Pedágio: … — N praças") e a opção de rota ("… · N praças")
 * tinham o mesmo defeito. O plural do i18next só dispara com a variável `count`, então as duas
 * chamadas passam a entregar `count` em vez de `boothCount`.
 */
describe('plural de "praças" no total do resumo e na opção de rota (spec 154 T507, item 4)', () => {
  function renderWithBooths(boothCount: number): string {
    const toll: RouteGeometryToll = {
      axles: { count: 2, source: 'declared' },
      booths: Array.from({ length: boothCount }, (_, index) => buildBooth(index + 1, true)),
      boothsFallenBackToManual: 0,
      boothsWithoutCharge: 0,
      catalog: { observedOn: null, status: 'current' },
      chargePerAxle: '12.3400',
      multiplierLabel: '2×',
      paymentMode: 'manual',
      tariffObservedOn: null,
      total: '24.6800',
    }
    return renderToStaticMarkup(
      <RouteTollSummary canAdjustTollBooth={false} isNoTollRoute={false} toll={toll} />,
    )
  }

  it('o total do resumo diz "1 praça" com uma praça e "2 praças" com duas', () => {
    expect(renderWithBooths(1)).toContain('— 1 praça,')
    expect(renderWithBooths(1)).not.toContain('1 praças')
    expect(renderWithBooths(2)).toContain('— 2 praças,')
  })

  it.each([
    [1, '12.0 km · 30 min · 1 praça'],
    [2, '12.0 km · 30 min · 2 praças'],
  ])('pt-BR: a opção de rota com %i praça(s) vira "%s"', (count, expected) => {
    const option = i18n.getFixedT('pt-BR', 'trip')('assemblyMap.routeOptions.option', {
      count,
      distance: '12.0',
      duration: '30 min',
    })
    expect(option).toBe(expected)
  })

  it('en: o total do resumo usa as mesmas variáveis do pt e nunca deixa placeholder cru', () => {
    const summary = i18n.getFixedT('en', 'trip')('assemblyMap.toll.summary', {
      chargePerAxle: 'R$ 12,34',
      count: 1,
      multiplier: '2×',
      total: 'R$ 24,68',
    })
    expect(summary).toContain('1 booth,')
    expect(summary).not.toContain('{{')
    expect(summary).toContain('2×')
  })
})
