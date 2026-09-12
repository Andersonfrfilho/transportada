/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T005 — quem fala pelo WhatsApp é quem tem membership. O número verificado há no máximo 90
 * dias leva ao usuário, e a membership ativa desse usuário na empresa do canal é o que autoriza — com
 * o mesmo `TenantContextService` do caminho HTTP. As quatro recusas são fluxo esperado, não exceção,
 * e a razão fica para o log.
 */
import { describe, expect, test } from 'bun:test'

import type { ActiveCompanyMembership } from '../../src/identity/application/tenant-context.port.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import type { MembershipStanding } from '../../src/whatsapp-commands/application/whatsapp-actor.port.js'
import type { VerifiedWhatsAppPhone } from '../../src/whatsapp-commands/application/whatsapp-phone.port.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS } from '../../src/whatsapp-commands/domain/whatsapp-phone-verification.constant.js'

const USER_ID = '00000000-0000-4000-8000-000000000011'
const COMPANY_ID = '00000000-0000-4000-8000-000000000012'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000013'
const PHONE = '5516999991234'
const PHONE_WITHOUT_NINTH_DIGIT = '551699991234'
const NOW = new Date('2026-09-11T12:00:00.000Z')
const DAY_MS = 86_400_000

type ScenarioParams = {
  readonly verified?: Readonly<Record<string, VerifiedWhatsAppPhone>>
  readonly unverifiedPhones?: readonly string[]
  readonly membership?: ActiveCompanyMembership | null
  readonly standing?: MembershipStanding
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS)
}

function createScenario(params: ScenarioParams = {}) {
  const phoneLookups: string[] = []
  const membershipLookups: Array<{ readonly companyId: string; readonly userId: string }> = []
  const verified = params.verified ?? { [PHONE]: { userId: USER_ID, verifiedAt: daysAgo(1) } }
  const membership =
    params.membership === undefined
      ? { grantedPermissions: [], membershipId: MEMBERSHIP_ID, roles: ['operator' as const] }
      : params.membership

  const tenantContext = new TenantContextService({
    repository: {
      async findActiveByUserAndCompany(input) {
        membershipLookups.push(input)
        return membership
      },
    },
  })

  const resolveActor = createResolveWhatsAppActorUseCase({
    memberships: {
      async findStanding() {
        return params.standing ?? 'absent'
      },
    },
    phones: {
      async findVerifiedByPhone({ phone }) {
        phoneLookups.push(phone)
        return verified[phone]
      },
      async hasUnverifiedBindingByPhone({ phone }) {
        return (params.unverifiedPhones ?? []).includes(phone)
      },
    },
    tenantContext,
  })

  return { membershipLookups, phoneLookups, resolveActor }
}

