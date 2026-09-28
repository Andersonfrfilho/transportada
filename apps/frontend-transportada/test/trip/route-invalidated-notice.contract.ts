/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 217 D3/D3-bis: trocar o veículo apaga o roteiro e o pedágio congelados, de propósito — a
 * viagem volta para `draft`. Em staging isso foi lido como defeito: o número simplesmente some da
 * tela, e o remédio (o botão "Liberar para separação" no cabeçalho) não diz que é ele quem
 * recalcula o pedágio. O aviso cobre exatamente essa lacuna.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { shouldShowRouteInvalidatedNotice } from '../../src/modules/trip/shared/routeInvalidatedNotice.service'
import tripLocale from '../../src/modules/trip/locales/trip.locale.json'

const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

describe('aviso de roteiro invalidado (spec 217)', () => {
  it('aparece em draft, com parada, sem rota congelada', () => {
    expect(
      shouldShowRouteInvalidatedNotice({ isRouteFrozen: false, status: 'draft', stopsCount: 2 }),
    ).toBe(true)
  })

  /** Rascunho que nunca teve roteiro cai na mesma condição — é a mesma mensagem, de propósito. */
  it('aparece também no rascunho recém-criado, que nunca teve roteiro', () => {
    expect(
      shouldShowRouteInvalidatedNotice({ isRouteFrozen: false, status: 'draft', stopsCount: 1 }),
    ).toBe(true)
  })

  it('não aparece quando há rota congelada', () => {
    expect(
      shouldShowRouteInvalidatedNotice({ isRouteFrozen: true, status: 'draft', stopsCount: 2 }),
    ).toBe(false)
  })

  it('não aparece sem nenhuma parada', () => {
    expect(
      shouldShowRouteInvalidatedNotice({ isRouteFrozen: false, status: 'draft', stopsCount: 0 }),
    ).toBe(false)
  })

  it('não aparece em route_planned', () => {
    expect(
      shouldShowRouteInvalidatedNotice({
        isRouteFrozen: false,
        status: 'route_planned',
        stopsCount: 2,
      }),
    ).toBe(false)
  })

  it('não aparece em separating em diante', () => {
    for (const status of ['separating', 'dispatched', 'completed', 'cancelled'] as const) {
      expect(
        shouldShowRouteInvalidatedNotice({ isRouteFrozen: false, status, stopsCount: 2 }),
      ).toBe(false)
    }
  })

  /**
   * O texto tem de acompanhar o rótulo do botão sozinho: interpola a própria chave
   * `stateActions.planRoute` em vez de repetir "Liberar para separação" — se o botão for
   * renomeado amanhã, o aviso não pode ficar mentindo.
   */
  it('o texto do aviso referencia stateActions.planRoute, não uma cópia do rótulo', () => {
    const aviso = tripLocale.routeMap.invalidatedNotice

    expect(aviso).toContain('$t(stateActions.planRoute)')
    expect(aviso).not.toContain('Liberar para separação')
  })

  it('o detalhe da viagem consulta a função pura com o sinal de `frozen` já carregado', () => {
    const detalhe = readFileSync(DETALHE, 'utf8')

    expect(detalhe).toContain('shouldShowRouteInvalidatedNotice')
    expect(detalhe).toContain("t('routeMap.invalidatedNotice')")
  })
})
