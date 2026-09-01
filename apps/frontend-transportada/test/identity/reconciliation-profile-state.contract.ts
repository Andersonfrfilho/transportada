/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { toCompanyUsersReconciliation } from '../../src/modules/identity/shared/companyUsersResponse.validation'

function payloadOf(status: string) {
  return {
    data: {
      hasMoreRealmUsers: false,
      items: [
        {
          local: { contact: 'a***@e***.test', userId: 'user-1' },
          matchedBy: 'subject',
          realm: { email: 'a***@e***.test', enabled: true, subject: 'sub-1', username: 'ana' },
          status,
        },
      ],
    },
  }
}

/**
 * O quarto estado precisa **atravessar** a validação. O desconhecido cai em `missing-locally`, e
 * cair ali é pior do que não aparecer: a tela ofereceria "criar aqui" para uma conta que já existe
 * dos dois lados, e o operador criaria uma segunda pessoa para a mesma gente.
 */
describe('o quarto estado chega à tela', () => {
  test('`profile-missing` sobrevive à leitura da resposta', () => {
    const result = toCompanyUsersReconciliation(payloadOf('profile-missing'))

    expect(result.items[0]?.status).toBe('profile-missing')
  })

  test('os três estados de existência continuam passando', () => {
    for (const status of ['linked', 'missing-in-realm', 'missing-locally'] as const) {
      expect(toCompanyUsersReconciliation(payloadOf(status)).items[0]?.status).toBe(status)
    }
  })

  /** Estado que a API ainda não fala não vira palpite otimista: o conserto é o caminho seguro. */
  test('estado desconhecido continua caindo no conserto, não em "sincronizado"', () => {
    const result = toCompanyUsersReconciliation(payloadOf('estado-do-futuro'))

    expect(result.items[0]?.status).toBe('missing-locally')
  })
})
