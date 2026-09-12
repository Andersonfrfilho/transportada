/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T004 — o número se prova pela própria mensagem. O painel pede o código; quem o confirma
 * é a mensagem que chega **daquele** número. Qualquer falha tem a mesma saída neutra da T006: dizer
 * "código errado" daria ao número um oráculo.
 */
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { CompanyUserNotFoundError } from '../../src/identity/domain/company-user.error.js'
import { createRequestWhatsAppPhoneVerificationUseCase } from '../../src/whatsapp-commands/application/request-whatsapp-phone-verification.use-case.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createUnbindWhatsAppPhoneUseCase } from '../../src/whatsapp-commands/application/unbind-whatsapp-phone.use-case.js'
import { createVerifyWhatsAppPhoneUseCase } from '../../src/whatsapp-commands/application/verify-whatsapp-phone.use-case.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_PHONE_VERIFIED_REPLY,
} from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import { WHATSAPP_PHONE_AUDIT } from '../../src/whatsapp-commands/domain/whatsapp-phone-verification.constant.js'
import { WhatsAppChannelNumberMissingError } from '../../src/whatsapp-commands/domain/whatsapp-phone.error.js'
import {
  WHATSAPP_ROOT_FLOW,
  WHATSAPP_ROOT_FLOW_KEY,
} from '../../src/whatsapp-commands/domain/whatsapp-root-flow.constant.js'
import { createWhatsAppPhoneRepositoryFake } from '../fixtures/whatsapp-phone-repository.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000041'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000042'
const USER_ID = '00000000-0000-4000-8000-000000000043'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000044'
const ADMIN_ID = '00000000-0000-4000-8000-000000000045'
const PHONE = '5516999991234'
const PHONE_WITHOUT_NINTH_DIGIT = '551699991234'
const STRANGER_PHONE = '5516988887777'
/** Como a coluna aceita: só dígitos (`whatsapp_channels_display_number_check`). */
const COMPANY_NUMBER = '551633334444'
const CORRELATION_ID = 'wamid.contract-t004'
const NOW = new Date('2026-09-11T12:00:00.000Z')
const TEN_MINUTES_MS = 10 * 60_000

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const DAY_MS = 86_400_000

function createVerificationScenario(
  options: {
    readonly companyNumber?: string
    readonly displayNames?: Readonly<Record<string, string>>
  } = {},
) {
  const fake = createWhatsAppPhoneRepositoryFake({
    companyNumber: options.companyNumber ?? COMPANY_NUMBER,
    displayNames: options.displayNames ?? { [USER_ID]: 'Maria Motorista' },
  })
  let now = NOW
  const requestCode = createRequestWhatsAppPhoneVerificationUseCase({
    clock: () => now,
    repository: fake.repository,
  })
  const verify = createVerifyWhatsAppPhoneUseCase({ repository: fake.repository })

  return {
    ...fake,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds)
    },
    now: () => now,
    requestCode,
    verify: (input: { readonly code: string; readonly fromPhone: string }) =>
      verify({ ...input, companyId: COMPANY_ID, correlationId: CORRELATION_ID, now }),
  }
}

describe('o pedido de código (spec 144 T004)', () => {
  test('devolve seis dígitos, o número da empresa e o vencimento em dez minutos', async () => {
    const scenario = createVerificationScenario()

    const result = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    expect(result.code).toMatch(/^\d{6}$/)
    expect(result.companyNumber).toBe(COMPANY_NUMBER)
    expect(result.expiresAt.getTime()).toBe(NOW.getTime() + TEN_MINUTES_MS)
  })

  test('grava o digest do código, nunca o código', async () => {
    const scenario = createVerificationScenario()

    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const [stored] = scenario.requests
    expect(stored?.codeHash).toBe(sha256(code))
    expect(stored?.codeHash).not.toContain(code)
    expect(stored).toMatchObject({ companyId: COMPANY_ID, phone: PHONE, userId: USER_ID })
    expect(JSON.stringify(scenario.requests)).not.toContain(`"${code}"`)
  })

  test('o segundo pedido fecha o primeiro: um código vivo por pessoa na empresa', async () => {
    const scenario = createVerificationScenario()
    const first = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })
    await scenario.requestCode({ companyId: COMPANY_ID, phone: PHONE, userId: USER_ID })

    expect(scenario.requests.filter((request) => request.consumedAt === undefined)).toHaveLength(1)
    expect(await scenario.verify({ code: first.code, fromPhone: PHONE })).toMatchObject({
      status: 'rejected',
    })
  })

  test('canal sem número de exibição recusa com 409 e não abre pedido', async () => {
    const scenario = createVerificationScenario({ companyNumber: '' })

    const attempt = scenario.requestCode({ companyId: COMPANY_ID, phone: PHONE, userId: USER_ID })

    await expect(attempt).rejects.toBeInstanceOf(WhatsAppChannelNumberMissingError)
    expect(scenario.requests).toHaveLength(0)
  })
})

