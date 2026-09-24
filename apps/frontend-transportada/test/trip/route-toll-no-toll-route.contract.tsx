/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 165 CA04/CA05/CA06: zero praça tem duas causas, e elas pedem frases diferentes. A rota que
 * veio de `exclude=toll` **desviou** das praças; a rota comum simplesmente não cruzou nenhuma. Ler
 * a segunda frase na primeira situação foi o que fez o operador achar que o cálculo de pedágio
 * estava quebrado no ambiente.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { RouteTollSummary } from '@/modules/trip/components/RouteTollSummary.component'
import type { RouteGeometryToll } from '@/modules/trip/shared/routeGeometry.service'

function buildToll(catalogStatus: RouteGeometryToll['catalog']['status']): RouteGeometryToll {
  return {
    axles: { count: 2, source: 'declared' },
    booths: [],
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    catalog: { observedOn: '2026-09-14', status: catalogStatus },
    chargePerAxle: '0.0000',
    multiplierLabel: '1',
    paymentMode: 'manual',
    tariffObservedOn: null,
    total: '0.0000',
  }
}

function render(input: {
  readonly catalogStatus?: RouteGeometryToll['catalog']['status']
  readonly isNoTollRoute: boolean
}): string {
  return renderToStaticMarkup(
    <RouteTollSummary
      canAdjustTollBooth={false}
      isNoTollRoute={input.isNoTollRoute}
      toll={buildToll(input.catalogStatus ?? 'current')}
    />,
  )
}

describe('zero praça diz por que é zero (spec 165)', () => {
  it('a rota que evita pedágio anuncia o desvio', () => {
    const markup = render({ isNoTollRoute: true })

    expect(markup).toContain('Esta rota evita as praças de pedágio.')
    expect(markup).not.toContain('Sem pedágio no trajeto.')
  })

  it('a rota comum sem praça continua dizendo apenas que não há pedágio', () => {
    const markup = render({ isNoTollRoute: false })

    expect(markup).toContain('Sem pedágio no trajeto.')
    expect(markup).not.toContain('evita as praças')
  })

  /**
   * Sem catálogo não se sabe se a rota desviou de alguma coisa — dizer que ela evitou praças seria
   * afirmar sobre praças que ninguém carregou.
   */
  it('catálogo vazio vence a frase do desvio', () => {
    const markup = render({ catalogStatus: 'empty', isNoTollRoute: true })

    expect(markup).toContain('o catálogo de praças não foi carregado')
    expect(markup).not.toContain('evita as praças')
  })
})
