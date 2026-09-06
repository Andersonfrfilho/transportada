/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { detectWeightConcentration } from '../../src/trips/domain/weight-concentration.policy.js'

describe('o alerta de peso concentrado numa parada (spec 085 G006)', () => {
  /** Meia tonelada de uma parada só num canto do baú é o eixo carregado de um lado. */
  test('acusa a parada que domina o peso da viagem', () => {
    expect(
      detectWeightConcentration({
        stops: [
          { stopId: 'a', weightKilograms: '700' },
          { stopId: 'b', weightKilograms: '200' },
          { stopId: 'c', weightKilograms: '100' },
        ],
      }),
    ).toEqual({ share: 0.7, stopId: 'a' })
  })

  test('carga espalhada não acusa nada', () => {
    expect(
      detectWeightConcentration({
        stops: [
          { stopId: 'a', weightKilograms: '350' },
          { stopId: 'b', weightKilograms: '350' },
          { stopId: 'c', weightKilograms: '300' },
        ],
      }),
    ).toBeNull()
  })

  /**
   * ⚠️ Com uma parada só, concentração é 100% por definição — e não há nada a fazer com o aviso.
   * Acusá-la transformaria o alerta em ruído que se aprende a ignorar, e aí ele não serve mais para
   * a viagem em que importa.
   */
  test('viagem de uma parada não acusa concentração', () => {
    expect(
      detectWeightConcentration({ stops: [{ stopId: 'a', weightKilograms: '900' }] }),
    ).toBeNull()
  })

  /** Sem peso conhecido não há concentração a afirmar — ausência, nunca zero. */
  test('peso ausente ou zerado devolve ausência', () => {
    expect(
      detectWeightConcentration({
        stops: [
          { stopId: 'a', weightKilograms: null },
          { stopId: 'b', weightKilograms: null },
        ],
      }),
    ).toBeNull()
  })

  /** O limite é parâmetro: quem carrega uma carreta não tem o mesmo aperto de quem carrega um VUC. */
  test('o limite é ajustável', () => {
    expect(
      detectWeightConcentration({
        threshold: 0.3,
        stops: [
          { stopId: 'a', weightKilograms: '350' },
          { stopId: 'b', weightKilograms: '650' },
        ],
      })?.stopId,
    ).toBe('b')
  })
})

describe('o piso do alerta acompanha o número de paradas', () => {
  /**
   * ⚠️ Com duas paradas, meio a meio é o mais equilibrado que existe. Um limite fixo de 40%
   * acusaria isso, e o alerta que dispara sempre é o alerta que ninguém lê.
   */
  test('duas paradas meio a meio não é concentração', () => {
    expect(
      detectWeightConcentration({
        stops: [
          { stopId: 'a', weightKilograms: '500' },
          { stopId: 'b', weightKilograms: '500' },
        ],
      }),
    ).toBeNull()
  })

  test('duas paradas desiguais continuam sendo acusadas', () => {
    expect(
      detectWeightConcentration({
        stops: [
          { stopId: 'a', weightKilograms: '800' },
          { stopId: 'b', weightKilograms: '200' },
        ],
      })?.stopId,
    ).toBe('a')
  })
})
