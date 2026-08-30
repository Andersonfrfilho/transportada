/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O quarto estado. Os três primeiros vêm do pacote de vínculo e falam de **existência**: existe nos
 * dois lados, só aqui, só lá. Este fala de **completude**, e é por isso que ele mora aqui e não no
 * pacote: `identity_user_profiles` é tabela deste produto, e um produto que federe login sem ter
 * perfil próprio não tem o que reconciliar.
 *
 * O estado existe porque "Sincronizado" era mentira por omissão: a conta existia dos dois lados, e a
 * pessoa aparecia como "Cadastro incompleto" na listagem sem nada na tela dizendo o que fazer.
 */
import { describe, expect, test } from 'bun:test'

import { createFillProfilesFromRealmUseCase } from '../../src/identity/application/fill-profiles-from-realm.use-case.js'
import {
  createReconcileCompanyUsersUseCase,
  RECONCILIATION_VIEW_STATUS,
} from '../../src/identity/application/reconcile-company-users.use-case.js'
import type { LocalIdentityRecord } from '../../src/identity/domain/user-reconciliation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const ACTOR_ID = '00000000-0000-4000-8000-0000000000a2'
const USER_ID = '00000000-0000-4000-8000-0000000000a3'
const SUBJECT = '00000000-0000-4000-8000-0000000000a4'
const ISSUER = 'https://keycloak.test/realms/transportada'

function localOf(overrides: Partial<LocalIdentityRecord> = {}): LocalIdentityRecord {
  return {
    contactAddress: 'ana@transportada.test',
    contactChannel: 'email',
    email: '',
    hasProfile: true,
    membershipId: 'membership-1',
    name: 'Ana Fiscal',
    subject: SUBJECT,
    taxId: '',
    userId: USER_ID,
    ...overrides,
  }
}

const REALM_ACCOUNT = {
  email: 'ana@transportada.test',
  enabled: true,
  subject: SUBJECT,
  taxId: '12345678909',
  username: 'ana.fiscal',
} as const

function createReconcile(local: readonly LocalIdentityRecord[]) {
  return createReconcileCompanyUsersUseCase({
    gateway: {
      async listUsers() {
        return { hasMore: false, users: [REALM_ACCOUNT] }
      },
    },
    repository: {
      async listForReconciliation() {
        return local
      },
    },
  })
}

describe('o quarto estado: existe dos dois lados, sem perfil', () => {
  test('conta com perfil continua sendo apenas vinculada', async () => {
    const result = await createReconcile([localOf()]).execute({
      context: { companyId: COMPANY_ID },
      limit: 50,
    })

    expect(result.items[0]?.status).toBe(RECONCILIATION_VIEW_STATUS.LINKED)
  })

  test('conta sem perfil deixa de se dizer sincronizada', async () => {
    const result = await createReconcile([localOf({ hasProfile: false })]).execute({
      context: { companyId: COMPANY_ID },
      limit: 50,
    })

    expect(result.items[0]?.status).toBe(RECONCILIATION_VIEW_STATUS.PROFILE_MISSING)
  })

  /**
   * Casar por e-mail é palpite do algoritmo, não vínculo escrito. O conserto ali é ligar as duas
   * contas — preencher a ficha a partir de um casamento que ninguém confirmou seria escrever o nome
   * de uma pessoa com base num palpite.
   */
  test('casamento por e-mail, sem subject gravado, não oferece preenchimento', async () => {
    const withoutSubject: LocalIdentityRecord = {
      contactAddress: 'ana@transportada.test',
      contactChannel: 'email',
      email: '',
      hasProfile: false,
      membershipId: 'membership-1',
      name: '',
      taxId: '',
      userId: USER_ID,
    }
    const result = await createReconcile([withoutSubject]).execute({
      context: { companyId: COMPANY_ID },
      limit: 50,
    })

    expect(result.items[0]?.status).toBe(RECONCILIATION_VIEW_STATUS.LINKED)
  })
})

type Recorded = {
  readonly audits: unknown[]
  readonly written: unknown[]
}

