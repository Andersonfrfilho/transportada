/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286: os dados da transportadora no modelo do boleto ao cliente saem formatados como o cliente lê — CNPJ com
 * pontuação, telefone com DDD, endereço numa linha sem os pedaços vazios — e texto fora do formato volta como veio.
 */
import { describe, expect, test } from 'bun:test'

import {
  CONTRACTOR_REPLY_CLIENT_TEMPLATE_VARIABLES,
  formatCarrierAddress,
  formatCarrierCnpj,
  formatCarrierPhone,
} from '../../src/occurrence-conversation/infrastructure/contractor-reply-client-template.support.js'

const ADDRESS = {
  city: 'Ribeirão Preto',
  complement: 'sala 2',
  district: 'Centro',
  number: '100',
  postalCode: '14010000',
  state: 'SP',
  street: 'Rua da Empresa',
}

describe('dados da transportadora no boleto ao cliente (spec 286)', () => {
  test('o modelo oferece os dados da transportadora', () => {
    expect(CONTRACTOR_REPLY_CLIENT_TEMPLATE_VARIABLES).toEqual(
      expect.arrayContaining([
        'cidadeTransportadora',
        'cnpjTransportadora',
        'emailTransportadora',
        'enderecoTransportadora',
        'razaoSocialTransportadora',
        'telefoneTransportadora',
      ]),
    )
  })

  test('CNPJ numérico e alfanumérico com pontuação; fora do formato, como veio', () => {
    expect(formatCarrierCnpj('12345678000195')).toBe('12.345.678/0001-95')
    expect(formatCarrierCnpj('12.345.678/0001-95')).toBe('12.345.678/0001-95')
    expect(formatCarrierCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35')
    expect(formatCarrierCnpj(' 1234 ')).toBe('1234')
    expect(formatCarrierCnpj('')).toBe('')
  })

  test('telefone fixo e celular com DDD, com ou sem o 55; fora do formato, como veio', () => {
    expect(formatCarrierPhone('1633334444')).toBe('(16) 3333-4444')
    expect(formatCarrierPhone('16999998888')).toBe('(16) 99999-8888')
    expect(formatCarrierPhone('+55 16 99999-8888')).toBe('(16) 99999-8888')
    expect(formatCarrierPhone('0800 123')).toBe('0800 123')
    expect(formatCarrierPhone('')).toBe('')
  })

  test('endereço numa linha, pulando o que está vazio', () => {
    expect(formatCarrierAddress(ADDRESS)).toBe(
      'Rua da Empresa, 100, sala 2 – Centro, Ribeirão Preto/SP – CEP 14010-000',
    )
    expect(formatCarrierAddress({ ...ADDRESS, complement: '', district: '', postalCode: '' })).toBe(
      'Rua da Empresa, 100 – Ribeirão Preto/SP',
    )
    expect(
      formatCarrierAddress({
        city: '',
        complement: '',
        district: '',
        number: '',
        postalCode: '',
        state: '',
        street: '',
      }),
    ).toBe('')
  })
})
