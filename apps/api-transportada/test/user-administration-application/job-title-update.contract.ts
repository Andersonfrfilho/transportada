/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CompanyUserNotFoundError } from '../../src/identity/domain/company-user.error.js'
import { toCompanyUserView } from '../../src/identity/domain/company-user.policy.js'
import { createUpdateCompanyUserProfileUseCase } from '../../src/identity/application/update-company-user-profile.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'

const BASE = {
  contactAddress: 'pessoa@empresa.test',
  contactChannel: 'email',
  email: 'pessoa@empresa.test',
  hasPicture: false,
  membershipId: '00000000-0000-4000-8000-0000000000bb',
  membershipStatus: 'active',
  name: 'Maria',
  pendingInvitation: undefined,
  phone: '',
  roles: ['operator'],
  taxId: '',
  userId: USER_ID,
  username: 'maria',
} as const

const EXISTING = { ...BASE, jobTitle: 'Analista' } as const

type Call = Record<string, unknown>

function createFakes(options: { readonly found?: boolean } = {}) {
  const gatewayCalls: string[] = []
  const profileUpdates: Call[] = []
  const jobTitleUpdates: Call[] = []
  const findCalls: Call[] = []

  return {
    gatewayCalls,
    jobTitleUpdates,
    profileUpdates,
    findCalls,
    gateway: {
      async updateAttributes() {
        gatewayCalls.push('updateAttributes')
      },
      async updateUser() {
        gatewayCalls.push('updateUser')
      },
    },
    pictures: { find: () => Promise.resolve(null) },
    repository: {
      async findByUserId(input: Call) {
        findCalls.push(input)
        return options.found === false ? undefined : EXISTING
      },
      async findIdentitySubject() {
        gatewayCalls.push('findIdentitySubject')
        return SUBJECT
      },
      async updateJobTitle(input: Call) {
        jobTitleUpdates.push(input)
      },
      async updateProfile(input: Call) {
        profileUpdates.push(input)
      },
    },
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createUpdateCompanyUserProfileUseCase({
    identityGateway: fakes.gateway,
    pictures: fakes.pictures,
    publicBaseUrl: 'https://api.test',
    repository: fakes.repository,
  } as unknown as Parameters<typeof createUpdateCompanyUserProfileUseCase>[0])
}

describe('edição de usuário — cargo', () => {
  test('só o cargo grava por (empresa do contexto, usuário) e não toca o Keycloak nem o perfil', async () => {
    const fakes = createFakes()

    const view = await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      jobTitle: 'Gerente Comercial',
      userId: USER_ID,
    })

    expect(fakes.jobTitleUpdates).toEqual([
      { companyId: COMPANY_ID, jobTitle: 'Gerente Comercial', userId: USER_ID },
    ])
    expect(fakes.gatewayCalls).toEqual([])
    expect(fakes.profileUpdates).toEqual([])
    expect(view.jobTitle).toBe('Gerente Comercial')
  })

  test('null limpa o cargo e a resposta traz null', async () => {
    const fakes = createFakes()

    const view = await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      jobTitle: null,
      userId: USER_ID,
    })

    expect(fakes.jobTitleUpdates).toEqual([
      { companyId: COMPANY_ID, jobTitle: null, userId: USER_ID },
    ])
    expect(view.jobTitle).toBeNull()
  })

  test('cargo ausente não chama updateJobTitle e a resposta mantém o cargo gravado', async () => {
    const fakes = createFakes()

    const view = await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      phone: '11999998888',
      userId: USER_ID,
    })

    expect(fakes.jobTitleUpdates).toEqual([])
    expect(view.jobTitle).toBe('Analista')
  })

  test('cargo junto com outro campo grava os dois e o Keycloak segue o fluxo do perfil', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      jobTitle: 'Gerente',
      phone: '11999998888',
      userId: USER_ID,
    })

    expect(fakes.jobTitleUpdates).toHaveLength(1)
    expect(fakes.profileUpdates[0]).toMatchObject({ phone: '11999998888' })
    expect(fakes.profileUpdates[0]).not.toHaveProperty('jobTitle')
    expect(fakes.gatewayCalls).toContain('updateAttributes')
  })

  test('falha do Keycloak (usuário ou atributos): o cargo não é gravado (revisão A8)', async () => {
    for (const failing of ['updateUser', 'updateAttributes'] as const) {
      const fakes = createFakes()
      fakes.gateway[failing] = async () => {
        throw new Error('keycloak fora')
      }

      await expect(
        createUseCase(fakes).execute({
          context: { companyId: COMPANY_ID },
          jobTitle: 'Gerente',
          phone: '11999998888',
          userId: USER_ID,
        }),
      ).rejects.toThrow('keycloak fora')

      expect(fakes.jobTitleUpdates).toEqual([])
    }
  })

  test('usuário de outra empresa: 404 de domínio e nada é gravado', async () => {
    const fakes = createFakes({ found: false })

    await expect(
      createUseCase(fakes).execute({
        context: { companyId: COMPANY_ID },
        jobTitle: 'Gerente',
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(CompanyUserNotFoundError)

    expect(fakes.findCalls).toEqual([{ companyId: COMPANY_ID, userId: USER_ID }])
    expect(fakes.jobTitleUpdates).toEqual([])
  })

  test('a view carrega o cargo, e null quando a origem não tem', () => {
    expect(toCompanyUserView({ ...EXISTING, jobTitle: 'Coordenação' }).jobTitle).toBe('Coordenação')
    expect(toCompanyUserView({ ...EXISTING, jobTitle: null }).jobTitle).toBeNull()
    expect(toCompanyUserView(BASE).jobTitle).toBeNull()
  })
})
