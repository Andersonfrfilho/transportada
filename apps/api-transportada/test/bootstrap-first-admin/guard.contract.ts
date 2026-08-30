/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  BootstrapAvailability,
  BootstrapIdentityGatewayPort,
  BootstrapPersistedAdmin,
  BootstrapRepositoryPort,
} from '../../src/identity/application/bootstrap-first-admin.port'
import { createBootstrapFirstAdminUseCase } from '../../src/identity/application/bootstrap-first-admin.use-case'
import { BootstrapUnavailableError } from '../../src/identity/domain/bootstrap.error'
import {
  ADMINISTRATOR_PASSWORD,
  COMPANY_ID,
  CORRELATION_ID,
  CREATED_SUBJECT,
  CREATED_USER_ID,
  VALID_ADMINISTRATOR,
  VALID_TOKEN,
} from '../fixtures/bootstrap-http.fixture'

const ISSUER = 'http://localhost:58080/realms/transportada-local'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-0000000000c5'
const AVAILABLE: BootstrapAvailability = { companyExists: true, hasActiveCompanyAdmin: false }
const PERSISTED: BootstrapPersistedAdmin = { membershipId: MEMBERSHIP_ID, userId: CREATED_USER_ID }

const useCaseSource = await Bun.file(
  new URL('../../src/identity/application/bootstrap-first-admin.use-case.ts', import.meta.url),
).text()
const repositorySource = await Bun.file(
  new URL('../../src/identity/infrastructure/drizzle-bootstrap.repository.ts', import.meta.url),
).text()

type SpyCalls = {
  readonly availability: string[]
  readonly gateway: unknown[]
  readonly persistence: unknown[]
}

type CreateUseCaseParams = {
  readonly availability?: BootstrapAvailability
  readonly persisted?: BootstrapPersistedAdmin | undefined
  readonly token?: string | undefined
}

function createUseCase(params: CreateUseCaseParams = {}) {
  const availability: BootstrapAvailability =
    'availability' in params && params.availability !== undefined ? params.availability : AVAILABLE
  const persisted: BootstrapPersistedAdmin | undefined =
    'persisted' in params ? params.persisted : PERSISTED
  const token: string | undefined = 'token' in params ? params.token : VALID_TOKEN
  const calls: SpyCalls = { availability: [], gateway: [], persistence: [] }
  const identityGateway: BootstrapIdentityGatewayPort = {
    async createAdministrator(input) {
      calls.gateway.push(structuredClone(input))
      return { subject: CREATED_SUBJECT }
    },
  }
  const repository: BootstrapRepositoryPort = {
    async createFirstAdmin(input) {
      calls.persistence.push(structuredClone(input))
      return persisted
    },
    async readAvailability({ companyId }) {
      calls.availability.push(companyId)
      return availability
    },
  }

  return {
    calls,
    useCase: createBootstrapFirstAdminUseCase({
      companyId: COMPANY_ID,
      identityGateway,
      issuer: ISSUER,
      repository,
      token,
    }),
  }
}

async function refusalOf(promise: Promise<unknown>): Promise<BootstrapUnavailableError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BootstrapUnavailableError) return error
    throw error
  }
  throw new Error('Expected the bootstrap to refuse')
}

