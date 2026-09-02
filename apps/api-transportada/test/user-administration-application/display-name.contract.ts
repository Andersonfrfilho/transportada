/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { toCompanyUserView } from '../../src/identity/domain/company-user.policy.js'

const BASE_SOURCE = {
  contactAddress: 'pessoa@empresa.test',
  contactChannel: 'email',
  email: 'pessoa@empresa.test',
  membershipId: '00000000-0000-4000-8000-000000000002',
  membershipStatus: 'active',
  pendingInvitation: undefined,
  phone: '',
  roles: ['fiscal'],
  taxId: '',
  userId: '00000000-0000-4000-8000-000000000001',
  username: 'pessoa',
} as const

function viewNameOf(name: string): string {
  return toCompanyUserView({ ...BASE_SOURCE, name }).name
}

describe('nome de usuário na grafia que se lê', () => {
  test('sobe a primeira letra de cada nome', () => {
    expect(viewNameOf('anderson fernandes')).toBe('Anderson Fernandes')
  })

  test('desce a caixa do nome gritado', () => {
    expect(viewNameOf('JOSÉ DA SILVA')).toBe('José da Silva')
  })

  test('a ligação fica minúscula em qualquer posição', () => {
    expect(viewNameOf('maria dos santos e souza')).toBe('Maria dos Santos e Souza')
  })

  test("`d'` é ligação, e o hífen cola dois nomes com maiúscula própria", () => {
    expect(viewNameOf("ana d'ávila silva-souza")).toBe("Ana d'Ávila Silva-Souza")
  })

  /** Usuário sem ficha vem com nome vazio, e a lista mostra o rótulo dela — não pode virar erro. */
  test('nome vazio continua vazio', () => {
    expect(viewNameOf('')).toBe('')
  })
})
