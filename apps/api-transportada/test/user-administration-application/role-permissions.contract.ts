/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLES } from '../../src/database/identity.schema.js'
import { createListRolePermissionsUseCase } from '../../src/identity/application/list-role-permissions.use-case.js'
import {
  COMPANY_ROLE_PERMISSIONS,
  TRANSPORTADA_PERMISSIONS,
} from '../../src/identity/domain/authorization.policy.js'

/**
 * A matriz servida é a mesma que o `authorize` consulta. Se um dia ela for copiada para a tela, a
 * primeira permissão nova as separa — e a tela passa a prometer acesso que a API recusa.
 */
describe('matriz de papel e permissão', () => {
  const matrix = createListRolePermissionsUseCase().execute()

  test('publica todos os papéis do catálogo, na ordem dele', () => {
    expect(matrix.roles.map((entry) => entry.role)).toEqual([...COMPANY_ROLES])
  })

  test('cada papel leva exatamente o que a política concede', () => {
    for (const entry of matrix.roles) {
      expect(entry.permissions).toEqual([...(COMPANY_ROLE_PERMISSIONS[entry.role] ?? [])])
    }
  })

  /**
   * `companies.manage` é reservada e sem consumidor (ADR-0021): listá-la prometeria um poder que
   * nenhum papel desta instalação tem.
   */
  test('não oferece a permissão de plataforma', () => {
    expect(TRANSPORTADA_PERMISSIONS).toContain('companies.manage')
    expect(matrix.permissions).not.toContain('companies.manage')
  })

  test('o catálogo publicado cobre toda permissão que algum papel concede', () => {
    const granted = new Set(matrix.roles.flatMap((entry) => entry.permissions))
    for (const permission of granted) {
      expect(matrix.permissions).toContain(permission)
    }
  })
})
