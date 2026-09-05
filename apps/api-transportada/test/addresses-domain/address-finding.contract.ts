/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_FINDING_KINDS,
  FINDING_SEVERITY,
  resolveAddressFinding,
  type AddressComparisonFacts,
} from '../../src/addresses/domain/address-finding.policy.js'

const BASE: AddressComparisonFacts = {
  cityMismatch: false,
  matchLevel: 'rooftop',
  noteStreet: 'RUA CAP AUGUSTO DE ALMEIDA',
  notePostalCode: '14210-000',
  providerStreet: 'Rua Capitão Augusto de Almeida',
  providerPostalCode: '14210-000',
}

describe('o que vai ao contratante, e em que ordem (spec 084, G8)', () => {
  /**
   * ⚠️ **A ordem é "o que nenhuma coordenada conserta" primeiro.** Ordenar por distância poria no
   * topo o centroide de município — justamente o caso que o lote já resolveu comprando coordenada.
   */
  test('a gravidade segue a ordem declarada', () => {
    const severities = ADDRESS_FINDING_KINDS.map((kind) => FINDING_SEVERITY[kind])
    expect(severities).toEqual([...severities].sort((a, b) => a - b))
    /**
     * ADR-0062 entrou na frente: o endereço que nem pagando foi apontado é o único em que a carga
     * não sabe para onde ir. Os outros são cadastro feio com entrega boa.
     */
    expect(ADDRESS_FINDING_KINDS[0]).toBe('coordinate_unresolved')
    expect(ADDRESS_FINDING_KINDS[1]).toBe('street_unknown')
  })

  /** O caso comum e desejado: o texto está bom, e o que se comprou foi coordenada melhor. */
  test('texto bom não vira pedido', () => {
    expect(resolveAddressFinding(BASE)).toBeNull()
  })

  /**
   * ⚠️ **Rua vazia é "não conheço", não "você errou" — e medido é o caso que mais aparece.**
   * `not_found` deu zero em 148; treze caíram em `approximate`, que é o provedor achando só o
   * município porque o logradouro não existe para ele. Comparado com rua vazia, isso dava
   * `street_different`, e o relatório dizia "esta é outra rua" com um campo em branco ao lado.
   */
  test('logradouro que o provedor não conhece é o pedido mais grave', () => {
    expect(resolveAddressFinding({ ...BASE, matchLevel: 'not_found' })).toBe('street_unknown')
    expect(resolveAddressFinding({ ...BASE, matchLevel: 'approximate', providerStreet: '' })).toBe(
      'street_unknown',
    )
    expect(
      resolveAddressFinding({ ...BASE, matchLevel: 'approximate', providerStreet: '   ' }),
    ).toBe('street_unknown')
  })

  /** Resultado de outro município foi descartado — não há comparação de rua em que confiar. */
  test('outro município vem antes da rua, porque a rua nem foi comparada', () => {
    const finding = resolveAddressFinding({
      ...BASE,
      cityMismatch: true,
      providerStreet: 'Rua Completamente Outra',
    })
    expect(finding).toBe('city_mismatch')
  })

  test('rua de outro lugar é pedido; grafia diferente não é', () => {
    expect(resolveAddressFinding({ ...BASE, providerStreet: 'Avenida Júlio Macari' })).toBe(
      'street_different',
    )
    expect(
      resolveAddressFinding({ ...BASE, providerStreet: 'Rua Capitao Augusto de Almeidas' }),
    ).toBeNull()
  })

  /**
   * O achado de maior valor econômico: CEP genérico de cidade para CEP de rua devolve o endereço ao
   * degrau 1, que é grátis, para sempre.
   */
  test('CEP divergente é pedido, e a máscara não conta', () => {
    expect(resolveAddressFinding({ ...BASE, providerPostalCode: '14210-017' })).toBe(
      'postal_code_stale',
    )
    expect(resolveAddressFinding({ ...BASE, providerPostalCode: '14210000' })).toBeNull()
  })

  /** CEP que o provedor não devolveu não é divergência — é ausência. */
  test('CEP ausente de um lado não vira pedido', () => {
    expect(resolveAddressFinding({ ...BASE, providerPostalCode: '' })).toBeNull()
    expect(resolveAddressFinding({ ...BASE, notePostalCode: '142' })).toBeNull()
  })

  /** Cadastro curto entra por último: o caminhão chega, e é a mesma rua com o nome inteiro. */
  test('cadastro curto é o pedido menos urgente', () => {
    const finding = resolveAddressFinding({
      ...BASE,
      noteStreet: 'RUA MARECHAL FLORIANO',
      providerStreet: 'Rua Marechal Floriano Peixoto',
    })
    expect(finding).toBe('street_incomplete')
  })

  /**
   * ⚠️ **Bairro nunca vira pedido.** Ele diverge em 44 dos 148 medidos, e a amostra mostra por quê:
   * `JARDIM DO LAGO` contra `Cohab 1`, `CENTRO` contra `Itobi`. O provedor não é autoridade sobre
   * limite de bairro, e pedir correção disso é pedir que o contratante concorde com um palpite.
   */
  test('bairro não é um dos tipos de pedido', () => {
    expect(ADDRESS_FINDING_KINDS.some((kind) => kind.includes('district'))).toBe(false)
  })
})
