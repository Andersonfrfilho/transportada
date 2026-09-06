/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  LOADING_ACCESS_KINDS,
  resolveDefaultLoadingAccess,
} from '../../src/shared/loading-access.constant.js'

describe('por onde o veículo carrega (spec 085 G003)', () => {
  /** Três, e não dois: "aberta" não é "tem lateral" — nela a ordem deixa de ser recomendação. */
  test('o catálogo tem os três acessos, nesta ordem', () => {
    expect(LOADING_ACCESS_KINDS).toEqual(['rear', 'rear_and_side', 'open'])
  })

  /** O sider abre o comprimento inteiro pela lateral; a aberta não tem porta para restringir. */
  test('sider e carroceria aberta nascem abertos', () => {
    expect(resolveDefaultLoadingAccess('05')).toBe('open')
    expect(resolveDefaultLoadingAccess('01')).toBe('open')
  })

  /**
   * ⚠️ Baú fechado nasce `rear`, **nunca** `rear_and_side`: semear a lateral por otimismo faria a
   * tela dizer que dá para alcançar o meio de uma carga que só abre atrás — e quem seguisse
   * carregaria errado. O palpite seguro é o mais restritivo.
   */
  test('baú fechado e desconhecido nascem só com a traseira', () => {
    expect(resolveDefaultLoadingAccess('02')).toBe('rear')
    expect(resolveDefaultLoadingAccess('00')).toBe('rear')
    expect(resolveDefaultLoadingAccess('03')).toBe('rear')
  })

  /** A porta lateral não está no `tpCar`: nenhum código do MDF-e semeia `rear_and_side`. */
  test('nenhuma carroceria semeia a porta lateral — ela é digitada', () => {
    const semeados = ['00', '01', '02', '03', '04', '05'].map(resolveDefaultLoadingAccess)

    expect(semeados).not.toContain('rear_and_side')
  })
})
