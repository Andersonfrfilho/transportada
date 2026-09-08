/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { describeTollBoothCharges } from '../../src/toll-booths/domain/toll-route-cost.policy.js'

const COM_AS_DUAS = {
  chargeCar: '5.2500',
  chargePerAxle: '10.5000',
  chargePerAxleAutomatic: '9.9700',
  latitude: '-21.7000',
  longitude: '-47.5000',
  name: 'Santa Rita do Passa Quatro (sentido Sul)',
  operator: 'Arteris ViaPaulista',
  osmNodeId: 111,
} as const

const SO_MANUAL = {
  chargeCar: '5.9000',
  chargePerAxle: '11.8000',
  chargePerAxleAutomatic: null,
  latitude: '-21.9900',
  longitude: '-47.4200',
  name: 'Pirassununga (sentido Sul)',
  operator: 'Intervias',
  osmNodeId: 222,
} as const

const SEM_TARIFA = {
  chargeCar: null,
  chargePerAxle: null,
  chargePerAxleAutomatic: null,
  latitude: '-21.5000',
  longitude: '-47.9000',
  name: 'Praça não mapeada',
  operator: null,
  osmNodeId: 333,
} as const

const TRES_EIXOS = { count: 3, source: 'declared' } as const

describe('extrato do pedágio, praça a praça (spec 090 T8)', () => {
  /**
   * ⚠️ **A linha da praça tem de fechar com o total.** É por isso que ela sai do valor **efetivo**,
   * nunca do `chargePerAxle` cru: com tag, o cru é a tarifa que o veículo não pagou, e um extrato
   * cujas linhas somam diferente do total é pior que extrato nenhum — ele faz duvidar do total.
   */
  test('multiplica o valor efetivo pelos eixos, praça a praça', () => {
    const linhas = describeTollBoothCharges({
      axles: TRES_EIXOS,
      booths: [COM_AS_DUAS, SO_MANUAL],
      paymentMode: 'automatic',
    })

    expect(linhas.map((linha) => linha.effectiveChargePerAxle)).toEqual(['9.9700', '11.8000'])
    expect(linhas.map((linha) => linha.total)).toEqual(['29.9100', '35.4000'])
  })

  /** Sem tag manda a manual, e nenhuma praça cai — não havia de onde cair. */
  test('sem tag, o efetivo é a tarifa manual e nada cai', () => {
    const linhas = describeTollBoothCharges({
      axles: TRES_EIXOS,
      booths: [COM_AS_DUAS],
      paymentMode: 'manual',
    })

    expect(linhas[0]?.effectiveChargePerAxle).toBe('10.5000')
    expect(linhas[0]?.fellBackToManual).toBe(false)
  })

  /**
   * ⚠️ A queda para a manual é **por praça**, e o extrato é o único lugar onde se vê **qual** caiu.
   * O contador do resumo diz quantas; sem a marca na linha, descobrir qual exigia conferir uma a
   * uma no site da concessionária.
   */
  test('marca na linha a praça que caiu para a manual', () => {
    const linhas = describeTollBoothCharges({
      axles: TRES_EIXOS,
      booths: [COM_AS_DUAS, SO_MANUAL],
      paymentMode: 'automatic',
    })

    expect(linhas.map((linha) => linha.fellBackToManual)).toEqual([false, true])
  })

  /**
   * ⚠️ Praça sem tarifa nenhuma é `null` nas duas colunas — **nunca zero**. Zero na linha diria que
   * a cancela é franca, e é justamente o caso que o resumo conta em `boothsWithoutCharge` para o
   * total não passar por completo.
   */
  test('praça sem tarifa conhecida é ausência, nunca zero', () => {
    const linhas = describeTollBoothCharges({
      axles: TRES_EIXOS,
      booths: [SEM_TARIFA],
      paymentMode: 'manual',
    })

    expect(linhas[0]?.effectiveChargePerAxle).toBeNull()
    expect(linhas[0]?.total).toBeNull()
    expect(linhas[0]?.fellBackToManual).toBe(false)
  })

  /** A ordem é a da passagem: o extrato é lido junto com o traçado, de cima para baixo. */
  test('preserva a ordem em que a rota passa', () => {
    const linhas = describeTollBoothCharges({
      axles: TRES_EIXOS,
      booths: [SO_MANUAL, COM_AS_DUAS],
      paymentMode: 'manual',
    })

    expect(linhas.map((linha) => linha.osmNodeId)).toEqual([222, 111])
  })
})
