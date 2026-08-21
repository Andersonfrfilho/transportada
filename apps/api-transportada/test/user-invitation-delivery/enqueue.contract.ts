/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T013 da feature 026 — o lado da API da entrega do código.
 *
 * Hoje o código em claro é gerado e hasheado na mesma expressão
 * (`codeHash: hashInvitationCode(generateInvitationCode())`) e descartado: ninguém nunca o recebe,
 * e nenhum convite é ativável. Estas asserções fixam as três decisões que consertam isso.
 *
 * 1. O caminho síncrono da rota não fala com canal nenhum — ele enfileira no outbox e devolve.
 * 2. O código em claro nunca é persistido nem atravessa o broker. Ele fica **selado** na linha do
 *    convite (`@adatechnology/secret-envelope`, já dependência das duas apps com key ring
 *    compartilhado), ao lado do hash que continua sendo o que valida a tentativa; a mensagem leva
 *    só referência. É o mesmo arranjo da credencial de NFS-e — ver o comentário de
 *    `worker/src/messaging/nfse-processing-envelope.schema.ts` — e o que `security.md` §6 pede.
 * 3. O código selado e o hash gravado são do **mesmo** código — é a asserção que prova que o
 *    claro parou de ser jogado fora.
 */
import { describe, expect, test } from 'bun:test'

import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { hashInvitationCode } from '../../src/identity/domain/invitation.policy.js'
import { createInviteCompanyUserUseCase } from '../../src/identity/application/invite-company-user.use-case.js'
import { createResendCompanyUserCodeUseCase } from '../../src/identity/application/resend-company-user-code.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const INVITATION_ID = '00000000-0000-4000-8000-0000000000bb'
const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'
const ISSUER = 'https://keycloak.test/realms/transportada'
const NOW = new Date('2026-08-12T12:00:00.000Z')

const INVITATION_EVENT_TYPE = 'transportada.identity.invitation.code.requested'

type OutboxMessage = {
  readonly invitationId: string

  readonly companyId: string
  readonly eventId: string
  readonly eventType: string
  readonly eventVersion: number
  readonly payload: Readonly<Record<string, unknown>>
}

/** Selagem reversível e sem chave: o contrato é sobre o formato, não sobre a criptografia. */
function createEnvelopeProviderFake() {
  return {
    async decrypt({ envelope }: { readonly envelope: SecretEnvelopeV1 }): Promise<string> {
      return Buffer.from(String(Reflect.get(envelope, 'ciphertext')), 'base64').toString('utf8')
    },
    async encrypt({ plaintext }: { readonly plaintext: string }): Promise<SecretEnvelopeV1> {
      return {
        ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
        keyId: 'test',
        version: 1,
      } as unknown as SecretEnvelopeV1
    },
  }
}

function createHarness() {
  const outbox: OutboxMessage[] = []
  const invitationsCreated: {
    readonly codeHash: string
    readonly sealedCode: SecretEnvelopeV1 | undefined
    readonly userId: string
  }[] = []
  const channelCalls: string[] = []

  const dependencies = {
    channel: {
      send(): Promise<void> {
        channelCalls.push('send')
        return Promise.resolve()
      },
    },
    envelopeProvider: createEnvelopeProviderFake(),
    identityGateway: {
      async createUser() {
        return { subject: SUBJECT }
      },
    },
    invitations: {
      async create(input: {
        readonly codeHash: string
        readonly sealedCode?: SecretEnvelopeV1
        readonly userId: string
      }) {
        invitationsCreated.push({
          codeHash: input.codeHash,
          sealedCode: input.sealedCode,
          userId: input.userId,
        })

        return { companyId: COMPANY_ID, id: INVITATION_ID, userId: input.userId }
      },
      async findLatestForUser() {
        return undefined
      },
    },
    issuer: ISSUER,
    now: () => NOW,
    outbox: {
      async save(message: OutboxMessage) {
        outbox.push(message)
      },
    },
    repository: {
      createInvitedUser() {
        return Promise.resolve({ membershipId: 'vinculo-de-teste' })
      },
      async findByUserId() {
        return { userId: 'existente' }
      },
    },
  }

  return { channelCalls, dependencies, invitationsCreated, outbox }
}

const INVITE_INPUT = {
  channel: 'email' as const,
  contact: 'pessoa@example.test',
  context: { companyId: COMPANY_ID },
  name: 'Pessoa de Teste',
  roles: ['operator' as const],
}

