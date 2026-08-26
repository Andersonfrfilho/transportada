/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { formatPhone, isCompletePhone, stripPhone } from '../../src/modules/shared/phone.service'
import { formatCpf, normalizeTaxId } from '../../src/modules/shared/taxId.service'
import { toInvitedCompanyUser } from '../../src/modules/identity/shared/companyUsersResponse.validation'

const COMPANY_USER_PAYLOAD = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  email: 'a***@example.test',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93',
  membershipId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94',
  name: 'Ana Fiscal',
  phone: '***88',
  roles: ['driver'],
  status: 'invited',
  taxId: '***09',
  username: 'ana.fiscal',
} as const

/**
 * O corpo da requisição leva dígito puro. A máscara é da tela, e mandá-la ao servidor faria a
 * mesma pessoa entrar duas vezes — uma com pontuação, outra sem.
 */
describe('campos de contato do convite — máscara na tela, dígito na API', () => {
  test('o CPF sai da máscara com onze dígitos e nada mais', () => {
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
    expect(normalizeTaxId('123.456.789-09')).toBe('12345678909')
  })

  test('o telefone celular quebra em 5-4 e o fixo em 4-4', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
    expect(stripPhone('(11) 98765-4321')).toBe('11987654321')
  })

  test('telefone pela metade não passa por completo', () => {
    expect(isCompletePhone('(11) 9876')).toBe(false)
    expect(isCompletePhone('(11) 98765-4321')).toBe(true)
    expect(isCompletePhone('(11) 3333-4444')).toBe(true)
  })
})

describe('resposta do convite — o vínculo com a frota', () => {
  test('lê o vínculo declarado pela API', () => {
    const invited = toInvitedCompanyUser({ ...COMPANY_USER_PAYLOAD, fleetLink: 'linked' })
    expect(invited.fleetLink).toBe('linked')
    expect(invited.taxId).toBe('***09')
  })

  test('a ausência de ficha atravessa como aviso, não como falha', () => {
    const invited = toInvitedCompanyUser({
      ...COMPANY_USER_PAYLOAD,
      fleetLink: 'no-driver-record',
    })
    expect(invited.fleetLink).toBe('no-driver-record')
  })

  /**
   * O convite já foi criado quando esta resposta chega: recusá-la por um valor que a tela não
   * conhece faria o operador achar que nada aconteceu, e convidar de novo.
   */
  test('valor desconhecido não derruba a tela', () => {
    const invited = toInvitedCompanyUser({ ...COMPANY_USER_PAYLOAD, fleetLink: 'coisa-nova' })
    expect(invited.fleetLink).toBe('not-applicable')
  })

  test('resposta sem o campo continua legível', () => {
    const invited = toInvitedCompanyUser(COMPANY_USER_PAYLOAD)
    expect(invited.fleetLink).toBe('not-applicable')
  })
})
