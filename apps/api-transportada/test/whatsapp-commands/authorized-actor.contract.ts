/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T006 — toda FlowAction re-resolve o ator pelo número da sessão e confere a permissão com o
 * mesmo `AuthorizationService` do HTTP. O menu esconder a opção não é defesa: a ação recusa mesmo
 * quando chamada direto, fora do menu.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowActionHandler,
} from '@adatechnology/meta-whatsapp-contracts'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { ResolveWhatsAppActorParams } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import {
  createWithAuthorizedActor,
  registerWhatsAppFlowActions,
} from '../../src/whatsapp-commands/application/with-authorized-actor.service.js'
import { WhatsAppCommandDeniedError } from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000031'
const USER_ID = '00000000-0000-4000-8000-000000000032'
const PHONE = '5516999994321'
const NOW = new Date('2026-09-11T12:00:00.000Z')

function buildHarness(input: { readonly denied?: boolean } = {}) {
  const lookups: ResolveWhatsAppActorParams[] = []
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: [],
        membershipId: '00000000-0000-4000-8000-000000000033',
        roles: ['driver'],
      }),
    },
  })

  const withAuthorizedActor = createWithAuthorizedActor({
    authorization: new AuthorizationService(),
    clock: () => NOW,
    resolveActor: async (params) => {
      lookups.push(params)
      if (input.denied === true) return { reason: 'suspended', status: 'denied' }
      const context = await tenantContext.resolveCompanyForUser({
        channel: 'whatsapp',
        companyId: params.companyId,
        userId: USER_ID,
      })
      if (context === null) throw new Error('fixture sem contexto')
      return { context, status: 'authorized' }
    },
  })

  return { lookups, withAuthorizedActor }
}

function buildActionInput(): Parameters<FlowActionHandler>[0] {
  const session: ConversationSession = {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: NOW.toISOString(),
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: NOW.toISOString(),
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: NOW.toISOString(),
    whatsappNumber: PHONE,
  }

  return {
    channel: {} as ChannelAdapterInterface,
    context: {},
    node: { actionKind: 'contract.action', id: 'action', type: 'action' },
    session,
  }
}

describe('withAuthorizedActor (spec 144 T006)', () => {
  test('com a permissão, o handler recebe o ator re-resolvido pelo número da sessão', async () => {
    const { lookups, withAuthorizedActor } = buildHarness()
    const actors: string[] = []
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async ({ actor }) => {
        actors.push(actor.identity.userId)
        return { next: 'done' }
      },
    )

    const result = await action(buildActionInput())

    expect(result).toEqual({ next: 'done' })
    expect(actors).toEqual([USER_ID])
    expect(lookups).toEqual([{ companyId: COMPANY_ID, fromPhone: PHONE, now: NOW }])
  })

  test('sem a permissão, recusa antes do handler', async () => {
    const { withAuthorizedActor } = buildHarness()
    let called = false
    const action = withAuthorizedActor(
      { permission: 'users.manage', scope: 'company' },
      async () => {
        called = true
      },
    )

    const outcome = action(buildActionInput())

    await expect(outcome).rejects.toBeInstanceOf(WhatsAppCommandDeniedError)
    await expect(outcome).rejects.toMatchObject({ reason: 'permission' })
    expect(called).toBe(false)
  })

  test('número que deixou de valer entre duas ações é recusado na segunda', async () => {
    const { withAuthorizedActor } = buildHarness({ denied: true })
    let called = false
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async () => {
        called = true
      },
    )

    await expect(action(buildActionInput())).rejects.toMatchObject({ reason: 'suspended' })
    expect(called).toBe(false)
  })

  test('a cada chamada o ator é resolvido de novo, nunca reaproveitado', async () => {
    const { lookups, withAuthorizedActor } = buildHarness()
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async () => {},
    )

    await action(buildActionInput())
    await action(buildActionInput())

    expect(lookups).toHaveLength(2)
  })

  test('toda ação registrada passa pelo guarda: chamada direta sem permissão recusa', async () => {
    const { withAuthorizedActor } = buildHarness()
    const registered = new Map<string, FlowActionHandler>()
    let called = false

    registerWhatsAppFlowActions({
      definitions: [
        {
          handler: async () => {
            called = true
          },
          kind: 'contract.users',
          policy: { permission: 'users.manage', scope: 'company' },
        },
      ],
      registerFlowAction: (kind, handler) => registered.set(kind, handler),
      withAuthorizedActor,
    })

    const handler = registered.get('contract.users')
    expect(handler).toBeDefined()
    await expect(handler?.(buildActionInput())).rejects.toBeInstanceOf(WhatsAppCommandDeniedError)
    expect(called).toBe(false)
  })
})
