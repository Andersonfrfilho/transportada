/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { checkPlaceAcceptance } from '../../src/geocoding-refine/domain/place-acceptance.policy.js'

const REQUEST = { city: 'LUIS ANTONIO', number: '533' }

function check(candidate: { readonly cityName: string; readonly streetNumber: string }) {
  return checkPlaceAcceptance({ candidate, request: REQUEST })
}

/**
 * As três guardas do degrau 2b (adendo de 2026-09-05 à ADR-0062). Cada uma vem de uma medição
 * contra a Places API em 2026-09-05, com o endereço real de Luís Antônio.
 */
describe('o que a Places devolve só é gravado se responder ao que foi pedido', () => {
  test('aceita a porta que bate com a pedida, mesmo com o município acentuado', () => {
    expect(check({ cityName: 'Luís Antônio', streetNumber: '533' })).toBe('accepted')
  })

  /**
   * ⚠️ **O caso perigoso, medido.** Pedimos o número 99999 e a Places devolveu o 533 — o prédio
   * certo da rua, que é o prédio errado do pedido —, sem nada na resposta dizendo que trocou. Gravar
   * isso seria coordenada de outro lugar com cara de acerto: a família de defeito da ADR-0044 §1.
   */
  test('recusa quando o número que volta não é o que foi pedido', () => {
    expect(check({ cityName: 'Luís Antônio', streetNumber: '999' })).toBe('number_mismatch')
  })

  /** Resultado sem número é ponto de rua, e a rua inteira o degrau 1 já dá de graça. */
  test('recusa o resultado que não traz número', () => {
    expect(check({ cityName: 'Luís Antônio', streetNumber: '' })).toBe('without_number')
  })

  test('recusa quando o pedido não tem número para conferir', () => {
    expect(
      checkPlaceAcceptance({
        candidate: { cityName: 'Luís Antônio', streetNumber: '533' },
        request: { city: 'LUIS ANTONIO', number: 'S/N' },
      }),
    ).toBe('without_number')
  })

  test('recusa o lugar que cai em outro município', () => {
    expect(check({ cityName: 'Ribeirão Preto', streetNumber: '533' })).toBe('city_mismatch')
  })

  /**
   * ⚠️ **O município se compara dobrado, nunca literal.** A nota grafa `LUIS ANTONIO` e o provedor
   * devolve `Luís Antônio`; recusar por acento jogaria fora exatamente o caso que este degrau existe
   * para resolver — cadastro com grafia imperfeita.
   */
  test('não recusa por acento, caixa ou espaço', () => {
    expect(check({ cityName: '  luís   antônio ', streetNumber: '533' })).toBe('accepted')
  })

  /** O complemento na porta não muda a porta: `533 A` e `533` são o mesmo lugar. */
  test('compara só os dígitos do número', () => {
    expect(
      checkPlaceAcceptance({
        candidate: { cityName: 'Luís Antônio', streetNumber: '533' },
        request: { city: 'LUIS ANTONIO', number: 'nº 533 A' },
      }),
    ).toBe('accepted')
  })

  /**
   * Município ausente na resposta não recusa: quem afirma a divergência é a presença dela. Recusar
   * por falta de dado transformaria silêncio do provedor em acusação de erro nosso.
   */
  test('aceita quando o provedor não nomeia o município', () => {
    expect(check({ cityName: '', streetNumber: '533' })).toBe('accepted')
  })
})
