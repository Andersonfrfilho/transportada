/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDeliveryContact } from '../../src/trips/domain/delivery-contact.policy.js'

const DESTINATARIO = {
  legalName: 'ZARAGOZA COMERCIO LTDA',
  phone: '1633712200',
  role: 'recipient',
  taxId: '11222333000181',
  tradeName: 'Zaragoza',
}

describe('contato da entrega (spec 079 P2)', () => {
  /**
   * O nome fantasia é como o cliente é chamado no telefone; a razão social é o que está no
   * contrato. Quem atende o telefone reconhece o primeiro.
   */
  test('prefere o nome fantasia, e cai na razão social', () => {
    expect(resolveDeliveryContact({ contractors: [], parties: [DESTINATARIO] })?.name).toBe(
      'Zaragoza',
    )
    expect(
      resolveDeliveryContact({
        contractors: [],
        parties: [{ ...DESTINATARIO, tradeName: '' }],
      })?.name,
    ).toBe('ZARAGOZA COMERCIO LTDA')
  })

  /**
   * ⚠️ **O telefone sai formatado, e vazio é ausência.** A NF-e traz `<fone>` só quando o emitente
   * o preenche — imprimir string vazia como se fosse número faria alguém tentar ligar para o nada.
   */
  test('formata o telefone e trata vazio como ausência', () => {
    expect(resolveDeliveryContact({ contractors: [], parties: [DESTINATARIO] })?.phone).toBe(
      '(16) 3371-2200',
    )
    expect(
      resolveDeliveryContact({ contractors: [], parties: [{ ...DESTINATARIO, phone: '' }] })?.phone,
    ).toBeNull()
  })

  test('celular de nove dígitos também sai formatado', () => {
    expect(
      resolveDeliveryContact({
        contractors: [],
        parties: [{ ...DESTINATARIO, phone: '16991234567' }],
      })?.phone,
    ).toBe('(16) 99123-4567')
  })

  /** Número que não é telefone brasileiro sai como veio: inventar formato esconderia o defeito. */
  test('número fora do padrão sai cru', () => {
    expect(
      resolveDeliveryContact({ contractors: [], parties: [{ ...DESTINATARIO, phone: '123' }] })
        ?.phone,
    ).toBe('123')
  })

  /**
   * ⚠️ **O contratante é quem paga, e ele se reconhece pelo documento.** A nota não diz quem é o
   * contratante — quem diz é o cadastro: o participante que estiver em `contractors` é ele.
   */
  test('nomeia o contratante quando o documento está cadastrado', () => {
    const contact = resolveDeliveryContact({
      contractors: [{ displayName: 'Zaragoza Matriz', taxId: '11222333000181' }],
      parties: [DESTINATARIO],
    })

    expect(contact?.contractorName).toBe('Zaragoza Matriz')
  })

  /** Documento fora do cadastro não vira contratante — nem por parecer. */
  test('participante não cadastrado não vira contratante', () => {
    const contact = resolveDeliveryContact({
      contractors: [{ displayName: 'Outra', taxId: '99999999000191' }],
      parties: [DESTINATARIO],
    })

    expect(contact?.contractorName).toBeNull()
  })

  /** Nota sem destinatário não tem contato — ausência, nunca um objeto vazio que parece carregado. */
  test('sem destinatário não há contato', () => {
    expect(resolveDeliveryContact({ contractors: [], parties: [] })).toBeNull()
  })
})
