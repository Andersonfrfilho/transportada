/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  resolveTollRouteCost,
  type TollBoothRecord,
} from '../../src/toll-booths/domain/toll-route-cost.policy.js'

const POLICY_SOURCE = 'src/toll-booths/domain/toll-route-cost.policy.ts'

function praca(osmNodeId: number, chargePerAxle: null | string): TollBoothRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    name: `Praça ${osmNodeId}`,
    operator: 'Operadora',
    osmNodeId,
  }
}

const AXLES = { count: 3, source: 'declared' } as const

describe('toll route cost (spec 090 T5)', () => {
  it('sums the booths the route actually passed, by node identity', () => {
    const cost = resolveTollRouteCost({
      axles: AXLES,
      booths: [praca(10, '10.50'), praca(20, '12.30'), praca(99, '99.90')],
      nodeIds: [1, 10, 5, 20, 7],
    })

    expect(cost?.chargePerAxle).toBe('22.8000')
    expect(cost?.total).toBe('68.4000')
    expect(cost?.booths.map((booth) => booth.osmNodeId)).toEqual([10, 20])
    expect(cost?.axles).toEqual(AXLES)
  })

  it('keeps the booths in the order the truck passes them, not in catalogue order', () => {
    const cost = resolveTollRouteCost({
      axles: AXLES,
      booths: [praca(10, '1.00'), praca(20, '2.00')],
      nodeIds: [20, 10],
    })

    expect(cost?.booths.map((booth) => booth.osmNodeId)).toEqual([20, 10])
  })

  /**
   * ⚠️ Medido em 2026-09-07 contra o OSRM local: numa rota de 89,4 km, 27 nós aparecem mais de uma
   * vez, com 65 ocorrências extras — 25 consecutivas e o resto a dezenas de posições de distância,
   * que é retorno de rotatória ou alça de trevo. Cobrar duas vezes por causa da alça dá número
   * **maior que o real** na tela de quem decide aceitar a carga, e a volta está fora de escopo.
   */
  it('charges a booth once per route, even when the route revisits its node', () => {
    const cost = resolveTollRouteCost({
      axles: AXLES,
      booths: [praca(10, '10.00')],
      nodeIds: [10, 11, 12, 10],
    })

    expect(cost?.chargePerAxle).toBe('10.0000')
    expect(cost?.booths).toHaveLength(1)
  })

  /**
   * "Não passa por pedágio" e "não sei" são coisas diferentes na conta, e esta é a primeira.
   */
  it('returns zero with a known origin when the route passes no booth', () => {
    const cost = resolveTollRouteCost({
      axles: AXLES,
      booths: [praca(10, '1.00')],
      nodeIds: [1, 2],
    })

    expect(cost).not.toBeNull()
    expect(cost?.chargePerAxle).toBe('0.0000')
    expect(cost?.total).toBe('0.0000')
    expect(cost?.booths).toEqual([])
    expect(cost?.boothsWithoutCharge).toBe(0)
  })

  /** E esta é a segunda: sem os nós não há o que cruzar, e zero seria mentira plausível. */
  it('returns absence when the route did not report its nodes', () => {
    expect(
      resolveTollRouteCost({ axles: AXLES, booths: [praca(10, '1.00')], nodeIds: null }),
    ).toBeNull()
  })

  /**
   * ⚠️ Medido: `0.00` aparece como tarifa em 4 das 166 praças, e duas delas têm nome de praça de
   * rodovia com zero em tudo — campo não mapeado, não isenção. Somado ao caso da tarifa ausente, o
   * total sozinho vira número crível e possivelmente falso; a contagem ao lado é o que impede isso.
   */
  it('counts the booths whose tariff nobody knows, instead of treating them as free', () => {
    const cost = resolveTollRouteCost({
      axles: AXLES,
      booths: [praca(10, '10.00'), praca(20, null)],
      nodeIds: [10, 20],
    })

    expect(cost?.chargePerAxle).toBe('10.0000')
    expect(cost?.booths).toHaveLength(2)
    expect(cost?.boothsWithoutCharge).toBe(1)
  })

  it('multiplies by the axles it was given, and says where the count came from', () => {
    const cost = resolveTollRouteCost({
      axles: { count: 5, source: 'estimated' },
      booths: [praca(10, '32.80')],
      nodeIds: [10],
    })

    expect(cost?.total).toBe('164.0000')
    expect(cost?.axles.source).toBe('estimated')
  })

  /**
   * Contrato **por texto de fonte**: casar praça por distância é o defeito que a D1 nomeia, e ele
   * compila, passa em todo teste de caminho feliz e cobra a praça da pista contrária — a poucos
   * metros dali numa rodovia duplicada.
   */
  it('never reaches for distance arithmetic to decide which booth was passed', () => {
    const source = readFileSync(new URL(`../../${POLICY_SOURCE}`, import.meta.url), 'utf8')

    /**
     * ⚠️ A busca é pelo **acesso ao campo** (`.latitude`), nunca pela palavra solta: a primeira
     * versão deste contrato proibia `latitude` em qualquer lugar e reprovou o comentário que
     * explica por que a política não lê coordenada. Contrato que reprova a própria justificativa
     * ensina a apagar a justificativa.
     */
    for (const forbidden of ['.latitude', '.longitude', 'Math.sqrt', 'Math.hypot', 'haversine']) {
      expect(source).not.toContain(forbidden)
    }
  })
})
