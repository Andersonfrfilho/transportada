/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { isAuthMeResponse } from '../../src/modules/identity/queries/useAuthMe.query'
import { PERMISSION_GROUPS } from '../../src/modules/identity/shared/permissionGroups.constant'

const HOLIDAY_IMPORT_PERMISSION = 'holiday-import.configure'

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
 * O painel recusa o `/auth/me` inteiro diante de permissão desconhecida: a API que passar a servir
 * esta permissão antes do painel derrubaria a tela de todo `company-admin`.
 */
describe('permissão de configurar a importação de feriados', () => {
  test('o /auth/me que a carrega é aceito pela guarda', () => {
    expect(isAuthMeResponse(authMeBody(['settings.manage', HOLIDAY_IMPORT_PERMISSION]))).toBe(true)
  })

  test('uma permissão que ninguém conhece continua recusada', () => {
    expect(isAuthMeResponse(authMeBody(['holiday-import.unknown']))).toBe(false)
  })

  test('a matriz a oferece no grupo de Configurações', () => {
    const settingsGroup = PERMISSION_GROUPS.find((group) => group.key === 'settings')

    expect<readonly string[] | undefined>(settingsGroup?.permissions).toContain(
      HOLIDAY_IMPORT_PERMISSION,
    )
  })
})