describe('a verificação de entrada (spec 144 T004)', () => {
  test('o código certo vindo do número declarado verifica, fecha o pedido e deixa trilha', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: PHONE })

    expect(result).toEqual({ displayName: 'Maria Motorista', status: 'verified', userId: USER_ID })
    expect(scenario.bindings.get(USER_ID)).toEqual({ phone: PHONE, verifiedAt: scenario.now() })
    expect(scenario.requests[0]?.consumedAt).toEqual(scenario.now())
    expect(scenario.audits).toEqual([
      {
        action: WHATSAPP_PHONE_AUDIT.verified,
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        metadata: { phone: '****1234' },
        result: 'allowed',
        targetId: USER_ID,
      },
    ])
    expect(JSON.stringify(scenario.audits)).not.toContain(PHONE)
  })

  test('o mesmo código vindo de outro número não verifica e não gasta tentativa', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: STRANGER_PHONE })

    expect(result).toMatchObject({ status: 'rejected' })
    expect(scenario.bindings.size).toBe(0)
    expect(scenario.requests[0]).toMatchObject({ attemptCount: 0, consumedAt: undefined })
  })

  test('a Meta entregando sem o nono dígito ainda casa o número declarado', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: PHONE_WITHOUT_NINTH_DIGIT })

    expect(result).toMatchObject({ status: 'verified', userId: USER_ID })
    /** O vínculo fica como a Meta vê o número (D1): é por ele que a próxima mensagem chega. */
    expect(scenario.bindings.get(USER_ID)?.phone).toBe(PHONE_WITHOUT_NINTH_DIGIT)
  })

  test('código vencido não verifica, mesmo certo', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })
    scenario.advance(TEN_MINUTES_MS)

    expect(await scenario.verify({ code, fromPhone: PHONE })).toMatchObject({ status: 'rejected' })
    expect(scenario.bindings.size).toBe(0)
  })

  test('cada erro gasta uma tentativa, e depois da quinta nem o código certo passa', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })
    const wrong = code === '000000' ? '000001' : '000000'

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await scenario.verify({ code: wrong, fromPhone: PHONE })).toMatchObject({
        status: 'rejected',
      })
      expect(scenario.requests[0]?.attemptCount).toBe(attempt)
    }

    expect(await scenario.verify({ code, fromPhone: PHONE })).toMatchObject({ status: 'rejected' })
    expect(scenario.bindings.size).toBe(0)
  })

  test('dois usuários da empresa com o mesmo número: o código decide quem verifica', async () => {
    const scenario = createVerificationScenario()
    await scenario.requestCode({ companyId: COMPANY_ID, phone: PHONE, userId: USER_ID })
    const other = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: OTHER_USER_ID,
    })

    expect(await scenario.verify({ code: other.code, fromPhone: PHONE })).toEqual({
      status: 'verified',
      userId: OTHER_USER_ID,
    })
    expect(scenario.bindings.has(USER_ID)).toBe(false)
  })

  test('número já verificado por outra pessoa: recusa, pedido morto e colisão na trilha', async () => {
    const scenario = createVerificationScenario()
    await scenario.repository.saveVerified({ phone: PHONE, userId: OTHER_USER_ID, verifiedAt: NOW })
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: PHONE })

    expect(result).toEqual({ reason: 'phone_taken', status: 'rejected' })
    expect(scenario.bindings.has(USER_ID)).toBe(false)
    expect(scenario.requests[0]?.consumedAt).toBeDefined()
    expect(scenario.audits).toEqual([
      expect.objectContaining({
        action: WHATSAPP_PHONE_AUDIT.collision,
        actorUserId: USER_ID,
        metadata: { phone: '****1234' },
        result: 'denied',
      }),
    ])
  })

  /** T005b M1: a D1 promete cobrir o chip reciclado; sem liberar o vencido, o novo dono nunca entra. */
  test('vínculo vencido há mais de 90 dias libera o número, na grafia equivalente, com trilha', async () => {
    const scenario = createVerificationScenario()
    await scenario.repository.saveVerified({
      phone: PHONE_WITHOUT_NINTH_DIGIT,
      userId: OTHER_USER_ID,
      verifiedAt: new Date(NOW.getTime() - 91 * DAY_MS),
    })
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: PHONE })

    expect(result).toMatchObject({ status: 'verified', userId: USER_ID })
    expect(scenario.bindings.get(OTHER_USER_ID)?.verifiedAt).toBeUndefined()
    expect(scenario.audits.map((audit) => [audit.action, audit.targetId])).toEqual([
      [WHATSAPP_PHONE_AUDIT.expiredReleased, OTHER_USER_ID],
      [WHATSAPP_PHONE_AUDIT.verified, USER_ID],
    ])
    expect(scenario.audits[0]).toMatchObject({
      actorUserId: USER_ID,
      metadata: { phone: '****1234' },
      result: 'allowed',
    })
    expect(JSON.stringify(scenario.audits)).not.toContain(PHONE_WITHOUT_NINTH_DIGIT)
  })

  test('dentro dos 90 dias o dono continua dono, e a grafia sem o nono dígito colide', async () => {
    const scenario = createVerificationScenario()
    await scenario.repository.saveVerified({
      phone: PHONE_WITHOUT_NINTH_DIGIT,
      userId: OTHER_USER_ID,
      verifiedAt: new Date(NOW.getTime() - 89 * DAY_MS),
    })
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    const result = await scenario.verify({ code, fromPhone: PHONE })

    expect(result).toEqual({ reason: 'phone_taken', status: 'rejected' })
    expect(scenario.bindings.get(OTHER_USER_ID)?.verifiedAt).toBeDefined()
    expect(scenario.bindings.has(USER_ID)).toBe(false)
  })

  test('pedido de outra empresa não verifica nesta', async () => {
    const scenario = createVerificationScenario()
    const { code } = await scenario.requestCode({
      companyId: OTHER_COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    expect(await scenario.verify({ code, fromPhone: PHONE })).toMatchObject({ status: 'rejected' })
  })
})

