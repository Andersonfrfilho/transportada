/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  extractProviderAddress,
  toProviderMatchLevel,
} from '../../src/addresses/domain/provider-address.policy.js'

const COMPONENTES = [
  { long_name: '533', short_name: '533', types: ['street_number'] },
  { long_name: 'Rua Américo de Araújo Píres', short_name: 'R. Américo', types: ['route'] },
  { long_name: 'Centro', short_name: 'Centro', types: ['sublocality_level_1', 'sublocality'] },
  { long_name: 'Luís Antônio', short_name: 'Luís Antônio', types: ['administrative_area_level_2'] },
  { long_name: 'São Paulo', short_name: 'SP', types: ['administrative_area_level_1'] },
  { long_name: '14210-000', short_name: '14210-000', types: ['postal_code'] },
]

describe('o que o provedor devolve sobre o endereço (spec 084, G5/RF13)', () => {
  /**
   * ⚠️ **`RANGE_INTERPOLATED` nunca vira `rooftop`** (RF13). Ele é a rua certa com o número
   * **estimado** entre dois vizinhos conhecidos — palpite sobre a via, não a porta. Achatar os dois
   * apagaria justamente a diferença que a ADR-0044 §5 faz a precisão viajar visível para preservar.
   */
  test('os quatro níveis saem do location_type, e a interpolação tem o seu', () => {
    expect(toProviderMatchLevel('ROOFTOP')).toBe('rooftop')
    expect(toProviderMatchLevel('RANGE_INTERPOLATED')).toBe('range_interpolated')
    expect(toProviderMatchLevel('GEOMETRIC_CENTER')).toBe('approximate')
    expect(toProviderMatchLevel('APPROXIMATE')).toBe('approximate')
  })

  /**
   * ⚠️ **Sem resultado é `not_found`, e desconhecido é `approximate`.** São coisas diferentes: um diz
   * que o provedor não achou nada, o outro que achou algo cuja finura não sabemos nomear. O
   * desconhecido cai no **mais grosseiro que ainda significa "achou"** — nunca em `rooftop`, que
   * poria um palpite de quilômetros no relatório como se fosse a porta.
   */
  test('ausência é not_found; tipo desconhecido é approximate, nunca rooftop', () => {
    expect(toProviderMatchLevel(null)).toBe('not_found')
    expect(toProviderMatchLevel('')).toBe('not_found')
    expect(toProviderMatchLevel('TIPO_QUE_O_GOOGLE_INVENTAR_AMANHA')).toBe('approximate')
  })

  test('lê rua, número, bairro, CEP, município e UF dos componentes', () => {
    expect(extractProviderAddress(COMPONENTES)).toEqual({
      cityName: 'Luís Antônio',
      district: 'Centro',
      number: '533',
      postalCode: '14210-000',
      state: 'SP',
      street: 'Rua Américo de Araújo Píres',
    })
  })

  /** ⚠️ A UF é a **sigla** (`short_name`); o resto é o nome por extenso, que é o que se compara. */
  test('a UF sai da sigla, e a rua do nome por extenso', () => {
    const lido = extractProviderAddress(COMPONENTES)
    expect(lido.state).toBe('SP')
    expect(lido.street).not.toBe('R. Américo')
  })

  /**
   * ⚠️ **Bairro tem três nomes possíveis, e a ordem importa.** `sublocality_level_1` é o bairro que
   * o Brasil chama de bairro; `neighborhood` costuma ser um recorte mais fino, e aceitá-lo primeiro
   * encheria a comparação de divergência de bairro que não existe.
   */
  test('o bairro prefere sublocality_level_1 a neighborhood', () => {
    const lido = extractProviderAddress([
      { long_name: 'Jardim Lisboa', short_name: 'Jardim Lisboa', types: ['neighborhood'] },
      { long_name: 'Centro', short_name: 'Centro', types: ['sublocality_level_1'] },
    ])
    expect(lido.district).toBe('Centro')
  })

  /** Campo que o provedor não devolve é string vazia — a coluna é `not null` com `default ''`. */
  test('o que não veio é vazio, nunca indefinido', () => {
    expect(extractProviderAddress([])).toEqual({
      cityName: '',
      district: '',
      number: '',
      postalCode: '',
      state: '',
      street: '',
    })
  })

  /** Componente malformado não derruba a leitura: o lote roda sobre 300 e não pode parar no 7º. */
  test('componente sem types ou sem nome é ignorado', () => {
    const lido = extractProviderAddress([
      {},
      { types: ['route'] },
      { long_name: 'Avenida Recife', types: ['route'] },
    ] as never)
    expect(lido.street).toBe('Avenida Recife')
  })
})
