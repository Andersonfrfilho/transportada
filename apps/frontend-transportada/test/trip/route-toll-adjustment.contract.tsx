/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 RF7/T401 (aceite 6): a praça sem tarifa conhecida no extrato do pedágio da rota ganha
 * um caminho até o ajuste dela, só para quem tem `settings.manage`. Diferente dos outros contratos
 * de `RouteTollSummary` (que leem o texto-fonte do componente), este cobre o **renderizado**: a
 * própria orientação da task pede asserção sobre o que a tela produz, não sobre a linha do arquivo
 * que a produz — `renderToStaticMarkup` (já disponível via `react-dom`, sem dependência nova) é o
 * jeito de obter HTML real sem jsdom, que este app não usa em nenhum outro teste.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção (spec 154 RF7 cobra os
// dois do módulo trip) — o mesmo `t()` que a tela usa, nunca uma cópia de texto no teste.
import '@/modules/shared/i18n/i18n.service'
import { RouteTollSummary } from '@/modules/trip/components/RouteTollSummary.component'
import type {
  RouteGeometryToll,
  RouteGeometryTollBooth,
} from '@/modules/trip/shared/routeGeometry.service'
import {
  buildFleetTollBoothRoute,
  parseFleetTollBoothSearchParameter,
} from '@/modules/fleet/shared/fleetRoute.service'
import { resolveTollBoothAdjustmentSearch } from '@/modules/trip/shared/tripNavigation.service'
import tripLocale from '@/modules/trip/locales/trip.locale.json'

const ADJUST_LABEL = tripLocale.assemblyMap.toll.adjustBooth

function buildBooth(overrides: Partial<RouteGeometryTollBooth> = {}): RouteGeometryTollBooth {
  return {
    chargeCar: null,
    chargePerAxle: null,
    effectiveChargePerAxle: '12.3400',
    fellBackToManual: false,
    latitude: '-22.0175',
    longitude: '-47.8908',
    name: 'Praça Y',
    operator: 'Operadora Z',
    osmNodeId: 1,
    total: '24.6800',
    ...overrides,
  }
}

function buildToll(booths: readonly RouteGeometryTollBooth[]): RouteGeometryToll {
  return {
    axles: { count: 2, source: 'declared' },
    booths,
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: booths.filter((booth) => booth.effectiveChargePerAxle === null).length,
    catalog: { observedOn: null, status: 'current' },
    chargePerAxle: '12.3400',
    multiplierLabel: '2×',
    paymentMode: 'manual',
    tariffObservedOn: null,
    total: '24.6800',
  }
}

function renderSummary(
  input: Readonly<{ booth: RouteGeometryTollBooth; canAdjustTollBooth: boolean }>,
) {
  return renderToStaticMarkup(
    <RouteTollSummary
      canAdjustTollBooth={input.canAdjustTollBooth}
      toll={buildToll([input.booth])}
    />,
  )
}

describe('ajuste da praça sem tarifa conhecida no extrato da rota (spec 154 RF7, aceite 6)', () => {
  it('praça sem tarifa conhecida mostra a ação, com settings.manage', () => {
    const booth = buildBooth({ effectiveChargePerAxle: null, total: null })

    const html = renderSummary({ booth, canAdjustTollBooth: true })

    expect(html).toContain(`>${ADJUST_LABEL}<`)
  })

  it('praça com tarifa conhecida não mostra a ação', () => {
    const booth = buildBooth({ effectiveChargePerAxle: '10.0000', total: '20.0000' })

    const html = renderSummary({ booth, canAdjustTollBooth: true })

    expect(html).not.toContain(ADJUST_LABEL)
  })

  it('sem settings.manage a ação não é renderizada, mesmo com praça sem tarifa', () => {
    const booth = buildBooth({ effectiveChargePerAxle: null, total: null })

    const html = renderSummary({ booth, canAdjustTollBooth: false })

    expect(html).not.toContain(ADJUST_LABEL)
  })

  /**
   * O clique não é observável em `renderToStaticMarkup` (SSR descarta manipuladores de evento, e
   * este app não roda jsdom em teste nenhum) — a prova de "leva ao ajuste da praça certa" é a
   * composição das mesmas funções puras que `RouteTollSummary` chama no `onClick`
   * (`resolveTollBoothAdjustmentSearch` + `buildFleetTollBoothRoute`), a via que
   * `FleetWorkspace.page.tsx` lê de volta (`parseFleetTollBoothSearchParameter`) para pré-preencher
   * a busca da aba de pedágio.
   */
  it('a ação leva à busca da praça certa na aba de pedágio', () => {
    const named = buildBooth({ effectiveChargePerAxle: null, name: 'Praça do Vale', total: null })
    const unnamed = buildBooth({
      effectiveChargePerAxle: null,
      name: null,
      operator: 'Operadora Sem Nome',
      total: null,
    })
    const withoutIdentification = buildBooth({
      effectiveChargePerAxle: null,
      name: null,
      operator: null,
      total: null,
    })

    const namedRoute = buildFleetTollBoothRoute(resolveTollBoothAdjustmentSearch(named))
    const unnamedRoute = buildFleetTollBoothRoute(resolveTollBoothAdjustmentSearch(unnamed))
    const withoutIdentificationRoute = buildFleetTollBoothRoute(
      resolveTollBoothAdjustmentSearch(withoutIdentification),
    )

    expect(namedRoute).toBe('/fleet?tollBoothSearch=Pra%C3%A7a+do+Vale')
    expect(parseFleetTollBoothSearchParameter(namedRoute.split('?')[1] ?? '')).toBe('Praça do Vale')

    expect(unnamedRoute).toBe('/fleet?tollBoothSearch=Operadora+Sem+Nome')
    expect(parseFleetTollBoothSearchParameter(unnamedRoute.split('?')[1] ?? '')).toBe(
      'Operadora Sem Nome',
    )

    /** Sem nome nem operador a aba ainda abre (o parâmetro está presente), só sem termo. */
    expect(withoutIdentificationRoute).toBe('/fleet?tollBoothSearch=')
    expect(
      parseFleetTollBoothSearchParameter(withoutIdentificationRoute.split('?')[1] ?? ''),
    ).toBeNull()
  })
})