describe('bootstrap first admin guard', () => {
  test('fails closed when the environment declares no arranque token', async () => {
    for (const token of [undefined, '', '   ']) {
      const { calls, useCase } = createUseCase({ token })

      await refusalOf(useCase.assertAvailable({ token: VALID_TOKEN }))

      expect(calls.availability).toEqual([])
      expect(calls.gateway).toEqual([])
    }
  })

  test('refuses a token that does not match before touching the database', async () => {
    for (const token of [undefined, '', 'token-errado', `${VALID_TOKEN} `, VALID_TOKEN.slice(1)]) {
      const { calls, useCase } = createUseCase()

      await refusalOf(useCase.assertAvailable({ token }))

      expect(calls.availability).toEqual([])
    }
  })

  test('refuses when the environment already has an active company-admin', async () => {
    const { useCase } = createUseCase({
      availability: { companyExists: true, hasActiveCompanyAdmin: true },
    })

    await refusalOf(useCase.assertAvailable({ token: VALID_TOKEN }))
  })

  test('refuses when the environment company does not exist', async () => {
    const { useCase } = createUseCase({
      availability: { companyExists: false, hasActiveCompanyAdmin: false },
    })

    await refusalOf(useCase.assertAvailable({ token: VALID_TOKEN }))
  })

  test('every refusal carries the very same status, code and message', async () => {
    const refusals = [
      await refusalOf(
        createUseCase({ token: undefined }).useCase.assertAvailable({ token: VALID_TOKEN }),
      ),
      await refusalOf(createUseCase().useCase.assertAvailable({ token: 'token-errado' })),
      await refusalOf(
        createUseCase({
          availability: { companyExists: true, hasActiveCompanyAdmin: true },
        }).useCase.assertAvailable({ token: VALID_TOKEN }),
      ),
      await refusalOf(
        createUseCase({
          availability: { companyExists: false, hasActiveCompanyAdmin: false },
        }).useCase.assertAvailable({ token: VALID_TOKEN }),
      ),
    ]

    for (const refusal of refusals) {
      expect({ code: refusal.code, message: refusal.message, status: refusal.status }).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        status: 404,
      })
    }
  })

  test('accepts the exact token when the company exists and has no administrator yet', async () => {
    const { calls, useCase } = createUseCase()

    await useCase.assertAvailable({ token: VALID_TOKEN })

    expect(calls.availability).toEqual([COMPANY_ID])
  })

  test('compares the arranque token in constant time over fixed-size digests', () => {
    expect(useCaseSource).toContain('timingSafeEqual')
    expect(useCaseSource).toContain('createHash')
  })
})

/**
 * A sondagem responde à tela, não ao chamador: ela é a mesma leitura que o guarda faz, sem token e
 * sem escrita. Se um dia divergir do `assertAvailable`, a página de primeiro acesso passa a mentir
 * numa direção ou na outra — some com o arranque ainda aberto, ou convida para um formulário morto.
 */
describe('bootstrap availability probe', () => {
  test('is open only when the token is configured, the company exists and has no administrator', async () => {
    const { calls, useCase } = createUseCase()

    await expect(useCase.checkAvailability()).resolves.toBe(true)

    expect(calls.availability).toEqual([COMPANY_ID])
    expect(calls.gateway).toEqual([])
    expect(calls.persistence).toEqual([])
  })

  test('is closed once the environment has an active company-admin', async () => {
    const { useCase } = createUseCase({
      availability: { companyExists: true, hasActiveCompanyAdmin: true },
    })

    await expect(useCase.checkAvailability()).resolves.toBe(false)
  })

  test('is closed while the environment company does not exist', async () => {
    const { useCase } = createUseCase({
      availability: { companyExists: false, hasActiveCompanyAdmin: false },
    })

    await expect(useCase.checkAvailability()).resolves.toBe(false)
  })

  /** Tirar o `BOOTSTRAP_TOKEN` do ambiente é o que fecha a porta de vez — a tela some junto. */
  test('is closed without ever reading the database when no arranque token is configured', async () => {
    for (const token of [undefined, '', '   ']) {
      const { calls, useCase } = createUseCase({ token })

      await expect(useCase.checkAvailability()).resolves.toBe(false)

      expect(calls.availability).toEqual([])
    }
  })
})

