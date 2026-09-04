/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  compareAddresses,
  needsHuman,
  MATCH_LEVEL_SEVERITY,
  type AddressSide,
} from '../../src/addresses/domain/address-comparison.policy.js'
import { PROVIDER_MATCH_LEVELS } from '../../src/database/database.schema.js'

const NOTA: AddressSide = {
  district: null,
  number: '533',
  postalCode: '14210-000',
  street: 'R AMERICA DE ARAUJO PERES',
}

describe('comparação de endereço com o provedor (spec 084, RF8)', () => {
  /**
   * ⚠️ **Quatro níveis, não dois** — medido com a chave real em 2026-09-04. `range_interpolated` é a
   * rua certa com **número estimado** entre dois vizinhos, e nunca pode ser tratado como a porta.
   */
  test('o catálogo tem os quatro níveis que o provedor devolve', () => {
    expect([...PROVIDER_MATCH_LEVELS]).toEqual([
      'rooftop',
      'range_interpolated',
      'approximate',
      'not_found',
    ])
    expect(MATCH_LEVEL_SEVERITY.range_interpolated).toBeLessThan(MATCH_LEVEL_SEVERITY.rooftop)
  })

  /**
   * ⚠️ **O caso medido em Luis Antonio.** `R AMERICA DE ARAUJO PERES` devolve só o município: o
   * texto da nota **não existe** para o provedor. Marcar `streetDiverges` aqui diria "as duas ruas
   * diferem" quando só há uma — o sinal é o próprio nível, e ele já basta.
   */
  test('sem rua no retorno, o nível é o sinal — não se inventa divergência', () => {
    const c = compareAddresses({
      cityMismatch: false,
      matchLevel: 'approximate',
      note: NOTA,
      provider: { district: null, number: null, postalCode: '14210-000', street: null },
    })

    expect(c.streetDiverges).toBe(false)
    expect(needsHuman(c)).toBe(true)
  })

  /** O caso sutil: achou a rua, com nome diferente. É o que vira sugestão ao contratante. */
  test('rua encontrada com nome diferente é divergência', () => {
    const c = compareAddresses({
      cityMismatch: false,
      matchLevel: 'rooftop',
      note: NOTA,
      provider: {
        district: 'Centro',
        number: '533',
        postalCode: '14210-000',
        street: 'R. Américo de Araújo Píres',
      },
    })

    expect(c.streetDiverges).toBe(true)
    expect(needsHuman(c)).toBe(true)
  })

  /** ⚠️ Tipo de via, acento e pontuação não são divergência — `buildClientStreetKey` já colapsa. */
  test('abreviação de tipo de via e acento não divergem', () => {
    const c = compareAddresses({
      cityMismatch: false,
      matchLevel: 'rooftop',
      note: { ...NOTA, street: 'AVENIDA SAO JOAO' },
      provider: { district: null, number: '533', postalCode: '14210-000', street: 'Av. São João' },
    })

    expect(c.streetDiverges).toBe(false)
    expect(needsHuman(c)).toBe(false)
  })

  /**
   * ⚠️ **Bairro ausente na nota é acréscimo, não conflito.** A NF-e vem sem bairro o tempo todo;
   * tratar isso como divergência encheria o relatório de linhas que não pedem decisão nenhuma.
   */
  test('bairro que só o provedor tem não é divergência', () => {
    const c = compareAddresses({
      cityMismatch: false,
      matchLevel: 'rooftop',
      note: { ...NOTA, district: null },
      provider: {
        district: 'Jardim Lisboa',
        number: '533',
        postalCode: '14210-000',
        street: 'R America de Araujo Peres',
      },
    })

    expect(c.districtDiverges).toBe(false)
  })

  /**
   * ⚠️ A divergência de maior valor: CEP corrigido devolve o endereço ao degrau 1, que é grátis —
   * aquele endereço deixa de custar consulta para sempre. Medido em Ribeirão: enviamos `14078-369`
   * e o provedor devolveu `14078-390`.
   */
  test('CEP diferente é divergência, e a máscara não conta', () => {
    const divergente = compareAddresses({
      cityMismatch: false,
      matchLevel: 'range_interpolated',
      note: { ...NOTA, postalCode: '14078-369' },
      provider: {
        district: null,
        number: '289',
        postalCode: '14078-390',
        street: 'Avenida Recife',
      },
    })
    expect(divergente.postalCodeDiverges).toBe(true)

    const mesmoCep = compareAddresses({
      cityMismatch: false,
      matchLevel: 'rooftop',
      note: { ...NOTA, postalCode: '14210000' },
      provider: { district: null, number: '533', postalCode: '14210-000', street: NOTA.street },
    })
    expect(mesmoCep.postalCodeDiverges).toBe(false)
  })

  /**
   * ⚠️ **Município é portão, não campo.** Resultado em outra cidade é descartado (RF2) — comparar
   * rua de outra cidade é comparar outra coisa, e gravar `rooftop` na cidade errada é precisão alta
   * no lugar errado, de que ninguém mais desconfia. O CHECK do banco afirma o mesmo.
   */
  test('município divergente descarta a comparação inteira', () => {
    const c = compareAddresses({
      cityMismatch: true,
      matchLevel: 'rooftop',
      note: NOTA,
      provider: {
        district: 'Outro Bairro',
        number: '999',
        postalCode: '99999-999',
        street: 'RUA COMPLETAMENTE OUTRA',
      },
    })

    expect(c).toEqual({
      districtDiverges: false,
      matchLevel: 'rooftop',
      postalCodeDiverges: false,
      streetDiverges: false,
    })
  })

  /** Tudo batendo e a porta conhecida: é o caso que **não** precisa de gente. */
  test('rooftop sem divergência não vai ao humano', () => {
    const c = compareAddresses({
      cityMismatch: false,
      matchLevel: 'rooftop',
      note: NOTA,
      provider: { district: null, number: '533', postalCode: '14210-000', street: NOTA.street },
    })

    expect(needsHuman(c)).toBe(false)
  })
})
