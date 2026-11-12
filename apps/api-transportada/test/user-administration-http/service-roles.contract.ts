/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { SERVICE_COMPANY_ROLES } from '../../src/database/identity.schema'
import { createReplaceCompanyUserRolesUseCase } from '../../src/identity/application/replace-company-user-roles.use-case'
import { saveCompanyGroupSchema } from '../../src/identity/presentation/user-administration.schema'
import {
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  INVITE_BODY,
  jsonRequest,
  responseApiError,
  TARGET_USER_ID,
} from '../fixtures/user-administration-http.fixture'

const COMPANY_ID = '00000000-0000-4000-8000-000000000931'

/**
 * ADR-0047, emenda 2026-11-05: papel de serviço não se dá a gente. Antes, trocar papéis gravava o
 * papel do worker numa pessoa (e com ele a emissão de MDF-e), e o convite estourava 500 no CHECK.
 */
describe('papel de serviço não se dá a gente', () => {
  for (const role of SERVICE_COMPANY_ROLES) {
    test(`convite, troca e atribuição em lote recusam ${role} com 400 INVALID_REQUEST`, async () => {
      const fixture = await createUserAdministrationHttpFixture()
      const requests = [
        jsonRequest({
          body: { ...INVITE_BODY, roles: [role] },
          method: 'POST',
          path: COMPANY_USERS_PATH,
        }),
        jsonRequest({
          body: { roles: ['viewer', role] },
          method: 'PUT',
          path: `${COMPANY_USERS_PATH}/${TARGET_USER_ID}/roles`,
        }),
        jsonRequest({
          body: { roles: [role], userIds: [TARGET_USER_ID] },
          method: 'POST',
          path: `${COMPANY_USERS_PATH}/roles`,
        }),
      ]

      for (const request of requests) {
        const response = await fixture.handle(request)
        expect(response.status).toBe(400)
        expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
      }
      expect(fixture.inviteCalls).toEqual([])
      expect(fixture.replaceRolesCalls).toEqual([])
      expect(fixture.assignRolesCalls).toEqual([])
    })

    test(`grupo não carrega ${role}`, () => {
      const result = saveCompanyGroupSchema.safeParse({
        name: 'Robôs',
        permissions: [],
        roles: [role],
      })

      expect(result.success).toBe(false)
    })
  }

  test('papel de gente continua aceito no grupo', () => {
    expect(
      saveCompanyGroupSchema.safeParse({ name: 'Fiscal', permissions: [], roles: ['fiscal'] })
        .success,
    ).toBe(true)
  })
})

describe('a membership sintética do serviço não ganha papel de gente', () => {
  function createUseCase(roles: readonly string[]) {
    const replaced: unknown[] = []
    const useCase = createReplaceCompanyUserRolesUseCase({
      repository: {
        async findByUserId() {
          return {
            contactAddress: 'pessoa@example.test',
            contactChannel: 'email',
            email: 'pessoa@example.test',
            hasPicture: false,
            membershipId: '00000000-0000-4000-8000-000000000933',
            membershipStatus: 'active',
            name: 'Pessoa',
            pendingInvitation: undefined,
            phone: '',
            roles,
            taxId: '',
            userId: TARGET_USER_ID,
            username: 'pessoa',
          } as never
        },
        async listAdministratorUserIds() {
          return ['00000000-0000-4000-8000-000000000932']
        },
        async replaceRoles(input) {
          replaced.push(input)
        },
      },
    })
    return { replaced, useCase }
  }

  for (const role of SERVICE_COMPANY_ROLES) {
    test(`trocar os papéis de quem tem ${role} é 409 COMPANY_USER_IS_SERVICE_ACCOUNT`, async () => {
      const { replaced, useCase } = createUseCase([role])

      const error = await useCase
        .execute({ context: { companyId: COMPANY_ID }, roles: ['company-admin'], userId: 'x' })
        .catch((caught: unknown) => caught)

      expect(error).toMatchObject({ code: 'COMPANY_USER_IS_SERVICE_ACCOUNT', status: 409 })
      expect(replaced).toEqual([])
    })
  }

  test('trocar os papéis de uma pessoa segue funcionando', async () => {
    const { replaced, useCase } = createUseCase(['viewer'])

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      roles: ['fiscal'],
      userId: TARGET_USER_ID,
    })

    expect(replaced).toHaveLength(1)
  })
})
