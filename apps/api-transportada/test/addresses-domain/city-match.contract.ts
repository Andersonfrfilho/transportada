/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { checkCityMatch } from '../../src/addresses/domain/city-match.policy.js'

const LUIS_ANTONIO = '3527603'
const PORTO_FERREIRA = '3540705'

describe('conferência de município (spec 084, RF2 / G2)', () => {
  /**
   * ⚠️ **O aceite da G2.** Mandar a cidade na consulta é pedido; o provedor pode ignorá-lo e
   * devolver uma "Rua 7 de Setembro" de outro município, que existe em centenas deles. Sem conferir
   * a volta, essa coordenada é gravada como `rooftop`: precisão alta na cidade errada, e ninguém
   * mais desconfia dela.
   */
  test('resultado em outro município é descartado', () => {
    expect(checkCityMatch({ noteCityCode: LUIS_ANTONIO, resultCityCode: PORTO_FERREIRA })).toEqual({
      mismatch: true,
      reason: 'city_differs',
    })
  })

  test('mesmo município passa', () => {
    expect(checkCityMatch({ noteCityCode: LUIS_ANTONIO, resultCityCode: LUIS_ANTONIO })).toEqual({
      mismatch: false,
      reason: 'matched',
    })
  })

  /**
   * ⚠️ Não saber em que cidade o provedor caiu é indistinguível de ele ter caído na errada. O lado
   * seguro do erro é recusar: o degrau seguinte é o CEP, que é grátis e nosso.
   */
  test('resultado sem município identificável também é descarte', () => {
    expect(checkCityMatch({ noteCityCode: LUIS_ANTONIO, resultCityCode: null })).toEqual({
      mismatch: true,
      reason: 'unknown_result_city',
    })
    expect(checkCityMatch({ noteCityCode: LUIS_ANTONIO, resultCityCode: '  ' })).toEqual({
      mismatch: true,
      reason: 'unknown_result_city',
    })
  })

  /**
   * ⚠️ Nota **sem** município é outra coisa: não há o que conferir. Recusar aqui esconderia a causa
   * real — a nota não monta chave de parada — atrás de um "provedor errou de cidade" que não houve.
   */
  test('nota sem município não vira erro do provedor', () => {
    expect(checkCityMatch({ noteCityCode: null, resultCityCode: PORTO_FERREIRA })).toEqual({
      mismatch: false,
      reason: 'matched',
    })
  })

  /**
   * ⚠️ **A conferência é pelo código IBGE, nunca pelo nome.** Cada provedor devolve o município numa
   * grafia — `Luís Antônio`, `LUIS ANTONIO` — e comparar texto reintroduziria aqui o problema que a
   * spec rejeita em toda parte. Códigos diferentes são cidades diferentes, sem exceção.
   */
  test('não tenta casar nome de cidade', () => {
    expect(checkCityMatch({ noteCityCode: '3527603', resultCityCode: '3527604' }).mismatch).toBe(
      true,
    )
  })
})
