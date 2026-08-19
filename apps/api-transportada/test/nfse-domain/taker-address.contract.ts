/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  type NfsePartyAddress,
  resolveNfseTakerAddress,
} from '../../src/nfse-invoices/domain/nfse-taker-address.policy.js'

const COMPLETE: NfsePartyAddress = {
  city: 'Ribeirão Preto',
  complement: 'Sala 12',
  district: 'Centro',
  number: '1500',
  phone: '1633334444',
  postalCode: '14010100',
  state: 'SP',
  street: 'Avenida Nove de Julho',
}

/**
 * A prefeitura recusa a nota inteira sem o endereço do tomador — `NOTA_RP_UNKNOWN — É necessário
 * informar o endereço completo do cliente`. Esta suíte é o que garante que a falta seja descoberta
 * na prévia, e não com a nota já rejeitada.
 */
describe('nfse taker address contract', () => {
  test('canonicalizes a complete address', () => {
    expect(resolveNfseTakerAddress(COMPLETE)).toEqual({
      city: 'Ribeirão Preto',
      complement: 'Sala 12',
      district: 'Centro',
      number: '1500',
      phone: '1633334444',
      postalCode: '14010100',
      state: 'SP',
      street: 'Avenida Nove de Julho',
    })
  })

  /** O CEP chega mascarado de importação antiga; a UF chega em caixa baixa de digitação manual. */
  test('strips the postal code mask and raises the state', () => {
    const resolved = resolveNfseTakerAddress({
      ...COMPLETE,
      postalCode: ' 14.010-100 ',
      state: ' sp ',
    })

    expect(resolved?.postalCode).toBe('14010100')
    expect(resolved?.state).toBe('SP')
  })

  /** Complemento e telefone são opcionais no contrato da v2: ausentes, viajam vazios. */
  test('accepts an address without complement and without phone', () => {
    expect(resolveNfseTakerAddress({ ...COMPLETE, complement: null, phone: null })).toEqual({
      city: 'Ribeirão Preto',
      complement: '',
      district: 'Centro',
      number: '1500',
      phone: '',
      postalCode: '14010100',
      state: 'SP',
      street: 'Avenida Nove de Julho',
    })
  })

  test('refuses a participant without an address row', () => {
    expect(resolveNfseTakerAddress(null)).toBeNull()
  })

  /**
   * Um campo obrigatório em branco é endereço incompleto, e endereço incompleto é a nota recusada
   * pela prefeitura. Vazio e ausente dizem a mesma coisa aqui.
   */
  test('refuses an address missing any required field', () => {
    const required = ['city', 'district', 'number', 'postalCode', 'state', 'street'] as const

    for (const field of required) {
      expect(resolveNfseTakerAddress({ ...COMPLETE, [field]: null })).toBeNull()
      expect(resolveNfseTakerAddress({ ...COMPLETE, [field]: '   ' })).toBeNull()
    }
  })

  /** CEP de oito dígitos é o que a prefeitura lê; sete dígitos é recusa com a nota já enviada. */
  test('refuses a postal code that is not eight digits', () => {
    expect(resolveNfseTakerAddress({ ...COMPLETE, postalCode: '1401010' })).toBeNull()
    expect(resolveNfseTakerAddress({ ...COMPLETE, postalCode: '140101000' })).toBeNull()
  })

  /** UF é sigla de duas letras: `Sao Paulo` no campo errado vira recusa do outro lado. */
  test('refuses a state that is not a two-letter code', () => {
    expect(resolveNfseTakerAddress({ ...COMPLETE, state: 'São Paulo' })).toBeNull()
  })
})
