/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { isAuthMeResponse } from '../../src/modules/identity/queries/useAuthMe.query'
import { PERMISSION_GROUPS } from '../../src/modules/identity/shared/permissionGroups.constant'

const EXPENSES_PERMISSIONS = ['expenses.read', 'expenses.manage'] as const

function authMeBody(permissions: readonly string[]): unknown {
  return {
    data: {
      company: { id: 'company' },
      identity: { userId: '00000000-0000-4000-8000-000000000003' },
      permissions,
      roles: ['company-admin'],
    },
  }
}

/**
 * Spec 325 RF7. O painel recusa o `/auth/me` inteiro diante de permissão desconhecida: a API que passar a servir as
 * permissões de Contas antes do painel derrubaria a tela de todo `company-admin`.
 */
describe('permissões do módulo Contas (spec 325)', () => {
  test('o /auth/me que as carrega é aceito pela guarda', () => {
    expect(isAuthMeResponse(authMeBody(['settings.manage', ...EXPENSES_PERMISSIONS]))).toBe(true)
  })

  test('a matriz as oferece no grupo próprio de Contas', () => {
    const group = PERMISSION_GROUPS.find((entry) => entry.key === 'expenses')

    expect<readonly string[] | undefined>(group?.permissions).toEqual([...EXPENSES_PERMISSIONS])
  })
})
