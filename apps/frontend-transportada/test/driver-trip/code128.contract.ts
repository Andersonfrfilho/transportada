/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  Code128EncodingError,
  encodeCode128C,
  totalCode128Width,
} from '@/components/ui/code128.service'

/** Chave de NF-e sintética: 44 dígitos, que é o que o Code 128-C codifica em 22 símbolos. */
const ACCESS_KEY = '35260712345678000195550010000000011000000017'

describe('o código de barras da chave', () => {
  /**
   * O leitor da portaria não perdoa: start, dados, verificador e stop, nessa ordem. Contar símbolos é
   * o jeito de provar que nenhum deles some — 1 start + 22 dados + 1 verificador + stop.
   */
  it('codifica a chave inteira em símbolos de dois dígitos', () => {
    const widths = encodeCode128C(ACCESS_KEY)

    // 1 start + 22 de dados + 1 verificador = 24 símbolos de 6 larguras, mais as 7 do stop
    expect(widths).toHaveLength(24 * 6 + 7)
  })

  it('começa pelo start do subconjunto C', () => {
    // 105 → '211232'
    expect(encodeCode128C('00').slice(0, 6)).toEqual([2, 1, 1, 2, 3, 2])
  })

  it('termina pelo stop', () => {
    const widths = encodeCode128C('00')

    expect(widths.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2])
  })

  /**
   * O verificador é a soma ponderada pela posição, e a posição do start conta como **1**, não como
   * zero. Errar isso produz um código que desenha bonito e nenhum leitor aceita — e só se descobre
   * com o conferente parado na portaria.
   */
  it('calcula o dígito verificador com a posição do start valendo um', () => {
    // start 105 × 1 + '42' × 1 = 147; 147 % 103 = 44 → padrão '132131'
    expect(encodeCode128C('42').slice(-13, -7)).toEqual([1, 3, 2, 1, 3, 1])
  })

  /**
   * Vetor conferido à mão, e é ele que impede este teste de se auto-provar: start 105 × 1 mais dado
   * 0 × 1 dá 105, e 105 % 103 = 2 — o padrão 2 é '222221'. Se a tabela estivesse deslocada, este
   * número não bateria.
   */
  it('confere contra um vetor calculado à mão', () => {
    expect(encodeCode128C('00').slice(-13, -7)).toEqual([2, 2, 2, 2, 2, 1])
  })

  it('cada símbolo soma onze módulos', () => {
    const widths = encodeCode128C(ACCESS_KEY)
    for (let index = 0; index + 6 <= widths.length - 7; index += 6) {
      const symbol = widths.slice(index, index + 6)
      expect(symbol.reduce((total, width) => total + width, 0)).toBe(11)
    }
  })

  /** Chave com número ímpar de dígitos não existe — e um zero à esquerda inventado mudaria a chave. */
  it('recusa quantidade ímpar de dígitos em vez de completar', () => {
    expect(() => encodeCode128C('123')).toThrow(Code128EncodingError)
  })

  it('recusa o que não é dígito', () => {
    expect(() => encodeCode128C('12AB')).toThrow(Code128EncodingError)
    expect(() => encodeCode128C('')).toThrow(Code128EncodingError)
  })

  it('a largura total é a soma dos módulos, para o SVG não chutar escala', () => {
    const widths = encodeCode128C('0000')

    expect(totalCode128Width(widths)).toBe(widths.reduce((total, width) => total + width, 0))
  })
})
