/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T013 da feature 026 — o lado do worker da entrega do código de ativação.
 *
 * A mensagem carrega só referência: o código em claro nunca atravessa o broker. O consumidor lê a
 * linha do convite, abre o envelope selado (`@adatechnology/secret-envelope`) e entrega pelo canal
 * configurado na empresa — mesmo arranjo da credencial de NFS-e.
 *
 * A asserção que dá nome à task é a última: **falha de entrega não invalida o código**. O convite
 * segue válido e reenviável; quem falhou foi o transporte, não a regra.
 */
import { describe, expect, test } from 'bun:test'

import { buildInvitationDeliveryRabbitMqTopology } from '../../src/messaging/invitation-delivery-rabbitmq-topology.js'
import { invitationDeliveryEnvelopeV1Schema } from '../../src/messaging/invitation-delivery-envelope.schema.js'
import { handleInvitationDelivery } from '../../src/identity/application/deliver-invitation-code.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const INVITATION_ID = '00000000-0000-4000-8000-0000000000bb'
const CODE = 'a1b2c3d4e5f60718'

const MESSAGE = {
  actorId: USER_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: '00000000-0000-4000-8000-0000000000cc',
  occurredAt: '2026-08-12T12:00:00.000Z',
  payload: { invitationId: INVITATION_ID, userId: USER_ID },
  type: 'transportada.identity.invitation.code.requested',
  version: 1,
} as const

function createHarness(overrides: { readonly sendFails?: boolean } = {}) {
  const sent: { readonly address: string; readonly body: string; readonly channel: string }[] = []
  const invitationWrites: string[] = []
  const logged: string[] = []

  const dependencies = {
    channels: {
      async send(input: { address: string; body: string; channel: string }) {
        if (overrides.sendFails === true) throw new Error('SMTP indisponível')
        sent.push(input)
      },
    },
    envelopeProvider: {
      async decrypt() {
        return CODE
      },
    },
    invitations: {
      async findForDelivery() {
        return {
          companyId: COMPANY_ID,
          contactAddress: 'pessoa@example.test',
          contactChannel: 'email' as const,
          id: INVITATION_ID,
          sealedCode: { ciphertext: 'x', keyId: 'test', version: 1 },
          userId: USER_ID,
        }
      },
      async markDelivered() {
        invitationWrites.push('markDelivered')
      },
      async invalidate() {
        invitationWrites.push('invalidate')
      },
    },
    logger: {
      error(message: string) {
        logged.push(message)
      },
      info(message: string) {
        logged.push(message)
      },
    },
  }

  return { dependencies, invitationWrites, logged, sent }
}

describe('topologia da entrega do convite', () => {
  test('segue o padrão de nome do trilho, com retry e dead', () => {
    const topology = buildInvitationDeliveryRabbitMqTopology({ queuePrefix: 'transportada' })
    const prefix = 'transportada.invitation-delivery.v1'

    expect(topology.queue).toBe(`${prefix}.main.queue`)
    expect(topology.retry?.queue).toBe(`${prefix}.retry.queue`)
    expect(topology.deadLetter?.queue).toBe(`${prefix}.dead.queue`)
  })
})

describe('envelope da mensagem', () => {
  test('aceita a referência e recusa código em claro no payload', () => {
    expect(invitationDeliveryEnvelopeV1Schema.parse(MESSAGE)).toBeDefined()

    const withCode = { ...MESSAGE, payload: { ...MESSAGE.payload, code: CODE } }
    expect(() => invitationDeliveryEnvelopeV1Schema.parse(withCode)).toThrow()
  })
})

describe('consumidor entrega pelo canal da empresa', () => {
  test('abre o envelope e envia pelo canal configurado', async () => {
    const harness = createHarness()

    await handleInvitationDelivery(MESSAGE, harness.dependencies as never)

    expect(harness.sent).toHaveLength(1)
    expect(harness.sent[0]?.channel).toBe('email')
    expect(harness.sent[0]?.address).toBe('pessoa@example.test')
    expect(harness.sent[0]?.body).toContain(CODE)
  })

  test('não escreve o código nem o contato em log', async () => {
    const harness = createHarness()

    await handleInvitationDelivery(MESSAGE, harness.dependencies as never)

    const everything = harness.logged.join('\n')
    expect(everything).not.toContain(CODE)
    expect(everything).not.toContain('pessoa@example.test')
  })

  test('falha de entrega não invalida o código e deixa reenviar', async () => {
    const harness = createHarness({ sendFails: true })

    await expect(handleInvitationDelivery(MESSAGE, harness.dependencies as never)).rejects.toThrow()

    expect(harness.invitationWrites).not.toContain('invalidate')
    expect(harness.invitationWrites).not.toContain('markDelivered')
  })
})
