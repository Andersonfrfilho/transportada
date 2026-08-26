/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dublês do provedor de identidade e dos repositórios de identidade, para provar a sincronização
 * sem subir Keycloak nem Postgres. Nenhuma senha real trafega aqui.
 */
import type { CompanyRole, MembershipStatus } from '../../src/database/identity.schema'
import type { CompanyUserRecord } from '../../src/identity/application/company-user.port'
import type {
  CreateInvitationInput,
  InvitationRecord,
} from '../../src/identity/application/invitation.port'
import type { ContactChannel } from '../../src/database/identity-user-profile.schema'
import { hashInvitationCode } from '../../src/identity/domain/invitation.policy'

export const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
export const ANOTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000002'
export const TARGET_USER_ID = '00000000-0000-4000-8000-0000000000bb'
export const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000aa'
export const KEYCLOAK_SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'
export const ACTIVATION_CODE = '00112233445566778899aabbccddeeff'
export const INVITATION_ID = '00000000-0000-4000-8000-0000000000cc'

type CreateUserCall = {
  readonly attributes?: Readonly<Record<string, string | readonly string[]>>
  readonly email: string
  readonly enabled: boolean
  readonly firstName?: string
  readonly lastName?: string
  readonly username: string
}

type SetEnabledCall = { readonly enabled: boolean; readonly userId: string }
type SetPasswordCall = { readonly temporary: boolean; readonly userId: string }

export type IdentityGatewayFake = {
  readonly createUserCalls: CreateUserCall[]
  readonly setEnabledCalls: SetEnabledCall[]
  readonly setPasswordCalls: SetPasswordCall[]
  createUser(input: CreateUserCall): Promise<{ readonly subject: string }>
  setEnabled(input: SetEnabledCall): Promise<void>
  setPassword(input: SetPasswordCall & { readonly password: string }): Promise<void>
}

export function createIdentityGatewayFake(
  options: { readonly failSetEnabled?: boolean } = {},
): IdentityGatewayFake {
  const createUserCalls: CreateUserCall[] = []
  const setEnabledCalls: SetEnabledCall[] = []
  const setPasswordCalls: SetPasswordCall[] = []

  return {
    createUserCalls,
    setEnabledCalls,
    setPasswordCalls,
    async createUser(input) {
      createUserCalls.push(input)
      return { subject: KEYCLOAK_SUBJECT }
    },
    async setEnabled(input) {
      if (options.failSetEnabled === true) throw new Error('keycloak indisponível')
      setEnabledCalls.push(input)
    },
    /** A senha nunca é registrada: o dublê guarda só o que os testes precisam afirmar. */
    async setPassword({ temporary, userId }) {
      setPasswordCalls.push({ temporary, userId })
    },
  }
}

export type InvitationRepositoryFake = {
  readonly acceptedCalls: { readonly invitationId: string }[]
  create(input: CreateInvitationInput): Promise<InvitationRecord>
  findByCodeHash(input: { readonly codeHash: string }): Promise<InvitationRecord | undefined>
  markAccepted(input: { readonly invitationId: string }): Promise<void>
  registerFailedAttempt(input: { readonly invitationId: string }): Promise<void>
}

/** A selagem do código e a fila de entrega não são o assunto deste contrato — só precisam existir. */
export function createInvitationDeliveryFakes() {
  return {
    envelopeProvider: {
      async encrypt({ plaintext }: { readonly plaintext: string }) {
        return { ciphertext: plaintext, keyId: 'test', version: 1 } as never
      },
    },
    outbox: { async save() {} },
  }
}

export function createInvitationRepositoryFake(
  options: { readonly withPendingCode?: string } = {},
): InvitationRepositoryFake {
  const acceptedCalls: { readonly invitationId: string }[] = []
  const pending: InvitationRecord | undefined =
    options.withPendingCode === undefined
      ? undefined
      : {
          acceptedAt: undefined,
          attemptCount: 0,
          codeHash: hashInvitationCode(options.withPendingCode),
          companyId: COMPANY_ID,
          expiresAt: new Date('2026-08-07T12:00:00.000Z'),
          id: INVITATION_ID,
          roles: ['operator'],
          status: 'pending',
          userId: TARGET_USER_ID,
        }

  return {
    acceptedCalls,
    async create(input) {
      return {
        acceptedAt: undefined,
        attemptCount: 0,
        codeHash: input.codeHash,
        companyId: input.companyId,
        expiresAt: input.expiresAt,
        id: INVITATION_ID,
        roles: input.roles,
        status: 'pending',
        userId: input.userId,
      }
    },
    async findByCodeHash() {
      return pending
    },
    async markAccepted(input) {
      acceptedCalls.push({ invitationId: input.invitationId })
    },
    async registerFailedAttempt() {},
  }
}

type CompanyUserRepositoryFakeOptions = {
  readonly activeMembershipCompanyIds?: readonly string[]
  readonly membershipStatus?: MembershipStatus
}

export type CompanyUserRepositoryFake = {
  readonly removeMembershipCalls: { readonly userId: string }[]
  readonly setMembershipStatusCalls: { readonly status: MembershipStatus }[]
  createInvitedUser(
    input: Record<string, unknown>,
  ): Promise<{ readonly linkedFleetDriverId: string | null; readonly membershipId: string }>
  findByUserId(input: { readonly userId: string }): Promise<CompanyUserRecord | undefined>
  findIdentitySubject(input: { readonly userId: string }): Promise<string | undefined>
  listActiveMembershipCompanyIds(input: { readonly userId: string }): Promise<readonly string[]>
  listAdministratorUserIds(): Promise<readonly string[]>
  removeMembership(input: { readonly userId: string }): Promise<void>
  setMembershipStatus(input: { readonly status: MembershipStatus }): Promise<void>
}

export function createCompanyUserRepositoryFake(
  options: CompanyUserRepositoryFakeOptions = {},
): CompanyUserRepositoryFake {
  const removeMembershipCalls: { readonly userId: string }[] = []
  const setMembershipStatusCalls: { readonly status: MembershipStatus }[] = []
  const roles: readonly CompanyRole[] = ['operator']
  const channel: ContactChannel = 'email'

  return {
    removeMembershipCalls,
    setMembershipStatusCalls,
    createInvitedUser() {
      return Promise.resolve({ linkedFleetDriverId: null, membershipId: 'vinculo-de-teste' })
    },
    async findByUserId({ userId }) {
      return {
        contactAddress: 'pessoa@empresa.test',
        contactChannel: channel,
        email: 'pessoa@empresa.test',
        membershipId: 'vinculo-de-teste',
        membershipStatus: options.membershipStatus ?? 'active',
        name: 'Pessoa de Teste',
        pendingInvitation: undefined,
        phone: '',
        roles,
        taxId: '',
        userId,
        username: userId,
      }
    },
    async findIdentitySubject() {
      return KEYCLOAK_SUBJECT
    },
    async listActiveMembershipCompanyIds() {
      return options.activeMembershipCompanyIds ?? [COMPANY_ID]
    },
    async listAdministratorUserIds() {
      return [ACTOR_USER_ID]
    },
    async removeMembership({ userId }) {
      removeMembershipCalls.push({ userId })
    },
    async setMembershipStatus({ status }) {
      setMembershipStatusCalls.push({ status })
    },
  }
}
