/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADOPT_SKIP_REASON,
  createAdoptRealmFieldsUseCase,
} from '../../src/identity/application/adopt-realm-fields.use-case.js'
import {
  diffRealmOwnedFields,
  type LocalIdentityRecord,
  type RealmIdentityRecord,
} from '../../src/identity/domain/user-reconciliation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'

const LOCAL: LocalIdentityRecord = {
  contactAddress: 'antigo@empresa.test',
  contactChannel: 'email',
  email: 'antigo@empresa.test',
  hasProfile: true,
  membershipId: 'membership',
  name: 'Maria',
  subject: SUBJECT,
  taxId: '',
  userId: USER_ID,
  username: 'maria',
}

const REALM: RealmIdentityRecord = {
  email: 'novo@empresa.test',
  enabled: true,
  subject: SUBJECT,
  taxId: '',
  username: 'maria.silva',
}

function createFakes(
  overrides: {
    readonly local?: Partial<LocalIdentityRecord>
    readonly realm?: Partial<RealmIdentityRecord>
    /** `exactOptionalPropertyTypes` não deixa passar `subject: undefined` num `Partial`. */
    readonly withoutSubject?: boolean
  } = {},
) {
  const updates: Record<string, unknown>[] = []

  return {
    audit: { async record() {} },
    gateway: {
      async listUsers() {
        return { hasMore: false, users: [{ ...REALM, ...overrides.realm }] }
      },
    },
    repository: {
      async listForReconciliation() {
        const { subject, ...rest } = { ...LOCAL, ...overrides.local }
        if (overrides.withoutSubject === true) return [rest]
        return [{ ...rest, ...(subject === undefined ? {} : { subject }) }]
      },
      async updateProfile(input: Record<string, unknown>) {
        updates.push(input)
      },
    },
    updates,
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createAdoptRealmFieldsUseCase(
    fakes as unknown as Parameters<typeof createAdoptRealmFieldsUseCase>[0],
  )
}

const INPUT = {
  context: { companyId: COMPANY_ID, userId: 'ator' },
  correlationId: 'correlacao',
  userIds: [USER_ID],
} as const

/**
 * O caminho de volta que não existia: o painel escrevia no provedor a cada edição, e quem alterasse
 * o login ou o e-mail no console do Keycloak deixava os dois lados discordando — com a comparação
 * ainda dizendo "Sincronizado", porque ela só perguntava se a pessoa existe nos dois lados.
 */
describe('trazer do provedor os campos que ele manda', () => {
  test('login e e-mail divergentes são gravados aqui', async () => {
    const fakes = createFakes()

    const result = await createUseCase(fakes).execute(INPUT)

    expect(result.adopted[0]?.fields).toEqual(['username', 'email'])
    expect(fakes.updates[0]).toMatchObject({
      email: 'novo@empresa.test',
      userId: USER_ID,
      username: 'maria.silva',
    })
  })

  /** O contato é o que a listagem mostra e o que a tela de login usa para achar o login da pessoa. */
  test('com canal de e-mail, o contato acompanha o endereço novo', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute(INPUT)

    expect(fakes.updates[0]).toMatchObject({ contactAddress: 'novo@empresa.test' })
  })

  test('com canal de telefone, o contato não é tocado', async () => {
    const fakes = createFakes({ local: { contactChannel: 'phone', contactAddress: '11999998888' } })

    await createUseCase(fakes).execute(INPUT)

    expect(fakes.updates[0]).not.toHaveProperty('contactAddress')
  })

  /** O nome é editado aqui, e a conta criada pela sincronização nasce com o login no lugar dele. */
  test('o nome nunca é sobrescrito pelo provedor', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute(INPUT)

    expect(fakes.updates[0]).not.toHaveProperty('name')
  })

  test('sem diferença, nada é escrito', async () => {
    const fakes = createFakes({ realm: { email: LOCAL.email, username: LOCAL.username } })

    const result = await createUseCase(fakes).execute(INPUT)

    expect(fakes.updates).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe(ADOPT_SKIP_REASON.ALREADY_EQUAL)
  })

  /** Casar por e-mail é palpite: trazer campo de conta que ninguém confirmou é escrever dado alheio. */
  test('sem `subject` gravado, o alvo é pulado', async () => {
    const fakes = createFakes({ withoutSubject: true })

    const result = await createUseCase(fakes).execute(INPUT)

    expect(fakes.updates).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe(ADOPT_SKIP_REASON.NOT_FOUND)
  })
})

/**
 * A comparação de campo é o que faltava para a tela parar de dizer "Sincronizado" para conta que
 * divergiu: existência e igualdade são perguntas diferentes.
 */
describe('a diferença campo a campo', () => {
  test('campo vazio no provedor não é divergência', () => {
    const differences = diffRealmOwnedFields({
      local: LOCAL,
      realm: { ...REALM, email: '', taxId: '', username: '' },
    })

    expect(differences).toEqual([])
  })

  /** Ter dois endereços não é divergir: basta que o do provedor seja um deles. */
  test('o e-mail do provedor casa com qualquer endereço nosso', () => {
    const differences = diffRealmOwnedFields({
      local: { ...LOCAL, contactAddress: 'novo@empresa.test', email: 'outro@empresa.test' },
      realm: { ...REALM, username: LOCAL.username },
    })

    expect(differences).toEqual([])
  })

  test('documento diferente entra na lista', () => {
    const differences = diffRealmOwnedFields({
      local: { ...LOCAL, username: REALM.username, contactAddress: REALM.email },
      realm: { ...REALM, taxId: '12345678909' },
    })

    expect(differences).toEqual(['taxId'])
  })
})
