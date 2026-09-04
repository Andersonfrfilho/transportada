/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  NO_NUMBER_KEY,
  buildStopAddressKey,
  normalizeAddressNumber,
  normalizePostalCode,
} from '@/modules/trip/shared/stopAddressKey.service'

/**
 * A chave da parada é **cópia por valor** da API — o bundle não carrega código dela. Divergir é o
 * defeito caro e silencioso: a parada que a tela desenha e a parada que o vínculo cria deixam de
 * casar, e o roteiro nasce com duas paradas no mesmo portão.
 *
 * Este contrato compara **as regras**, não o texto do arquivo: caminho relativo entre apps não
 * existe em tempo de teste, e afirmar comportamento é mais forte que afirmar bytes.
 */
describe('chave de endereço da parada — paridade com a API', () => {
  it('trata as variantes de CEP como o mesmo lugar', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: '45', postalCode: '01310-100' }),
    ).toBe(buildStopAddressKey({ cityCode: '3543402', number: '45', postalCode: '01310100' }))
  })

  it('recusa CEP que não tem oito dígitos, em vez de inventar chave', () => {
    expect(normalizePostalCode('1234')).toBeNull()
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: '45', postalCode: '1234' }),
    ).toBeNull()
  })

  /** Sem número é um endereço, não um endereço faltando — e precisa de uma chave só. */
  it('reduz toda grafia de "sem número" à mesma chave', () => {
    for (const grafia of ['S/N', 'sn', 's / n', 'sem numero', 'Sem Número', '']) {
      expect(normalizeAddressNumber(grafia)).toBe(NO_NUMBER_KEY)
    }
  })

  it('descarta o prefixo de número e colapsa espaço interno', () => {
    expect(normalizeAddressNumber('nº 45')).toBe('45')
    expect(normalizeAddressNumber('no. 45')).toBe('45')
    /** O colapso de espaço estava faltando na primeira cópia — é a divergência que este teste pega. */
    expect(normalizeAddressNumber('45   A')).toBe('45 A')
  })

  it('monta a chave na ordem cidade|CEP|número', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: 'nº 45', postalCode: '01310-100' }),
    ).toBe('3543402|01310100|45')
  })
})