function createFill(params: { readonly local: readonly LocalIdentityRecord[] }) {
  const recorded: Recorded = { audits: [], written: [] }

  const useCase = createFillProfilesFromRealmUseCase({
    audit: {
      async record(entry) {
        recorded.audits.push(entry)
      },
    },
    gateway: {
      async listUsers() {
        return { hasMore: false, users: [REALM_ACCOUNT] }
      },
    },
    issuer: ISSUER,
    repository: {
      async createProfileForExistingUser(input) {
        recorded.written.push(input)
        return { created: true }
      },
      async listForReconciliation() {
        return params.local
      },
    },
  })

  return { recorded, useCase }
}

describe('o botão preenche o perfil pelo provedor', () => {
  test('copia login e e-mail da conta do realm', async () => {
    const { recorded, useCase } = createFill({ local: [localOf({ hasProfile: false })] })

    const result = await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [USER_ID],
    })

    expect(result.filled).toEqual([USER_ID])
    expect(recorded.written).toEqual([
      {
        contactAddress: REALM_ACCOUNT.email,
        contactChannel: 'email',
        email: REALM_ACCOUNT.email,
        name: REALM_ACCOUNT.username,
        taxId: REALM_ACCOUNT.taxId,
        userId: USER_ID,
        username: REALM_ACCOUNT.username,
      },
    ])
  })

  /**
   * O CHECK de contato em branco recusaria a linha, e a transação levaria junto o conserto das
   * outras contas do lote. Conta do provedor sem e-mail é caso real — a que nasce pelo botão de
   * sincronizar nasce assim.
   */
  test('conta do provedor sem e-mail é recusada em vez de derrubar o lote', async () => {
    const recorded: unknown[] = []
    const useCase = createFillProfilesFromRealmUseCase({
      audit: { async record() {} },
      gateway: {
        async listUsers() {
          return { hasMore: false, users: [{ ...REALM_ACCOUNT, email: '' }] }
        },
      },
      issuer: ISSUER,
      repository: {
        async createProfileForExistingUser(input) {
          recorded.push(input)
          return { created: true }
        },
        async listForReconciliation() {
          return [localOf({ hasProfile: false })]
        },
      },
    })

    const result = await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [USER_ID],
    })

    expect(recorded).toEqual([])
    expect(result.skipped).toEqual([{ reason: 'realm-contact-missing', userId: USER_ID }])
  })

  /** Perfil que já existe é trabalho humano: sobrescrevê-lo apagaria nome editado à mão. */
  test('quem já tem perfil não é tocado', async () => {
    const { recorded, useCase } = createFill({ local: [localOf()] })

    const result = await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [USER_ID],
    })

    expect(recorded.written).toEqual([])
    expect(result.skipped).toEqual([{ reason: 'profile-exists', userId: USER_ID }])
  })

  test('vínculo de outra empresa não é alcançável pelo id', async () => {
    const { recorded, useCase } = createFill({ local: [] })

    const result = await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [USER_ID],
    })

    expect(recorded.written).toEqual([])
    expect(result.skipped).toEqual([{ reason: 'not-found', userId: USER_ID }])
  })

  /** Preencher perfil é escrita sobre pessoa: sem trilha, ninguém sabe quem pôs aquele nome ali. */
  test('o preenchimento deixa trilha', async () => {
    const { recorded } = createFill({ local: [localOf({ hasProfile: false })] })
    const { recorded: audited, useCase } = createFill({ local: [localOf({ hasProfile: false })] })

    await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [USER_ID],
    })

    expect(recorded.audits).toEqual([])
    expect(audited.audits).toEqual([
      {
        action: 'company-user.profile-filled-from-realm',
        actorUserId: ACTOR_ID,
        companyId: COMPANY_ID,
        correlationId: 'contrato',
        targetIds: [USER_ID],
      },
    ])
  })

  test('nada a preencher não vira trilha nem chamada ao provedor', async () => {
    const { recorded, useCase } = createFill({ local: [localOf()] })

    await useCase.execute({
      context: { companyId: COMPANY_ID, userId: ACTOR_ID },
      correlationId: 'contrato',
      userIds: [],
    })

    expect(recorded.audits).toEqual([])
    expect(recorded.written).toEqual([])
  })
})