describe('convite enfileira a entrega em vez de enviar', () => {
  test('o caminho síncrono não chama canal nenhum', async () => {
    const harness = createHarness()
    const useCase = createInviteCompanyUserUseCase(harness.dependencies as never)

    await useCase.execute(INVITE_INPUT)

    expect(harness.channelCalls).toEqual([])
  })

  test('publica uma mensagem de entrega no outbox', async () => {
    const harness = createHarness()
    const useCase = createInviteCompanyUserUseCase(harness.dependencies as never)

    await useCase.execute(INVITE_INPUT)

    expect(harness.outbox).toHaveLength(1)
    const [message] = harness.outbox
    expect(message?.eventType).toBe(INVITATION_EVENT_TYPE)
    // Trilho próprio (`invitation_delivery_outbox`): a tabela é o tipo do agregado, então a
    // mensagem referencia o convite direto. `processing_outbox` não serviria — ela tem FK para
    // `nfe_imports` e check `aggregate_type = 'nfe_import'`.
    expect(message?.invitationId).toBe(INVITATION_ID)
    expect(message?.companyId).toBe(COMPANY_ID)
    expect(message?.eventVersion).toBe(1)
  })

  test('a mensagem leva só referência — nem código, nem envelope', async () => {
    const harness = createHarness()
    const useCase = createInviteCompanyUserUseCase(harness.dependencies as never)

    await useCase.execute(INVITE_INPUT)

    const payload = harness.outbox[0]?.payload ?? {}
    expect(payload).not.toHaveProperty('sealedCode')
    expect(payload).not.toHaveProperty('code')

    const sealed = harness.invitationsCreated[0]?.sealedCode
    expect(sealed).toBeDefined()
    const code = await harness.dependencies.envelopeProvider.decrypt({
      envelope: sealed as SecretEnvelopeV1,
    })
    expect(JSON.stringify(payload).includes(code)).toBe(false)
  })

  test('o convite guarda o código selado ao lado do hash, nunca em claro', async () => {
    const harness = createHarness()
    const useCase = createInviteCompanyUserUseCase(harness.dependencies as never)

    await useCase.execute(INVITE_INPUT)

    const created = harness.invitationsCreated[0]
    expect(created?.sealedCode).toBeDefined()

    const code = await harness.dependencies.envelopeProvider.decrypt({
      envelope: created?.sealedCode as SecretEnvelopeV1,
    })
    expect(code).toMatch(/^[0-9a-f]{16}$/)
    expect(JSON.stringify(created)).not.toContain(code)
  })

  test('o código selado é o mesmo que gerou o hash gravado', async () => {
    const harness = createHarness()
    const useCase = createInviteCompanyUserUseCase(harness.dependencies as never)

    await useCase.execute(INVITE_INPUT)

    const created = harness.invitationsCreated[0]
    expect(created?.sealedCode).toBeDefined()
    const code = await harness.dependencies.envelopeProvider.decrypt({
      envelope: created?.sealedCode as SecretEnvelopeV1,
    })

    expect(created?.codeHash).toBe(hashInvitationCode(code))
  })
})

describe('reenvio segue a mesma rota', () => {
  test('publica a entrega e não chama canal', async () => {
    const harness = createHarness()
    const useCase = createResendCompanyUserCodeUseCase(harness.dependencies as never)

    await useCase.execute({ context: { companyId: COMPANY_ID }, userId: 'existente' })

    expect(harness.channelCalls).toEqual([])
    expect(harness.outbox).toHaveLength(1)
    expect(harness.outbox[0]?.eventType).toBe(INVITATION_EVENT_TYPE)
  })

  test('o hash do reenvio corresponde ao código selado do reenvio', async () => {
    const harness = createHarness()
    const useCase = createResendCompanyUserCodeUseCase(harness.dependencies as never)

    await useCase.execute({ context: { companyId: COMPANY_ID }, userId: 'existente' })

    const created = harness.invitationsCreated[0]
    expect(created?.sealedCode).toBeDefined()
    const code = await harness.dependencies.envelopeProvider.decrypt({
      envelope: created?.sealedCode as SecretEnvelopeV1,
    })

    expect(created?.codeHash).toBe(hashInvitationCode(code))
  })
})
