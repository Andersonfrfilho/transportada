/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(path: string): string {
  return readFileSync(new URL(path, APPLICATION_ROOT), 'utf8')
}

/**
 * As setas da proposta: reordenar à mão e ver pedágio, tempo e carga recalcularem.
 *
 * ⚠️ Estes contratos são por texto de fonte porque o teste desta app não tem DOM — a fiação é o que
 * se prova aqui, e a regra de ordem mora na API, com contrato de comportamento lá.
 */
describe('ordem escolhida à mão na proposta', () => {
  const detail = readSource('src/modules/trip/components/TripProposalDetail.component.tsx')
  const hook = readSource('src/modules/trip/hooks/useTripRouteAssembly.hook.ts')
  const client = readSource('src/modules/trip/shared/tripClient.service.ts')

  /** A escolhida à mão vence; sem ela, a do roteirizador. Uma ordem só para mapa, carga e conta. */
  it('uma ordem só alimenta mapa, carga e conta', () => {
    expect(detail).toContain('const stopOrder = manualOrder ?? proposedOrder')
    expect(detail).toContain('order={stopOrder}')
    expect(detail.match(/^\s+stopOrder,$/gmu)?.length).toBe(2)
  })

  /**
   * ⚠️ **Sem isto as setas mentem**: a viagem nasceria com a ordem do roteirizador, e a diferença
   * só apareceria com o caminhão na estrada.
   */
  it('o aceite leva a ordem escolhida', () => {
    expect(hook).toContain('stopOrderByVehicle: [...orderByVehicle]')
    expect(client).toContain('{ stopOrderByVehicle: input.stopOrderByVehicle }')
  })

  /** Nova proposta e aceite zeram a ordem: ela descrevia caminhões que não existem mais. */
  it('a ordem morre com a proposta que a gerou', () => {
    expect(hook.match(/setOrderByVehicle\(new Map\(\)\)/gu)?.length).toBe(2)
  })

  /**
   * ⚠️ Tempo e rodagem da faixa são do roteirizador, na ordem dele. Com a ordem trocada à mão eles
   * descreveriam outro caminho — saem, e o mapa abaixo mede a ordem nova.
   */
  it('a faixa não mostra o tempo do roteirizador sobre a ordem trocada', () => {
    expect(detail).toContain('manualOrder === null')
  })

  /**
   * ⚠️ **A regra vale na tela inteira, não só no razão.** A linha recolhida e a barra de totais
   * imprimiam a receita sem cor e o prejuízo em laranja (`.negative` deste módulo é cobre), enquanto
   * o razão logo abaixo pintava o mesmo prejuízo de vermelho: um número, duas cores, uma tela.
   */
  it('linha e barra pintam receita de verde e prejuízo de vermelho', () => {
    const css = readSource('src/modules/trip/styles/trip.module.css')
    const revenue = css.slice(css.indexOf('.proposalRevenue {'))
    expect(revenue.slice(0, revenue.indexOf('}'))).toContain('var(--color-ready)')

    for (const path of [
      'src/modules/trip/components/TripProposalRow.component.tsx',
      'src/modules/trip/components/TripProposalList.component.tsx',
    ]) {
      const source = readSource(path)
      expect(source).toContain('styles.proposalRevenue')
      expect(source).not.toContain('styles.negative')
    }
  })

  /**
   * ⚠️ **A proposta tem duas portas, e a regra vale nas duas.** A segunda abre pela tabela de Notas
   * (`MultiVehicleSuggestionAction` → `MultiVehicleSuggestionDialog`) e imprimia receita, despesa e
   * lucro positivo sem cor nenhuma — só o prejuízo tinha tom.
   */
  it('a porta da tabela de Notas segue a mesma regra de cor', () => {
    const css = readSource('src/modules/routing/styles/routing.module.css')
    const rule = (name: string): string => {
      const start = css.slice(css.indexOf(`.${name} {`))
      return start.slice(0, start.indexOf('}'))
    }
    expect(rule('revenue')).toContain('var(--color-ready)')
    expect(rule('expense')).toContain('var(--color-alert)')
    expect(rule('profit')).toContain('var(--color-ready)')

    for (const path of [
      'src/modules/routing/components/SuggestionValuationReport.component.tsx',
      'src/modules/routing/components/SuggestionVehicleValuation.component.tsx',
    ]) {
      const source = readSource(path)
      expect(source).toContain('className={styles.revenue}')
      expect(source).toContain('className={styles.expense}')
      expect(source).toContain('styles.negative : styles.profit')
    }
  })

  /** Verde é o que entra, vermelho é o que sai — a receita era a única total sem cor. */
  it('a receita é verde', () => {
    const css = readSource('src/modules/trip-financials/styles/tripFinancials.module.css')
    const revenue = css.slice(css.indexOf('.ledgerRevenue dd {'))
    expect(revenue.slice(0, revenue.indexOf('}'))).toContain('var(--color-ready)')
  })
})