describe('resolveWhatsAppActor (spec 144 T005)', () => {
  test('número verificado com membership ativa vira o contexto autenticado da empresa do canal', async () => {
    const { membershipLookups, resolveActor } = createScenario()

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result.status).toBe('authorized')
    if (result.status !== 'authorized') return
    expect(membershipLookups).toEqual([{ companyId: COMPANY_ID, userId: USER_ID }])
    expect(result.context.identity.channel).toBe('whatsapp')
    expect(result.context.identity.userId).toBe(USER_ID)
    expect(result.context.identity.companyIdClaim).toBe(COMPANY_ID)
    expect(result.context.identity.platformAdmin).toBe(false)
    expect(result.context.identity.serviceAccount).toBe(false)
    expect(result.context.scope).toMatchObject({
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: MEMBERSHIP_ID,
      roles: ['operator'],
      userId: USER_ID,
    })
    expect(result.context.scope.permissions.has('trip.manage')).toBe(true)
    expect(Object.isFrozen(result.context)).toBe(true)
    expect(Object.isFrozen(result.context.identity)).toBe(true)
  })

  test('o número cru do webhook é canonicalizado antes da busca', async () => {
    const { phoneLookups, resolveActor } = createScenario()

    const result = await resolveActor({
      companyId: COMPANY_ID,
      fromPhone: '+55 (16) 99999-1234',
      now: NOW,
    })

    expect(result.status).toBe('authorized')
    expect(phoneLookups[0]).toBe(PHONE)
  })

  test('número desconhecido é recusado como unknown_phone', async () => {
    const { membershipLookups, resolveActor } = createScenario({ verified: {} })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'unknown_phone', status: 'denied' })
    expect(membershipLookups).toEqual([])
  })

  test('telefone inválido é unknown_phone, e nem chega ao banco', async () => {
    const { phoneLookups, resolveActor } = createScenario()

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: 'abc', now: NOW })

    expect(result).toEqual({ reason: 'unknown_phone', status: 'denied' })
    expect(phoneLookups).toEqual([])
  })

  test('número declarado e nunca verificado é unverified_or_expired', async () => {
    const { resolveActor } = createScenario({ unverifiedPhones: [PHONE], verified: {} })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'unverified_or_expired', status: 'denied' })
  })

  test(`verificado há exatamente ${WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS} dias ainda vale`, async () => {
    const { resolveActor } = createScenario({
      verified: {
        [PHONE]: {
          userId: USER_ID,
          verifiedAt: daysAgo(WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS),
        },
      },
    })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result.status).toBe('authorized')
  })

  test('um milissegundo depois dos 90 dias é unverified_or_expired, e a membership nem é lida', async () => {
    const verifiedAt = new Date(daysAgo(WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS).getTime() - 1)
    const { membershipLookups, resolveActor } = createScenario({
      verified: { [PHONE]: { userId: USER_ID, verifiedAt } },
    })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'unverified_or_expired', status: 'denied' })
    expect(membershipLookups).toEqual([])
  })

  test('sem membership na empresa do canal é no_membership', async () => {
    const { resolveActor } = createScenario({ membership: null, standing: 'absent' })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'no_membership', status: 'denied' })
  })

  test('membership ou empresa suspensa é suspended', async () => {
    const { resolveActor } = createScenario({ membership: null, standing: 'suspended' })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'suspended', status: 'denied' })
  })

  test('verificado sem o nono dígito casa com o remetente que chega com ele', async () => {
    const { phoneLookups, resolveActor } = createScenario({
      verified: { [PHONE_WITHOUT_NINTH_DIGIT]: { userId: USER_ID, verifiedAt: daysAgo(1) } },
    })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result.status).toBe('authorized')
    expect([...phoneLookups].sort()).toEqual([PHONE_WITHOUT_NINTH_DIGIT, PHONE].sort())
  })

  test('verificado com o nono dígito casa com o remetente que chega sem ele', async () => {
    const { resolveActor } = createScenario()

    const result = await resolveActor({
      companyId: COMPANY_ID,
      fromPhone: PHONE_WITHOUT_NINTH_DIGIT,
      now: NOW,
    })

    expect(result.status).toBe('authorized')
  })

  test('a forma exata vence a forma alternativa quando as duas existem', async () => {
    const otherUserId = '00000000-0000-4000-8000-000000000099'
    const { membershipLookups, resolveActor } = createScenario({
      verified: {
        [PHONE]: { userId: USER_ID, verifiedAt: daysAgo(1) },
        [PHONE_WITHOUT_NINTH_DIGIT]: { userId: otherUserId, verifiedAt: daysAgo(1) },
      },
    })

    await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(membershipLookups).toEqual([{ companyId: COMPANY_ID, userId: USER_ID }])
  })

  /** T005b A1: token de serviço vazado não pode ter virado número de WhatsApp antes da correção. */
  test('vínculo pré-existente de service account é recusado como service_account', async () => {
    const { resolveActor } = createScenario({
      membership: { grantedPermissions: [], membershipId: MEMBERSHIP_ID, roles: ['automation'] },
    })

    const result = await resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW })

    expect(result).toEqual({ reason: 'service_account', status: 'denied' })
  })

  test('erro de infraestrutura propaga, não vira recusa', async () => {
    const resolveActor = createResolveWhatsAppActorUseCase({
      memberships: { findStanding: async () => 'absent' },
      phones: {
        findVerifiedByPhone: async () => {
          throw new Error('connection refused')
        },
        hasUnverifiedBindingByPhone: async () => false,
      },
      tenantContext: new TenantContextService({
        repository: { findActiveByUserAndCompany: async () => null },
      }),
    })

    await expect(
      resolveActor({ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW }),
    ).rejects.toThrow('connection refused')
  })
})

describe('TenantContextService.resolveCompanyForUser (spec 144 T005)', () => {
  test('sem membership ativa devolve null em vez de lançar 403', async () => {
    const service = new TenantContextService({
      repository: { findActiveByUserAndCompany: async () => null },
    })

    const context = await service.resolveCompanyForUser({
      channel: 'whatsapp',
      companyId: COMPANY_ID,
      userId: USER_ID,
    })

    expect(context).toBeNull()
  })

  test('o escopo é o mesmo que o HTTP monta para a mesma membership', async () => {
    const service = new TenantContextService({
      repository: {
        findActiveByUserAndCompany: async () => ({
          grantedPermissions: ['trip.report'],
          membershipId: MEMBERSHIP_ID,
          roles: ['viewer'],
        }),
      },
    })

    const channelContext = await service.resolveCompanyForUser({
      channel: 'whatsapp',
      companyId: COMPANY_ID,
      userId: USER_ID,
    })
    const httpContext = await service.resolveCompany({
      companyIdClaim: COMPANY_ID,
      externalIdentityId: 'external',
      issuer: 'https://keycloak.example/realms/transportada',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'subject',
      userId: USER_ID,
    })

    expect(channelContext?.scope).toEqual(httpContext.scope)
    expect([...(channelContext?.scope.permissions ?? [])]).toEqual([
      ...httpContext.scope.permissions,
    ])
    expect(httpContext.identity.channel).toBeUndefined()
  })
})