describe('desfazer o vínculo (spec 144 T004)', () => {
  function createUnbindScenario(standing: 'absent' | 'suspended' = 'suspended') {
    const fake = createWhatsAppPhoneRepositoryFake()
    const unbind = createUnbindWhatsAppPhoneUseCase({
      memberships: { findStanding: async () => standing },
      repository: fake.repository,
    })
    return { ...fake, unbind }
  }

  test('o próprio usuário desfaz, e repetir não erra nem duplica a trilha', async () => {
    const scenario = createUnbindScenario()
    await scenario.repository.saveVerified({ phone: PHONE, userId: USER_ID, verifiedAt: NOW })
    const input = { companyId: COMPANY_ID, correlationId: CORRELATION_ID, userId: USER_ID }

    await scenario.unbind.unbindOwn(input)
    await scenario.unbind.unbindOwn(input)

    expect(scenario.bindings.size).toBe(0)
    expect(scenario.audits).toEqual([
      expect.objectContaining({
        action: WHATSAPP_PHONE_AUDIT.unbound,
        actorUserId: USER_ID,
        metadata: { phone: '****1234' },
        targetId: USER_ID,
      }),
    ])
  })

  test('o administrador desfaz o de quem tem vínculo com a empresa, e a trilha diz quem', async () => {
    const scenario = createUnbindScenario('suspended')
    await scenario.repository.saveVerified({ phone: PHONE, userId: USER_ID, verifiedAt: NOW })

    await scenario.unbind.unbindByAdministrator({
      actorUserId: ADMIN_ID,
      companyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
      userId: USER_ID,
    })

    expect(scenario.bindings.size).toBe(0)
    expect(scenario.audits[0]).toMatchObject({ actorUserId: ADMIN_ID, targetId: USER_ID })
  })

  test('administrador de outra empresa recebe 404 e o vínculo fica', async () => {
    const scenario = createUnbindScenario('absent')
    await scenario.repository.saveVerified({ phone: PHONE, userId: USER_ID, verifiedAt: NOW })

    const attempt = scenario.unbind.unbindByAdministrator({
      actorUserId: ADMIN_ID,
      companyId: OTHER_COMPANY_ID,
      correlationId: CORRELATION_ID,
      userId: USER_ID,
    })

    await expect(attempt).rejects.toBeInstanceOf(CompanyUserNotFoundError)
    expect(scenario.bindings.has(USER_ID)).toBe(true)
    expect(scenario.audits).toHaveLength(0)
  })
})

