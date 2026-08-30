/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { toRevealedCompanyUsers } from '../../src/modules/identity/shared/companyUsersResponse.validation'

const PAYLOAD = {
  data: [
    {
      email: 'ana@empresa.test',
      name: 'Ana Fiscal',
      phone: '11999998888',
      taxId: '12345678909',
      userId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93',
    },
  ],
}

/**
 * Revelar é ação com trilha de auditoria do outro lado, então o que a tela faz com a resposta
 * importa: valor cru que chega torto não pode virar linha em branco silenciosa.
 */
describe('resposta da revelação', () => {
  test('lê o valor cru dos quatro campos', () => {
    const [user] = toRevealedCompanyUsers(PAYLOAD)

    expect(user?.email).toBe('ana@empresa.test')
    expect(user?.phone).toBe('11999998888')
    expect(user?.taxId).toBe('12345678909')
  })

  /** Campo ausente é vazio, não `undefined` renderizado como texto na célula. */
  test('campo ausente vira vazio', () => {
    const [user] = toRevealedCompanyUsers({ data: [{ userId: 'user-1' }] })

    expect(user?.email).toBe('')
    expect(user?.phone).toBe('')
    expect(user?.taxId).toBe('')
    expect(user?.userId).toBe('user-1')
  })

  test('lista vazia é resposta legítima, não falha', () => {
    expect(toRevealedCompanyUsers({ data: [] })).toEqual([])
  })

  test('corpo fora do formato é recusado', () => {
    expect(() => toRevealedCompanyUsers({ data: 'nada' })).toThrow()
    expect(() => toRevealedCompanyUsers({})).toThrow()
  })
})
