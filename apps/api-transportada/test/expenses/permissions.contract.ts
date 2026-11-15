/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF7, CA03 (padrão adotado, dúvida 4): `expenses.read`/`expenses.manage` existem, são
 * concedíveis e vão só ao administrador da empresa.
 */
import { describe, expect, it } from 'bun:test'

import {
  COMPANY_ROLE_PERMISSIONS,
  isGrantablePermission,
  TRANSPORTADA_PERMISSIONS,
} from '../../src/identity/domain/authorization.policy.js'

describe('permissões do módulo Contas (spec 325 RF7)', () => {
  it('declara expenses.read e expenses.manage', () => {
    const declared = TRANSPORTADA_PERMISSIONS as readonly string[]
    expect(declared).toContain('expenses.read')
    expect(declared).toContain('expenses.manage')
    expect(isGrantablePermission('expenses.read')).toBe(true)
    expect(isGrantablePermission('expenses.manage')).toBe(true)
  })

  it('só o company-admin recebe as duas', () => {
    const holders = Object.entries(COMPANY_ROLE_PERMISSIONS)
      .filter(([, permissions]) => (permissions as readonly string[]).includes('expenses.read'))
      .map(([role]) => role)
    const managers = Object.entries(COMPANY_ROLE_PERMISSIONS)
      .filter(([, permissions]) => (permissions as readonly string[]).includes('expenses.manage'))
      .map(([role]) => role)

    expect(holders).toEqual(['company-admin'])
    expect(managers).toEqual(['company-admin'])
  })
})
