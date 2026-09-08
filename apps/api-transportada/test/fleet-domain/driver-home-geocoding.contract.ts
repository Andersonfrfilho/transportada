/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  planDriverHomeGeocoding,
  type DriverHomeState,
} from '../../src/fleet/domain/driver-home-geocoding.policy.js'

const CASA: DriverHomeState = {
  city: 'Sertãozinho',
  geocodedAt: null,
  latitude: null,
  longitude: null,
  number: '2043',
  postalCode: '14170480',
  state: 'SP',
  street: 'Rua Antônio Fagundes',
}

describe('quando procurar a coordenada da casa do motorista (spec 097 D6)', () => {
  /** A primeira metade da regra: ficha sem coordenada e sem busca anterior manda buscar. */
  test('busca quando ninguém procurou ainda', () => {
    expect(planDriverHomeGeocoding(CASA)).toEqual({
      action: 'search',
      term: 'Rua Antônio Fagundes, 2043, Sertãozinho, SP, 14170480',
    })
  })

  /** Achou uma vez, não procura de novo: a ficha já tem a resposta. */
  test('não busca de novo quando a coordenada já está gravada', () => {
    const plano = planDriverHomeGeocoding({
      ...CASA,
      geocodedAt: new Date('2026-09-08T12:00:00Z'),
      latitude: '-21.1372345',
      longitude: '-47.9901234',
    })

    expect(plano).toEqual({ action: 'skip', reason: 'already_searched' })
  })

  /**
   * ⚠️ **O caso que faz a marca existir.** Procurou e não achou: a coordenada segue nula, e sem a
   * marca isto seria indistinguível de "ninguém procurou" — cada leitura da montagem dispararia uma
   * busca externa nova, para sempre, e nada falharia para denunciar isso.
   */
  test('não busca de novo depois de procurar e não achar', () => {
    const plano = planDriverHomeGeocoding({
      ...CASA,
      geocodedAt: new Date('2026-09-08T12:00:00Z'),
    })

    expect(plano).toEqual({ action: 'skip', reason: 'already_searched' })
  })

  /**
   * ⚠️ Endereço incompleto não vira busca: sem rua, o provedor devolve o centro da cidade, e o
   * centro da cidade gravado como casa do motorista é palpite com aparência de medida — a rota de
   * retorno terminaria num lugar onde ninguém mora.
   */
  test('não busca com endereço incompleto', () => {
    for (const incompleta of [{ street: '' }, { city: '  ' }]) {
      expect(planDriverHomeGeocoding({ ...CASA, ...incompleta })).toEqual({
        action: 'skip',
        reason: 'address_incomplete',
      })
    }
  })

  /** CEP pela metade só adiciona ruído ao casamento textual: fica de fora do termo. */
  test('só leva o CEP completo para o termo', () => {
    const plano = planDriverHomeGeocoding({ ...CASA, postalCode: '1417' })

    expect(plano).toEqual({ action: 'search', term: 'Rua Antônio Fagundes, 2043, Sertãozinho, SP' })
  })

  /** Sem número o endereço ainda é buscável — a rua e a cidade bastam para o provedor tentar. */
  test('busca sem número quando a ficha não tem', () => {
    const plano = planDriverHomeGeocoding({ ...CASA, number: '' })

    expect(plano).toEqual({
      action: 'search',
      term: 'Rua Antônio Fagundes, Sertãozinho, SP, 14170480',
    })
  })
})
