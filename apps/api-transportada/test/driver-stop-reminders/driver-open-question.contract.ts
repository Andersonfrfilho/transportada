/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2 (RF8.3, RNF1): o portão "pergunta aberta" saiu da oferta da próxima rota (294) para
 * `driver-open-question.policy.ts` sem mudar de comportamento; o lembrete lê além o pedido aberto do grupo.
 */
import { describe, expect, test } from 'bun:test'

import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import {
  canAskRouteOffer,
  hasDriverOpenQuestion,
  type DriverOpenQuestions,
} from '../../src/whatsapp-commands/domain/driver-open-question.policy.js'
import {
  createDriverOpenQuestionReader,
  type DriverOpenQuestionSessionPosition,
} from '../../src/whatsapp-commands/infrastructure/driver-open-question.adapter.js'
import { DRIVER_FLOW_NODE } from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import { DRIVER_PROMPT_CONTEXT_KEY } from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'

const COMPANY_ID = 'company-1'
const DRIVER_ID = 'driver-1'
const NOW = new Date('2026-11-07T12:00:00.000Z')
const FREE: DriverOpenQuestions = {
  hasOpenCollection: false,
  hasOpenGroupRequest: false,
  hasOpenStopChoice: false,
  hasPendingAudio: false,
  hasPendingPrompt: false,
}

describe('hasDriverOpenQuestion (spec 299 T2.2)', () => {
  test('livre de tudo não tem pergunta aberta', () => {
    expect(hasDriverOpenQuestion(FREE)).toBe(false)
    expect(canAskRouteOffer(FREE)).toBe(true)
  })

  test.each(Object.keys(FREE) as (keyof DriverOpenQuestions)[])(
    '%s sozinha basta para haver pergunta aberta',
    (key) => {
      expect(hasDriverOpenQuestion({ ...FREE, [key]: true })).toBe(true)
    },
  )

  test('o pedido do grupo não muda a decisão da oferta da próxima rota', () => {
    const withGroupRequest: DriverOpenQuestions = { ...FREE, hasOpenGroupRequest: true }
    expect(canAskRouteOffer(withGroupRequest)).toBe(true)
  })
})

function buildReader(overrides: {
  readonly collection?: boolean
  readonly groupJid?: string | undefined
  readonly groupRequest?: boolean
  readonly groupAudio?: boolean
  readonly individualAudio?: boolean
  readonly phone?: string | undefined
  readonly session?: DriverOpenQuestionSessionPosition | undefined
}) {
  const calls: string[] = []
  const reader = createDriverOpenQuestionReader({
    hasOpenCollection: async () => overrides.collection ?? false,
    hasOpenGroupRequest: async ({ groupJid }) => {
      calls.push(`request:${groupJid}`)
      return overrides.groupRequest ?? false
    },
    hasPendingGroupAudio: ({ groupJid }) => {
      calls.push(`group-audio:${groupJid}`)
      return overrides.groupAudio ?? false
    },
    hasPendingIndividualAudio: ({ phone }) => {
      calls.push(`individual-audio:${phone}`)
      return overrides.individualAudio ?? false
    },
    readContact: async () => ({
      groupJid: 'groupJid' in overrides ? overrides.groupJid : '120363@g.us',
      phone: 'phone' in overrides ? overrides.phone : '5516999990001',
    }),
    readSession: async () => overrides.session,
  })
  return {
    calls,
    read: () => reader.read({ companyId: COMPANY_ID, driverId: DRIVER_ID, now: NOW }),
  }
}

describe('o leitor da pergunta aberta compõe as leituras do bot (spec 299 T2.2)', () => {
  test('nada aberto devolve tudo falso', async () => {
    expect(await buildReader({}).read()).toEqual(FREE)
  })

  test('coleta aberta (ocorrência, entrega em preparo ou canhoto)', async () => {
    expect(await buildReader({ collection: true }).read()).toMatchObject({
      hasOpenCollection: true,
    })
  })

  test('pedido aberto do grupo do motorista', async () => {
    const { calls, read } = buildReader({ groupRequest: true })
    expect(await read()).toMatchObject({ hasOpenGroupRequest: true })
    expect(calls).toContain('request:120363@g.us')
  })

  test('sem grupo vinculado o pedido do grupo não é consultado', async () => {
    const { calls, read } = buildReader({ groupJid: undefined, groupRequest: true })
    expect(await read()).toMatchObject({ hasOpenGroupRequest: false })
    expect(calls.some((call) => call.startsWith('request:'))).toBe(false)
  })

  test('escolha de parada da sessão individual', async () => {
    const session = { context: {}, currentNodeId: DRIVER_FLOW_NODE.stopEntry }
    expect(await buildReader({ session }).read()).toMatchObject({ hasOpenStopChoice: true })
  })

  test('pergunta do bot guardada na sessão individual (dentro do prazo)', async () => {
    const context = {
      [DRIVER_PROMPT_CONTEXT_KEY]: {
        kind: 'route_offer',
        offeredAt: new Date(NOW.getTime() - 60_000).toISOString(),
        stopId: 'stop-1',
      },
    }
    const session = { context, currentNodeId: null }
    expect(await buildReader({ session }).read()).toMatchObject({ hasPendingPrompt: true })
  })

  test('pergunta vencida na sessão não segura o lembrete', async () => {
    const context = {
      [DRIVER_PROMPT_CONTEXT_KEY]: {
        kind: 'route_offer',
        offeredAt: new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
        stopId: 'stop-1',
      },
    }
    const session = { context, currentNodeId: null }
    expect(await buildReader({ session }).read()).toMatchObject({ hasPendingPrompt: false })
  })

  test('áudio esperando confirmação, no individual ou no grupo', async () => {
    expect(await buildReader({ individualAudio: true }).read()).toMatchObject({
      hasPendingAudio: true,
    })
    expect(await buildReader({ groupAudio: true }).read()).toMatchObject({ hasPendingAudio: true })
  })
})

describe('áudio pendente na conversa, de qualquer pessoa (spec 299 T2.2)', () => {
  const GROUP = 'group:120363@g.us'

  test('hasPendingInConversation enxerga a confirmação sem saber o dono', async () => {
    const audio = createWhatsAppBotAudio<null>({
      clock: () => NOW.getTime(),
      logger: { error() {}, info() {}, warn() {} },
      transcriber: undefined,
    })
    expect(audio.hasPendingInConversation({ companyId: COMPANY_ID, conversation: GROUP })).toBe(
      false,
    )
    await audio.offer({
      companyId: COMPANY_ID,
      context: null,
      conversation: GROUP,
      owner: 'helper-number',
      reply: async () => undefined,
      text: 'entreguei',
    })
    expect(audio.hasPendingInConversation({ companyId: COMPANY_ID, conversation: GROUP })).toBe(
      true,
    )
    expect(audio.hasPendingInConversation({ companyId: 'other', conversation: GROUP })).toBe(false)
  })
})
