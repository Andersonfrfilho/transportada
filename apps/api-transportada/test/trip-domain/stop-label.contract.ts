/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A parada agrupa por `(CEP, número, município)`: dois portões da mesma rua são duas paradas. Sem o
 * número no rótulo, elas aparecem com texto idêntico — foi o que aconteceu numa viagem real, com
 * `AVENIDA JOAO DE LOURENCO` duas vezes, e nada dizendo que eram lugares diferentes.
 */
import { describe, expect, test } from 'bun:test'

import { buildStopLabel } from '../../src/trips/domain/stop-label.policy.js'

const COMPLETO = {
  city: 'SAO CARLOS',
  number: '1166',
  state: 'SP',
  street: 'RUA MIGUEL PETRONI',
}

describe('rótulo da parada', () => {
  test('o número vem logo depois da rua, que é onde se lê', () => {
    expect(buildStopLabel(COMPLETO)).toBe('RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP')
  })

  /** O defeito que motivou a política: dois portões distintos com o mesmo texto. */
  test('mesma rua com números diferentes produz rótulos diferentes', () => {
    const primeiro = buildStopLabel({ ...COMPLETO, number: '230' })
    const segundo = buildStopLabel({ ...COMPLETO, number: '585' })

    expect(primeiro).not.toBe(segundo)
  })

  /** "S/N" é informação de cadastro, e polui justamente quem procura um número na rua. */
  test.each([['S/N'], ['SN'], ['s/n'], ['sem número'], ['  ']])(
    'endereço sem número (%p) não imprime a marca',
    (number) => {
      expect(buildStopLabel({ ...COMPLETO, number })).toBe('RUA MIGUEL PETRONI, SAO CARLOS, SP')
    },
  )

  test('número ausente não vira vírgula solta', () => {
    expect(buildStopLabel({ ...COMPLETO, number: null })).toBe('RUA MIGUEL PETRONI, SAO CARLOS, SP')
  })

  test('cidade ausente não vira vírgula solta', () => {
    expect(buildStopLabel({ ...COMPLETO, city: null })).toBe('RUA MIGUEL PETRONI, 1166, SP')
  })

  /**
   * O rótulo é para ler, não para agrupar: `Nº 1.166-A` é o que está impresso na nota, e a
   * normalização da chave (caixa alta, sem `nº`) mostraria uma grafia que ninguém escreveu.
   */
  test('a grafia do cadastro é preservada', () => {
    expect(buildStopLabel({ ...COMPLETO, number: 'Nº 1.166-A' })).toBe(
      'RUA MIGUEL PETRONI, Nº 1.166-A, SAO CARLOS, SP',
    )
  })

  test('endereço vazio devolve rótulo vazio, não separadores', () => {
    expect(buildStopLabel({ city: null, number: null, state: null, street: null })).toBe('')
  })
})
