/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDeliveryRegistryCandidates } from '../../src/nfe-imports/domain/delivery-registry.policy.js'

const RECIPIENT = { name: 'Loja Central', role: 'recipient', taxId: '12345678000190' }
const EMITTER = { name: 'Spani Atacadista', role: 'emitter', taxId: '30290856000160' }

describe('quem da nota vira cadastro (spec 060 T006)', () => {
  /** ADR-0048 §1: o destinatário tem hora e preço; o emitente é quem paga o repasse. */
  test('o destinatário vira cliente e o emitente vira contratante', () => {
    expect(resolveDeliveryRegistryCandidates([RECIPIENT, EMITTER])).toEqual({
      contractor: { displayName: 'Spani Atacadista', taxId: '30290856000160' },
      deliveryClient: { displayName: 'Loja Central', taxId: '12345678000190' },
    })
  })

  /** O transportador é a nossa própria empresa: cadastrá-la como cliente seria entregar a si mesma. */
  test('nenhum outro papel da nota vira cadastro', () => {
    expect(
      resolveDeliveryRegistryCandidates([
        { name: 'Transportadora', role: 'carrier', taxId: '11111111000111' },
      ]),
    ).toEqual({ contractor: null, deliveryClient: null })
  })

  /**
   * A NF-e é dado de terceiro: documento fora de forma é **ausência**, nunca erro. A nota entra
   * assim mesmo — o que ela não gera é cadastro.
   */
  test('documento torto não vira cadastro, e não vira exceção', () => {
    for (const taxId of ['', '123', null, undefined, 'não-é-documento']) {
      expect(
        resolveDeliveryRegistryCandidates([{ name: 'Alguém', role: 'recipient', taxId }])
          .deliveryClient,
      ).toBeNull()
    }
  })

  /** CNPJ alfanumérico é o caso normal desde 01/07/2026, e a forma canônica é sem máscara e maiúscula. */
  test('canonicaliza o documento, e aceita o CNPJ com letra', () => {
    expect(
      resolveDeliveryRegistryCandidates([
        { name: 'Loja', role: 'recipient', taxId: '12.abc.678/0001-90' },
      ]).deliveryClient,
    ).toEqual({ displayName: 'Loja', taxId: '12ABC678000190' })
  })

  /** Pessoa física recebe entrega como qualquer um: o CPF de onze dígitos entra. */
  test('aceita CPF', () => {
    expect(
      resolveDeliveryRegistryCandidates([
        { name: 'Fulano', role: 'recipient', taxId: '123.456.789-01' },
      ]).deliveryClient?.taxId,
    ).toBe('12345678901')
  })

  /** Nota sem destinatário nomeado existe: o cadastro nasce com o nome vazio e ganha nome depois. */
  test('nome ausente não impede o cadastro', () => {
    expect(
      resolveDeliveryRegistryCandidates([{ name: null, role: 'recipient', taxId: '12345678000190' }])
        .deliveryClient,
    ).toEqual({ displayName: '', taxId: '12345678000190' })
  })
})
