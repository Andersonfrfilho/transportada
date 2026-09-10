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

  /** A salva à mão vence; sem ela, a do roteirizador. É essa que carga, conta e rota medem. */
  it('carga, conta e rota medem a ordem salva', () => {
    expect(detail).toContain('reconcileCityOrder({ cityCodes: proposedOrder, order: manualOrder })')
    expect(detail.match(/^\s+stopOrder,$/gmu)?.length).toBe(2)
    expect(detail).toContain('measuredOrder={stopOrder}')
  })

  /**
   * ⚠️ **As setas não vão ao servidor.** Cada troca refazia três consultas — a conta, a carreta e a
   * rota do mapa, as duas últimas no OSRM. O rascunho só reordena a lista; quem mede é "Salvar
   * ordem", uma vez.
   */
  it('as setas mexem no rascunho, e só salvar mede', () => {
    expect(detail).toContain('const displayOrder = draftOrder ?? stopOrder')
    expect(detail).toContain('order={displayOrder}')
    /** O rascunho nunca chega às duas prévias: elas recebem a ordem salva, e mais nada. */
    expect(detail).not.toMatch(/stopOrder: displayOrder|stopOrder: draftOrder/u)
    expect(detail).toContain('onClick={onSaveEdits}')
    expect(hook).toContain('saveEdits: () =>')
  })

  /**
   * ⚠️ **O mapa pedia a rota na ordem da tela.** A chave da consulta era montada das coordenadas na
   * ordem dos pontos desenhados, e toda troca de seta virava uma chamada nova ao OSRM. Hoje ele mede
   * `measuredOrder` e desenha `order`; enquanto divergem, nada que venha da rota aparece.
   */
  it('o mapa desenha o rascunho sem remedir a rota', () => {
    const map = readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')
    expect(map).toContain('measuredOrder?: AssemblyCityOrder | undefined')
    expect(map).toContain('const routeKey = measuredPoints.map(')
    expect(map).toContain('points: measuredPoints.map(')
    expect(map).toContain('const activeGeometry = isDraft ? null : measuredGeometry')
    expect(map).toContain('const routeOptions = isDraft ? [] :')
    /** A chave nunca mais sai da ordem desenhada. */
    expect(map).not.toContain('const routeKey = map.points.map(')
  })

  /** Rascunho aberto trava o aceite: a viagem nasceria numa ordem que ninguém viu medida. */
  it('o aceite espera o rascunho ser salvo ou descartado', () => {
    const list = readSource('src/modules/trip/components/TripProposalList.component.tsx')
    expect(list).toContain('isAccepting || isEdited || hasUnsavedEdits')
    expect(hook).toContain(
      'hasUnsavedEdits: draftOrderByVehicle.size > 0 || draftStopMoves.size > 0',
    )
  })

  /**
   * ⚠️ **Sem isto as setas mentem**: a viagem nasceria com a ordem do roteirizador, e a diferença
   * só apareceria com o caminhão na estrada.
   */
  it('o aceite leva a ordem escolhida', () => {
    expect(hook).toContain('{ stopOrderByVehicle: acceptedOrders }')
    expect(client).toContain('{ stopOrderByVehicle: input.stopOrderByVehicle }')
  })

  /** Nova proposta e aceite zeram a ordem e o rascunho: descreviam caminhões que não existem mais. */
  it('a ordem morre com a proposta que a gerou', () => {
    /**
     * Só os dois zeramentos — nova proposta e aceite — mandam a ordem e os movimentos **salvos** de
     * volta a vazio. O rascunho também é limpo por "Salvar" e "Descartar", então contá-lo aqui mediria
     * os botões, não a regra.
     */
    expect(hook.match(/setOrderByVehicle\(new Map\(\)\)/gu)?.length).toBe(2)
    expect(hook.match(/setStopMoves\(new Map\(\)\)/gu)?.length).toBe(2)
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
