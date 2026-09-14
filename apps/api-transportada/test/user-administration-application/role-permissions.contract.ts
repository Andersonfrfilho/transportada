/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLES } from '../../src/database/identity.schema.js'
import { createListRolePermissionsUseCase } from '../../src/identity/application/list-role-permissions.use-case.js'
import {
  COMPANY_ROLE_PERMISSIONS,
  SERVICE_ONLY_PERMISSIONS,
  TRANSPORTADA_PERMISSIONS,
} from '../../src/identity/domain/authorization.policy.js'
import {
  grantDirectPermissionsSchema,
  parseGrantDirectPermissionsRequest,
  parseSaveCompanyGroupRequest,
  saveCompanyGroupSchema,
} from '../../src/identity/presentation/user-administration.schema.js'
import { ApiError } from '../../src/shared/api.error.js'

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

  /**
   * O catálogo é o que a tela oferece para conceder. Permissão de serviço fica fora pelo mesmo
   * critério de `isGrantablePermission` — e só ela: toda outra que um papel concede continua ali.
   */
  test('o catálogo publicado cobre toda permissão concedível que algum papel concede', () => {
    const granted = new Set(matrix.roles.flatMap((entry) => entry.permissions))
    for (const permission of granted) {
      if (isServiceOnly(permission)) continue
      expect(matrix.permissions).toContain(permission)
    }
  })

  test('não oferece permissão de serviço, e o papel automation segue mostrando as duas', () => {
    for (const permission of SERVICE_ONLY_PERMISSIONS) {
      expect(matrix.permissions).not.toContain(permission)
    }
    expect(matrix.roles.find((entry) => entry.role === 'automation')?.permissions).toEqual([
      ...SERVICE_ONLY_PERMISSIONS,
    ])
  })
})

/**
 * Spec 144 T014b (M1): o grupo e a concessão avulsa recusam permissão de serviço com 400, e dizem
 * **todas** as recusadas de uma vez, cada uma no índice dela.
 */
describe('concessão de permissão de serviço', () => {
  async function parseRejection(
    parse: (request: Request) => Promise<unknown>,
    body: unknown,
  ): Promise<ApiError> {
    const request = new Request('http://localhost/x', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    try {
      await parse(request)
    } catch (error) {
      if (error instanceof ApiError) return error
      throw error
    }
    throw new Error('esperava recusa')
  }

  test('o grupo recusa as duas, todas de uma vez', async () => {
    const error = await parseRejection(parseSaveCompanyGroupRequest, {
      name: 'Faturamento',
      permissions: ['billing.read', 'whatsapp.settle', 'mdfe.auto-issue'],
      roles: [],
    })

    expect([error.status, error.code]).toEqual([400, 'INVALID_REQUEST'])
    expect(error.details?.map((detail) => detail.field)).toEqual(['permissions.1', 'permissions.2'])
  })

  test('a concessão avulsa recusa as duas', async () => {
    for (const permission of SERVICE_ONLY_PERMISSIONS) {
      const error = await parseRejection(parseGrantDirectPermissionsRequest, {
        permissions: [permission],
      })
      expect([error.status, error.code]).toEqual([400, 'INVALID_REQUEST'])
    }
  })

  test('permissão de pessoa continua concedível pelos dois caminhos', () => {
    expect(
      saveCompanyGroupSchema.safeParse({ name: 'x', permissions: ['billing.create'], roles: [] })
        .success,
    ).toBe(true)
    expect(
      grantDirectPermissionsSchema.safeParse({ permissions: ['billing.create'] }).success,
    ).toBe(true)
  })
})

function isServiceOnly(permission: string): boolean {
  return SERVICE_ONLY_PERMISSIONS.some((entry) => entry === permission)
}
