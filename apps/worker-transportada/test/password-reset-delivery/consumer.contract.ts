/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T007/T008 da feature 033 — o lado do worker da entrega do código de recuperação.
 *
 * Mesmo arranjo do convite: a mensagem carrega só referência, o código em claro fica selado na linha
 * do pedido e é aberto aqui. Duas diferenças que são contrato, e não detalhe:
 *
 * - o envelope **não tem `actorId`** — quem pede recuperação não está autenticado;
 * - o AAD é amarrado ao **pedido**, não ao usuário, porque um usuário abre vários pedidos.
 */
import { describe, expect, test } from 'bun:test'

import { buildPasswordResetDeliveryRabbitMqTopology } from '../../src/messaging/password-reset-delivery-rabbitmq-topology.js'
import { passwordResetDeliveryEnvelopeV1Schema } from '../../src/messaging/password-reset-delivery-envelope.schema.js'
import { buildPasswordResetCodeAad } from '../../src/identity/infrastructure/password-reset-code-secret.gateway.js'
import { handlePasswordResetDelivery } from '../../src/identity/application/deliver-password-reset-code.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const REQUEST_ID = '00000000-0000-4000-8000-0000000000bb'
const CODE = 'a1b2c3d4e5f60718'
const ADDRESS = 'pessoa@example.test'

const MESSAGE = {
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: '00000000-0000-4000-8000-0000000000cc',
  occurredAt: '2026-08-13T12:00:00.000Z',
  payload: { requestId: REQUEST_ID, userId: USER_ID },
  type: 'transportada.identity.password-reset.code.requested',
  version: 1,
} as const

function createHarness(overrides: { readonly sendFails?: boolean } = {}) {
  const sent: { readonly address: string; readonly body: string; readonly channel: string }[] = []
  const writes: string[] = []
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
    logger: {
      error(message: string) {
        logged.push(message)
      },
      info(message: string) {
        logged.push(message)
      },
    },
    resets: {
      async findForDelivery() {
        return {
          companyId: COMPANY_ID,
          contactAddress: ADDRESS,
          contactChannel: 'email' as const,
          id: REQUEST_ID,
          sealedCode: { ciphertext: 'x', keyId: 'test', version: 1 },
          userId: USER_ID,
        }
      },
      async markDelivered() {
        writes.push('markDelivered')
      },
    },
  }

  return { dependencies, logged, sent, writes }
}

describe('topologia da entrega da recuperação', () => {
  test('segue o padrão de nome do trilho, com retry e dead', () => {
    const topology = buildPasswordResetDeliveryRabbitMqTopology({ queuePrefix: 'transportada' })
    const prefix = 'transportada.password-reset-delivery.v1'

    expect(topology.queue).toBe(`${prefix}.main.queue`)
    expect(topology.retry?.queue).toBe(`${prefix}.retry.queue`)
    expect(topology.deadLetter?.queue).toBe(`${prefix}.dead.queue`)
  })
})

describe('envelope da mensagem', () => {
  test('aceita a referência e recusa código em claro no payload', () => {
    expect(passwordResetDeliveryEnvelopeV1Schema.parse(MESSAGE)).toBeDefined()

    const withCode = { ...MESSAGE, payload: { ...MESSAGE.payload, code: CODE } }
    expect(() => passwordResetDeliveryEnvelopeV1Schema.parse(withCode)).toThrow()
  })

  test('não tem ator: quem pede recuperação não está autenticado', () => {
    expect(() =>
      passwordResetDeliveryEnvelopeV1Schema.parse({ ...MESSAGE, actorId: USER_ID }),
    ).toThrow()
  })
})

describe('AAD do envelope selado', () => {
  test('é palavra por palavra o que a API usou para selar', () => {
    expect(
      new TextDecoder().decode(
        buildPasswordResetCodeAad({ companyId: COMPANY_ID, requestId: REQUEST_ID }),
      ),
    ).toBe(`transportada:password-reset:v1:${COMPANY_ID}:${REQUEST_ID}`)
  })
})

describe('consumidor entrega pelo canal da empresa', () => {
  test('abre o envelope e envia pelo canal configurado', async () => {
    const harness = createHarness()

    await handlePasswordResetDelivery(MESSAGE, harness.dependencies as never)

    expect(harness.sent).toHaveLength(1)
    expect(harness.sent[0]?.channel).toBe('email')
    expect(harness.sent[0]?.address).toBe(ADDRESS)
    expect(harness.sent[0]?.body).toContain(CODE)
  })

  test('não escreve o código nem o contato em log', async () => {
    const harness = createHarness()

    await handlePasswordResetDelivery(MESSAGE, harness.dependencies as never)

    const everything = harness.logged.join('\n')
    expect(everything).not.toContain(CODE)
    expect(everything).not.toContain(ADDRESS)
  })

  test('falha de entrega não invalida o código e deixa reenviar', async () => {
    const harness = createHarness({ sendFails: true })

    await expect(
      handlePasswordResetDelivery(MESSAGE, harness.dependencies as never),
    ).rejects.toThrow()

    expect(harness.writes).toEqual([])
  })
})
