/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  formatTollMultiplier,
  resolveTollMultiplier,
  resolveTollTyreConfiguration,
} from '../../src/toll-booths/domain/toll-category.policy.js'
import { VEHICLE_TYPES } from '../../src/shared/vehicle-type.constant.js'

function multiplicador(vehicleType: (typeof VEHICLE_TYPES)[number], axleCount: number): string {
  return formatTollMultiplier(resolveTollMultiplier({ axleCount, vehicleType }))
}

describe('categoria de pedágio (rodagem, não eixo físico)', () => {
  /**
   * ⚠️ **O defeito que este contrato tranca.** A conta multiplicava a tarifa pelos eixos físicos, e
   * a Fiorino — furgão de rodagem simples, 2 eixos — pagava 2× onde a cancela cobra 1×. Medido em
   * três praças: R$ 76,80 na tela contra R$ 38,40 na cancela.
   */
  test('furgão de dois eixos é Categoria 1 e paga uma tarifa', () => {
    expect(multiplicador('utility', 2)).toBe('1')
    expect(multiplicador('car', 2)).toBe('1')
    expect(multiplicador('van', 2)).toBe('1')
  })

  /**
   * VUC e 3/4 na configuração comum saem com rodagem **simples** no eixo traseiro, e a maioria das
   * praças os cobra na Categoria 1 — não na tarifa de carga pesada. Decisão de produto.
   */
  test('VUC e 3/4 pagam como rodagem simples', () => {
    expect(resolveTollTyreConfiguration('vuc')).toBe('single')
    expect(resolveTollTyreConfiguration('three_quarter')).toBe('single')
    expect(multiplicador('vuc', 2)).toBe('1')
    expect(multiplicador('three_quarter', 2)).toBe('1')
  })

  /** Rodagem dupla paga um por eixo: é onde a conta antiga já estava certa, e ela não muda. */
  test('rodagem dupla paga um por eixo', () => {
    expect(multiplicador('toco', 2)).toBe('2')
    expect(multiplicador('truck', 3)).toBe('3')
    expect(multiplicador('tractor_unit', 5)).toBe('5')
  })

  /** Categoria 9: a moto tem dois eixos e paga **meia** tarifa — não metade por eixo. */
  test('moto paga meia tarifa, e não meia por eixo', () => {
    expect(multiplicador('motorcycle', 2)).toBe('0,5')
    expect(multiplicador('motorcycle', 3)).toBe('0,5')
  })

  /** Categoria 3: automóvel com reboque, três eixos simples, 1,5 — a fração existe na tabela. */
  test('simples com três eixos é uma tarifa e meia', () => {
    expect(multiplicador('car', 3)).toBe('1,5')
  })

  /**
   * ⚠️ `other` continua em dupla: é o piso do menor caminhão que a referência de eixos sempre
   * escolheu, e mudá-lo mexeria calado no custo de todo veículo sem tipo declarado.
   */
  test('tipo desconhecido mantém o piso de caminhão', () => {
    expect(resolveTollTyreConfiguration('other')).toBe('dual')
    expect(multiplicador('other', 2)).toBe('2')
  })

  /** Todo tipo do catálogo tem rodagem: tipo novo não compila sem alguém decidir a dele. */
  test('o catálogo inteiro está classificado', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      expect(['single', 'dual']).toContain(resolveTollTyreConfiguration(vehicleType))
    }
  })
})
