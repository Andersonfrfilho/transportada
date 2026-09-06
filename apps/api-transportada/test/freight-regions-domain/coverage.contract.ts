/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  coversRegion,
  foldRegionCity,
  normalizeRegionCity,
  parseRegionCode,
} from '../../src/freight-regions/domain/region-coverage.policy.js'

describe('freight region coverage policy', () => {
  test('reads the family and the zone out of the printed route code', () => {
    expect(parseRegionCode('1.002')).toEqual({ family: '1', zone: 3 })
    expect(parseRegionCode('0.001')).toEqual({ family: '0', zone: 0 })
    expect(parseRegionCode('7.003')).toEqual({ family: '7', zone: 4 })
  })

  /** Código fora da forma impressa é dado de importação errado — recusar é o que impede zona chutada. */
  test('refuses a code that is not the printed form', () => {
    for (const code of ['1002', '1.2', '1.004', 'a.001', '', '1.001 ']) {
      expect(() => parseRegionCode(code)).toThrow()
    }
  })

  /**
   * A coluna OBSERVAÇÃO do PDF diz "Todas da Zona 1, 2, mais Zona 3". A redundância não é guardada:
   * cada cidade nasce na zona própria, e quem resolve a cobertura é esta regra.
   */
  test('a zone covers every zone below it inside the same family', () => {
    for (const code of ['1.000', '1.001', '1.002']) {
      expect(coversRegion({ candidate: code, coverage: '1.002' })).toBe(true)
    }
    expect(coversRegion({ candidate: '1.003', coverage: '1.002' })).toBe(false)
  })

  test('coverage never crosses to another route family', () => {
    expect(coversRegion({ candidate: '5.000', coverage: '1.003' })).toBe(false)
    expect(coversRegion({ candidate: '1.000', coverage: '5.003' })).toBe(false)
  })

  /** A matriz é saída, não zona: ela cobre a si mesma e nada mais. */
  test('the head office covers only itself', () => {
    expect(coversRegion({ candidate: '0.001', coverage: '0.001' })).toBe(true)
    expect(coversRegion({ candidate: '1.000', coverage: '0.001' })).toBe(false)
  })

  /** Mesma dobra de nome do resto do produto: "Matão", "MATÃO" e "  matão " são a mesma cidade. */
  test('folds city names by one rule', () => {
    expect(normalizeRegionCity('  são  joaquim da barra ')).toBe('SÃO JOAQUIM DA BARRA')
    expect(normalizeRegionCity('Matão')).toBe('MATÃO')
  })
})

/**
 * Spec 086 T1: **a grafia não pode decidir se a cidade tem zona.** A NF-e escreve o município sem
 * acento e a planilha do cliente escreve com — medido nesta base: das 76 cidades de destino, 39
 * casavam com `freight_region_cities` pela dobra de hoje, e as 37 que falhavam eram **todas** apenas
 * grafia (`RIBEIRAO PRETO` contra `Ribeirão Preto`), não cidade faltando. Dobrando o acento, 65.
 *
 * ⚠️ A dobra do acento é **chave de casamento, não forma de guardar**. `normalizeRegionCity` continua
 * devolvendo o nome acentuado, que é o que a tela imprime e o que a importação grava; quem compara
 * usa `foldRegionCity`. Trocar a gravação por "MATAO" resolveria o casamento e estragaria o
 * cadastro — o operador leria o nome errado da própria cidade dele.
 */
describe('freight region city folding', () => {
  test('keeps the accent in the stored form', () => {
    expect(normalizeRegionCity('Matão')).toBe('MATÃO')
    expect(normalizeRegionCity('  são  joaquim da barra ')).toBe('SÃO JOAQUIM DA BARRA')
  })

  test('the matching key folds the accent away, both sides alike', () => {
    for (const [fromInvoice, fromSpreadsheet] of [
      ['RIBEIRAO PRETO', 'Ribeirão Preto'],
      ['SAO CARLOS', 'São Carlos'],
      ['MATAO', 'Matão'],
      ['GUAIRA', 'Guaíra'],
      ['SANTA CRUZ DA CONCEICAO', 'Santa Cruz da Conceição'],
    ] as const) {
      expect(foldRegionCity(fromInvoice)).toBe(foldRegionCity(fromSpreadsheet))
    }
  })

  /** A dobra não pode colapsar cidades que são diferentes de verdade. */
  test('folding never merges two different cities', () => {
    expect(foldRegionCity('Barrinha')).not.toBe(foldRegionCity('Barretos'))
    expect(foldRegionCity('Guará')).not.toBe(foldRegionCity('Guaíra'))
  })

  test('the matching key keeps the case and whitespace folding it already had', () => {
    expect(foldRegionCity('  são  carlos ')).toBe(foldRegionCity('SAO CARLOS'))
  })
})