describe('o despachante confere o código antes do menu (spec 144 T004)', () => {
  function createDriverScenario(displayNames?: Readonly<Record<string, string>>) {
    const verification = createVerificationScenario(
      displayNames === undefined ? {} : { displayNames },
    )
    const sent: { kind: string; body: string; to: string }[] = []
    const logged: { message: string; meta?: unknown }[] = []
    const verifyCalls: string[] = []
    const record = (message: string, meta?: unknown): void => {
      logged.push({ message, ...(meta === undefined ? {} : { meta }) })
    }
    const position: { value: WhatsAppSessionPosition } = {
      value: { context: {}, currentNodeId: null, currentState: 'start', flowKey: null },
    }
    const sessions: WhatsAppCommandSessionPort = {
      getContext: async () => position.value,
      requestHuman: async () => {},
      setFlowPosition: async (_companyId, _number, flowKey, currentNodeId) => {
        position.value = { ...position.value, currentNodeId, flowKey }
      },
      setState: async (_companyId, _number, currentState, context) => {
        position.value = { ...position.value, context: context ?? {}, currentState }
      },
    }
    const sender: WhatsAppMessageSenderPort = {
      sendButtons: async ({ body, to }) => void sent.push({ body, kind: 'buttons', to }),
      sendList: async ({ body, to }) => void sent.push({ body, kind: 'list', to }),
      sendText: async ({ body, to }) => void sent.push({ body, kind: 'text', to }),
    }
    const verifyPhone = createVerifyWhatsAppPhoneUseCase({ repository: verification.repository })
    const driver = createWhatsAppCommandDriver({
      channel: {} as ChannelAdapterInterface,
      clock: verification.now,
      graphs: createStaticWhatsAppFlowGraphProvider({
        graphs: [WHATSAPP_ROOT_FLOW],
        rootFlowKey: WHATSAPP_ROOT_FLOW_KEY,
      }),
      interpreter: new FlowInterpreter(),
      logger: { error: record, info: record, warn: record },
      rateLimiter: createRateLimiter(),
      async resolveActor({ fromPhone }): Promise<ResolveWhatsAppActorResult> {
        const verified = await verification.repository.findVerifiedByPhone({ phone: fromPhone })
        if (verified === undefined) return { reason: 'unknown_phone', status: 'denied' }
        return {
          context: {
            identity: {
              channel: 'whatsapp',
              companyIdClaim: COMPANY_ID,
              externalIdentityId: '',
              issuer: 'whatsapp',
              platformAdmin: false,
              serviceAccount: false,
              subject: '',
              userId: verified.userId,
            },
            scope: {
              companyId: COMPANY_ID,
              kind: 'company',
              membershipId: '00000000-0000-4000-8000-000000000046',
              permissions: new Set(),
              roles: ['driver'],
              userId: verified.userId,
            },
          },
          status: 'authorized',
        }
      },
      sender,
      sessions,
      verifyPhone: async (input) => {
        verifyCalls.push(input.code)
        return verifyPhone(input)
      },
    })
    const session = {
      companyId: COMPANY_ID,
      currentState: 'start',
      mode: 'bot',
      whatsappNumber: PHONE,
    } as unknown as ConversationSession

    return {
      ...verification,
      logged,
      receive: (body: string, from = PHONE) =>
        driver(
          {
            from,
            id: CORRELATION_ID,
            text: { body },
            timestamp: '1757592000',
            type: 'text',
          } as WhatsAppMessage,
          session,
        ),
      sent,
      verifyCalls,
    }
  }

  test('número não vinculado mandando o código certo recebe a confirmação e o menu', async () => {
    const scenario = createDriverScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    await scenario.receive(` ${code} `)

    /** T005b B2: quem mandou o código do próprio celular vê para quem o número foi. */
    expect(scenario.sent[0]).toEqual({
      body: '✅ Número vinculado a *Maria Motorista*.',
      kind: 'text',
      to: PHONE,
    })
    expect(scenario.sent[1]).toMatchObject({ kind: 'buttons', to: PHONE })
    expect(scenario.bindings.get(USER_ID)?.phone).toBe(PHONE)
    const serialized = JSON.stringify(scenario.logged)
    expect(serialized).not.toContain(PHONE)
    expect(serialized).not.toContain(code)
  })

  test('o nome sai sem marcação, e conta sem ficha recebe a confirmação sem nome', async () => {
    const named = createDriverScenario({ [USER_ID]: ' *Maria_ ~Motorista~ ' })
    const unnamed = createDriverScenario({})
    for (const scenario of [named, unnamed]) {
      const { code } = await scenario.requestCode({
        companyId: COMPANY_ID,
        phone: PHONE,
        userId: USER_ID,
      })
      await scenario.receive(code)
    }

    expect(named.sent[0]?.body).toBe('✅ Número vinculado a *Maria Motorista*.')
    expect(unnamed.sent[0]?.body).toBe(WHATSAPP_PHONE_VERIFIED_REPLY)
  })

  /** T005b M4: a Meta alterna as duas grafias; o teto que as separa vale o dobro. */
  test('a resposta neutra conta as duas grafias do nono dígito como um número só', async () => {
    const scenario = createDriverScenario()

    await scenario.receive('oi', PHONE)
    await scenario.receive('oi', PHONE_WITHOUT_NINTH_DIGIT)

    expect(scenario.sent).toEqual([{ body: WHATSAPP_DENIED_REPLY, kind: 'text', to: PHONE }])
  })

  test('código errado sai como a mesma resposta neutra, uma vez por dia, sem o código no log', async () => {
    const scenario = createDriverScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })
    const wrong = code === '123456' ? '654321' : '123456'

    await scenario.receive(wrong)
    await scenario.receive(wrong)

    expect(scenario.sent).toEqual([{ body: WHATSAPP_DENIED_REPLY, kind: 'text', to: PHONE }])
    expect(scenario.bindings.size).toBe(0)
    const serialized = JSON.stringify(scenario.logged)
    expect(serialized).not.toContain(wrong)
    expect(serialized).not.toContain(PHONE)
  })

  test('o código certo vindo de outro número é recusado como qualquer outra mensagem', async () => {
    const scenario = createDriverScenario()
    const { code } = await scenario.requestCode({
      companyId: COMPANY_ID,
      phone: PHONE,
      userId: USER_ID,
    })

    await scenario.receive(code, STRANGER_PHONE)

    expect(scenario.sent).toEqual([
      { body: WHATSAPP_DENIED_REPLY, kind: 'text', to: STRANGER_PHONE },
    ])
    expect(scenario.bindings.size).toBe(0)
  })

  test('texto que não é só o código nem passa pela verificação', async () => {
    const scenario = createDriverScenario()

    await scenario.receive('meu código é 123456')

    expect(scenario.verifyCalls).toEqual([])
    expect(scenario.sent).toEqual([{ body: WHATSAPP_DENIED_REPLY, kind: 'text', to: PHONE }])
  })

  test('número já verificado mandando seis dígitos segue para o fluxo, não para a verificação', async () => {
    const scenario = createDriverScenario()
    await scenario.repository.saveVerified({ phone: PHONE, userId: USER_ID, verifiedAt: NOW })

    await scenario.receive('123456')

    expect(scenario.verifyCalls).toEqual([])
    expect(scenario.sent[0]).toMatchObject({ kind: 'buttons' })
  })
})