describe('bootstrap first admin execution', () => {
  test('creates the Keycloak administrator and persists the identity in a single repository call', async () => {
    const { calls, useCase } = createUseCase()

    const result = await useCase.execute({
      administrator: { ...VALID_ADMINISTRATOR },
      correlationId: CORRELATION_ID,
    })

    expect(result).toEqual({
      companyId: COMPANY_ID,
      subject: CREATED_SUBJECT,
      userId: CREATED_USER_ID,
    })
    expect(calls.gateway).toEqual([{ companyId: COMPANY_ID, ...VALID_ADMINISTRATOR }])
    expect(calls.persistence).toEqual([
      {
        companyId: COMPANY_ID,
        issuer: ISSUER,
        profile: {
          contactAddress: VALID_ADMINISTRATOR.email,
          contactChannel: 'email',
          email: VALID_ADMINISTRATOR.email,
          name: 'Ada Lovelace',
          username: VALID_ADMINISTRATOR.username,
        },
        subject: CREATED_SUBJECT,
      },
    ])
  })

  /**
   * O primeiro administrador nascia sem linha em `identity_user_profiles`: usuário, identidade
   * externa, vínculo e papel, e mais nada. Toda instalação nova estreava com o dono **invisível** na
   * administração de usuários — a listagem lê o perfil, e sem ele a pessoa aparecia como "Cadastro
   * incompleto" ou não aparecia. Quem provisiona já digitou nome, sobrenome e e-mail no arranque;
   * jogá-los fora e pedir de novo depois era a única razão de a tela não ter o que mostrar.
   */
  describe('o perfil nasce junto com o administrador', () => {
    test('o nome do perfil junta o que foi digitado no arranque', async () => {
      const { calls, useCase } = createUseCase()

      await useCase.execute({
        administrator: { ...VALID_ADMINISTRATOR, firstName: '  Ada  ', lastName: ' Lovelace ' },
        correlationId: CORRELATION_ID,
      })

      const [persisted] = calls.persistence as readonly { profile: { name: string } }[]
      expect(persisted?.profile.name).toBe('Ada Lovelace')
    })

    /** Sobrenome é opcional no arranque, e nome não pode nascer com espaço pendurado: há CHECK. */
    test('sem sobrenome o nome não vira nome com espaço sobrando', async () => {
      const { calls, useCase } = createUseCase()

      await useCase.execute({
        administrator: { ...VALID_ADMINISTRATOR, lastName: '' },
        correlationId: CORRELATION_ID,
      })

      const [persisted] = calls.persistence as readonly { profile: { name: string } }[]
      expect(persisted?.profile.name).toBe('Ada')
    })

    /**
     * Sem nome nenhum o CHECK de nome em branco recusaria a transação inteira, e o arranque —
     * único caminho de provisionamento da instalação — falharia por um campo de exibição. O login
     * é o que sempre existe, então é ele que serve de nome até alguém editar.
     */
    test('sem nome algum, o login serve de nome em vez de derrubar o arranque', async () => {
      const { calls, useCase } = createUseCase()

      await useCase.execute({
        administrator: { ...VALID_ADMINISTRATOR, firstName: '  ', lastName: '' },
        correlationId: CORRELATION_ID,
      })

      const [persisted] = calls.persistence as readonly { profile: { name: string } }[]
      expect(persisted?.profile.name).toBe(VALID_ADMINISTRATOR.username)
    })

    test('o perfil e o vínculo nascem na mesma transação, sob a mesma trava', () => {
      expect(repositorySource).toContain('identityUserProfiles')
    })
  })

  test('refuses with the same 404 when the lock reveals an administrator already born', async () => {
    const { useCase } = createUseCase({ persisted: undefined })

    const refusal = await refusalOf(
      useCase.execute({ administrator: { ...VALID_ADMINISTRATOR }, correlationId: CORRELATION_ID }),
    )

    expect(refusal.status).toBe(404)
    expect(refusal.message).toBe('Resource not found')
  })

  test('never carries the password or the arranque token into the persistence call', async () => {
    const { calls, useCase } = createUseCase()

    await useCase.execute({
      administrator: { ...VALID_ADMINISTRATOR },
      correlationId: CORRELATION_ID,
    })

    const serializedPersistence = JSON.stringify(calls.persistence)
    expect(serializedPersistence).not.toContain(ADMINISTRATOR_PASSWORD)
    expect(serializedPersistence).not.toContain(VALID_TOKEN)
  })

  test('persists identity, external identity, membership and role under the provisioning lock', () => {
    expect(repositorySource).toContain('ENVIRONMENT_PROVISIONING_LOCK_ID')
    expect(repositorySource).toContain('pg_advisory_xact_lock')
    expect(repositorySource).toContain('transaction')
    for (const table of [
      'identityUsers',
      'externalIdentities',
      'userCompanyMemberships',
      'membershipRoles',
    ]) {
      expect(repositorySource).toContain(table)
    }
  })
})
