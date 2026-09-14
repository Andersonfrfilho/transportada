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
import { WHATSAPP_COMMAND_FAILURE_REPLY } from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import {
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000031'
const USER_ID = '00000000-0000-4000-8000-000000000032'
const PHONE = '5516999994321'
const NOW = new Date('2026-09-11T12:00:00.000Z')

function buildHarness(input: { readonly denied?: boolean } = {}) {
  const lookups: ResolveWhatsAppActorParams[] = []
  const logs: unknown[] = []
  const record = (...args: unknown[]): void => void logs.push(args)
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
    logger: { error: record, info: record, warn: record },
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

  return { logs, lookups, withAuthorizedActor }
}

function recordingChannel() {
  const texts: { readonly body: string; readonly to: string }[] = []
  const channel = {
    async sendText(to: string, body: string) {
      texts.push({ body, to })
    },
  } as unknown as ChannelAdapterInterface
  return { channel, texts }
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

  /**
   * T020 (B4): o erro que nenhuma FlowAction mapeou subia até o despachante, que só logava. A pessoa
   * ficava sem resposta, parada no nó.
   */
  test('FlowAction que lança erro genérico: mensagem neutra, volta ao menu, log só com o nome', async () => {
    const { logs, withAuthorizedActor } = buildHarness()
    const recording = recordingChannel()
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async () => {
        throw new TypeError(`invalid input syntax for type uuid: "entregue" (${PHONE})`)
      },
    )

    const result = await action({ ...buildActionInput(), channel: recording.channel })

    expect(result).toEqual({ next: 'menu' })
    expect(recording.texts).toEqual([{ body: WHATSAPP_COMMAND_FAILURE_REPLY, to: PHONE }])
    const logged = JSON.stringify(logs)
    expect(logged).toContain('"errorName":"TypeError"')
    expect(logged).not.toContain('entregue')
    expect(logged).not.toContain(PHONE)
  })

  test('a recusa do ator dentro da FlowAction continua subindo para o despachante', async () => {
    const { withAuthorizedActor } = buildHarness()
    const recording = recordingChannel()
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async () => {
        throw new WhatsAppCommandDeniedError('suspended')
      },
    )

    await expect(
      action({ ...buildActionInput(), channel: recording.channel }),
    ).rejects.toBeInstanceOf(WhatsAppCommandDeniedError)
    expect(recording.texts).toEqual([])
  })

  test('o pedido de uma pessoa (B5) também sobe, em vez de virar a mensagem neutra', async () => {
    const { withAuthorizedActor } = buildHarness()
    const recording = recordingChannel()
    const action = withAuthorizedActor(
      { permission: 'trip.report', scope: 'company' },
      async () => {
        throw new WhatsAppCommandHandoffRequestedError()
      },
    )

    await expect(
      action({ ...buildActionInput(), channel: recording.channel }),
    ).rejects.toBeInstanceOf(WhatsAppCommandHandoffRequestedError)
    expect(recording.texts).toEqual([])
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
