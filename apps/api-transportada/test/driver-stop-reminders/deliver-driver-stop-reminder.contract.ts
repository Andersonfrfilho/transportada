/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2 (RF8, RF9, RF12, RNF2): a entrega do lembrete vencido, com dublês nas portas. O relógio é injetado.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DeliverableStopReminder,
  DriverStopReminderDeliveryRepository,
  StopReminderDeliveryContext,
} from '../../src/driver-stop-reminders/application/driver-stop-reminder-delivery.port.js'
import { createDeliverDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/deliver-driver-stop-reminder.use-case.js'
import { DriverStopReminderNotFoundError } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.error.js'
import { WHATSAPP_TURN_MESSAGE_LIMIT } from '../../src/whatsapp-commands/application/whatsapp-turn-replies.service.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { botSpeechNodeId } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { DRIVER_STOP_REMINDER_SPEECH_NODE } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import type { StopCardView } from '../../src/whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import type { DriverOpenQuestions } from '../../src/whatsapp-commands/domain/driver-open-question.policy.js'

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const NOW = new Date('2026-11-07T17:00:00.000Z')
const MINUTE = 60_000
const RESERVED_VERSION = 4n
const GROUP = '120363000000000000@g.us'
const FREE: DriverOpenQuestions = {
  hasOpenCollection: false,
  hasOpenGroupRequest: false,
  hasOpenStopChoice: false,
  hasPendingAudio: false,
  hasPendingPrompt: false,
}

const REMINDER: DeliverableStopReminder = {
  anchorAt: new Date('2026-11-07T14:05:00.000Z'),
  attempts: 0,
  companyId: COMPANY_ID,
  driverId: 'driver-1',
  dueAt: new Date(NOW.getTime() - MINUTE),
  expectedAt: new Date('2026-11-07T14:40:00.000Z'),
  id: 'reminder-1',
  originKind: 'shared_point',
  postponements: 0,
  stage: 'arrival',
  status: 'pending',
  tripId: 'trip-1',
  tripStopId: 'stop-1',
  version: 3n,
}

const CONTEXT: StopReminderDeliveryContext = {
  driver: { id: 'driver-1', name: 'Fulano' },
  groupJid: GROUP,
  holidayDates: [],
  sendSlotAt: undefined,
  settings: {
    dwellMinutes: 30,
    enabled: true,
    graceMinMinutes: 30,
    gracePercent: 50,
    intervalMinutes: 30,
    maxAttempts: 3,
    operatingHours: [],
  },
  stop: {
    clientName: 'Cliente *Bom*',
    firstNoteNumber: '17234',
    hasArrived: false,
    isClosed: false,
    noteCount: 1,
  },
  timeZone: 'America/Sao_Paulo',
}

const STOP_VIEW: StopCardView = {
  card: {
    address: 'RUA DAS FLORES, 12, SAO CARLOS, SP',
    city: 'SAO CARLOS',
    contractorName: 'Indústria *Alfa*',
    coordinate: { latitude: '-21.5', longitude: '-47.9' },
    documentNumbers: ['0017234'],
    isAddressReliable: true,
    recipientName: 'Cliente *Bom*',
    sequence: 2,
    stopId: 'stop-1',
    totalStops: 5,
    totalValue: '1234.56',
    volumes: 3,
  },
}

const STOP_BLOCK = [
  '*Parada 2 de 5*',
  '*NF 17234* · R$ 1.234,56',
  '🏪 *Cliente Bom*',
  '🏢 Contratante: Indústria Alfa',
  '📍 RUA DAS FLORES, 12, SAO CARLOS, SP',
  '🗺️ https://www.google.com/maps/search/?api=1&query=-21.5,-47.9',
  '📦 3 volumes para entregar',
].join('\n')

type Overrides = {
  readonly stopCardRead?: () => Promise<StopCardView | null>
  readonly context?: Partial<StopReminderDeliveryContext>
  readonly isEnabled?: boolean
  readonly ownPromptOpen?: boolean
  readonly questions?: Partial<DriverOpenQuestions>
  /** A leitura de número N (base 0) devolve estas perguntas em vez de `questions`. */
  readonly questionsByRead?: readonly Partial<DriverOpenQuestions>[]
  readonly recordSentFailures?: number
  readonly reminder?: Partial<DeliverableStopReminder> | undefined
  readonly reserve?: boolean
  readonly sendError?: Error
}

function build(overrides: Overrides = {}) {
  const writes: Array<{ readonly kind: string; readonly [key: string]: unknown }> = []
  const sent: Array<{ body: string; companyId: string; groupJid: string; tripId: string }> = []
  const opened: unknown[] = []
  const stopCardReads: unknown[] = []
  const reminder = { ...REMINDER, ...overrides.reminder }
  let questionReads = 0
  let recordSentCalls = 0
  const discards: unknown[] = []
  const repository: DriverStopReminderDeliveryRepository = {
    close: async (params) => void writes.push({ kind: 'close', ...params }),
    escalate: async (params) => void writes.push({ kind: 'escalate', ...params }),
    findReminder: async ({ companyId }) =>
      companyId === reminder.companyId ? reminder : undefined,
    readContext: async () => ({ ...CONTEXT, ...overrides.context }),
    recordSent: async (params) => {
      recordSentCalls += 1
      if (recordSentCalls <= (overrides.recordSentFailures ?? 0)) throw new Error('db down')
      writes.push({ kind: 'sent', ...params })
    },
    release: async (params) => void writes.push({ kind: 'release', ...params }),
    reserveAttempt: async (params) => {
      writes.push({ kind: 'reserve', ...params })
      return overrides.reserve === false ? undefined : RESERVED_VERSION
    },
  }
  const promptOpener = {
    discard: async (params: unknown) => void discards.push(params),
    hasOwnOpen: async () => overrides.ownPromptOpen ?? false,
    open: async (params: unknown) => void opened.push(params),
  }
  const sender = {
    send: async (params: (typeof sent)[number]) => {
      if (overrides.sendError !== undefined) throw overrides.sendError
      sent.push(params)
      return { providerMessageId: 'provider-1' }
    },
  }
  const useCase = createDeliverDriverStopReminderUseCase({
    clock: () => NOW,
    driverOpenQuestions: {
      read: async () => {
        const index = questionReads
        questionReads += 1
        return { ...FREE, ...(overrides.questionsByRead?.[index] ?? overrides.questions) }
      },
    },
    isEnabled: overrides.isEnabled ?? true,
    promptOpener,
    repository,
    sender,
    sleep: async () => undefined,
    speech: CATALOG_BOT_SPEECH,
    stopCards: {
      read: (input) => {
        stopCardReads.push(input)
        return (overrides.stopCardRead ?? (async () => STOP_VIEW))()
      },
    },
  })
  return {
    stopCardReads,
    discards,
    opened,
    promptOpener,
    repository,
    sender,
    sent,
    useCase,
    writes,
  }
}

const run = (overrides?: Overrides, companyId = COMPANY_ID) =>
  build(overrides).useCase.execute({ companyId, reminderId: REMINDER.id })

describe('os nós de fala do lembrete existem no catálogo (spec 299 T2.2)', () => {
  test('o id do nó de cada chave é o que a política de mensagem devolve', () => {
    expect(botSpeechNodeId('lembreteChegada')).toBe(DRIVER_STOP_REMINDER_SPEECH_NODE.arrival)
    expect(botSpeechNodeId('lembreteChegadaSemPrevisao')).toBe(
      DRIVER_STOP_REMINDER_SPEECH_NODE.arrivalWithoutEstimate,
    )
    expect(botSpeechNodeId('lembreteEntrega')).toBe(DRIVER_STOP_REMINDER_SPEECH_NODE.settlement)
  })
})

describe('envia o lembrete no grupo (spec 299 T2.2, RF9, RF10, RF12)', () => {
  test('arrival com ponto compartilhado: texto exato, reserva antes, tentativa gravada e próximo prazo', async () => {
    const world = build()
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })

    expect(result).toEqual({
      nextDueAt: new Date(NOW.getTime() + 30 * MINUTE),
      outcome: 'sent',
    })
    expect(world.sent).toEqual([
      {
        body: [
          '👋 Oi, Fulano! Já chegou na parada?',
          'Saída às *11:05* · chegada prevista *~11:40*',
          '',
          STOP_BLOCK,
          '',
          '*1* - Cheguei',
          '*2* - Já entreguei (mande a foto do canhoto)',
          '*3* - Tive um problema (abrir ocorrência)',
          '*4* - Ainda estou a caminho',
        ].join('\n'),
        companyId: COMPANY_ID,
        groupJid: GROUP,
        tripId: 'trip-1',
      },
    ])
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve', 'sent'])
    expect(world.writes[0]).toMatchObject({ reminderId: 'reminder-1', version: 3n })
    expect(world.writes[1]).toMatchObject({
      channel: 'group',
      nextDueAt: new Date(NOW.getTime() + 30 * MINUTE),
      providerMessageId: 'provider-1',
      sentAt: NOW,
    })
    expect(world.opened).toHaveLength(1)
  })

  test('arrival sem ponto compartilhado: a linha da previsão some', async () => {
    const world = build({ reminder: { originKind: 'fallback' } })
    await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(world.sent[0]?.body.split('\n').slice(0, 3)).toEqual([
      '👋 Oi, Fulano! Já chegou na parada?',
      'Saída às *11:05*',
      '',
    ])
  })

  test('settlement: texto da entrega com a hora da chegada', async () => {
    const world = build({
      reminder: { anchorAt: new Date('2026-11-07T14:41:00.000Z'), stage: 'settlement' },
      context: { stop: { ...CONTEXT.stop, hasArrived: true } },
    })
    await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(world.sent[0]?.body).toBe(
      [
        '👋 Oi, Fulano! Já entregou na parada?',
        'Chegada às *11:41*',
        '',
        STOP_BLOCK,
        '',
        '*1* - Entreguei (mande a foto do canhoto)',
        '*2* - Não entreguei',
        '*3* - Tive um problema (abrir ocorrência)',
        '*4* - Ainda estou descarregando',
      ].join('\n'),
    )
  })

  test('saída de ontem e chegada de dias atrás levam o dia no texto', async () => {
    const yesterday = build({
      reminder: { anchorAt: new Date('2026-11-06T22:01:00.000Z'), originKind: 'fallback' },
    })
    await yesterday.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(yesterday.sent[0]?.body.split('\n')[1]).toBe('Saída *ontem* às *19:01*')

    const older = build({
      reminder: { anchorAt: new Date('2026-11-04T14:41:00.000Z'), stage: 'settlement' },
      context: { stop: { ...CONTEXT.stop, hasArrived: true } },
    })
    await older.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(older.sent[0]?.body.split('\n')[1]).toBe('Chegada em *04/11* às *11:41*')
  })

  test('a última tentativa deixa o próximo prazo, e a seguinte escala em vez de enviar', async () => {
    const last = build({ reminder: { attempts: 2 } })
    expect(
      (await last.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })).outcome,
    ).toBe('sent')

    const exhausted = build({ reminder: { attempts: 3 } })
    const result = await exhausted.useCase.execute({
      companyId: COMPANY_ID,
      reminderId: 'reminder-1',
    })
    expect(result).toEqual({ nextDueAt: null, outcome: 'escalated' })
    expect(exhausted.sent).toEqual([])
    expect(exhausted.writes).toEqual([
      { companyId: COMPANY_ID, escalatedAt: NOW, kind: 'escalate', reminderId: 'reminder-1' },
    ])
  })

  test('a escalada não espera horário nem pergunta aberta: nada é mandado ao motorista', async () => {
    const world = build({
      context: {
        settings: {
          ...CONTEXT.settings,
          operatingHours: [{ end: '08:00', start: '07:00', weekday: 6 }],
        },
      },
      questions: { hasOpenCollection: true },
      reminder: { attempts: 3 },
    })
    expect(
      (await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })).outcome,
    ).toBe('escalated')
  })
})

describe('adia sem consumir tentativa (spec 299 T2.2, RF8)', () => {
  test('fora do horário de funcionamento adia para a próxima abertura', async () => {
    const world = build({
      context: {
        settings: {
          ...CONTEXT.settings,
          operatingHours: [{ end: '18:00', start: '08:00', weekday: 1 }],
        },
      },
    })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    // 2026-11-07 é sábado; a próxima faixa é segunda 08:00 em São Paulo (UTC-3).
    expect(result).toEqual({
      nextDueAt: new Date('2026-11-09T11:00:00.000Z'),
      outcome: 'deferred',
    })
    expect(world.sent).toEqual([])
    expect(world.writes.map((write) => write.kind)).toEqual(['release'])
  })

  test('pergunta aberta do motorista adia 5 minutos', async () => {
    const world = build({ questions: { hasOpenGroupRequest: true } })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 5 * MINUTE), outcome: 'deferred' })
    expect(world.sent).toEqual([])
  })

  test('o pedido aberto que é do próprio lembrete não conta como pergunta aberta: a nova tentativa envia', async () => {
    const world = build({ ownPromptOpen: true, questions: { hasOpenGroupRequest: true } })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result.outcome).toBe('sent')
    expect(world.opened).toHaveLength(1)
  })

  test('o pedido do próprio lembrete não libera as outras perguntas abertas', async () => {
    const world = build({
      ownPromptOpen: true,
      questions: { hasOpenCollection: true, hasOpenGroupRequest: true },
    })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 5 * MINUTE), outcome: 'deferred' })
    expect(world.sent).toEqual([])
  })

  test('vaga do Evolution além da espera adia para a vaga', async () => {
    const slot = new Date(NOW.getTime() + 10 * MINUTE)
    const world = build({ context: { sendSlotAt: slot } })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: slot, outcome: 'deferred' })
    expect(world.sent).toEqual([])
  })

  test('vaga dentro da espera não adia', async () => {
    const world = build({ context: { sendSlotAt: new Date(NOW.getTime() + 30_000) } })
    expect(
      (await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })).outcome,
    ).toBe('sent')
  })

  test('sem grupo vinculado adia pelo intervalo, sem reservar nem enviar', async () => {
    const world = build({ context: { groupJid: undefined } })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({
      nextDueAt: new Date(NOW.getTime() + 30 * MINUTE),
      outcome: 'deferred',
    })
    expect(world.writes.map((write) => write.kind)).toEqual(['release'])
  })

  test('falha do provedor devolve a tentativa: nada gravado como enviado, prazo daqui a 5 minutos', async () => {
    const world = build({ sendError: new Error('provider down') })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 5 * MINUTE), outcome: 'deferred' })
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve', 'release'])
  })

  test('reserva perdida para outra entrega não envia', async () => {
    const world = build({ reserve: false })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result.outcome).toBe('deferred')
    expect(world.sent).toEqual([])
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve'])
  })

  test('chave global ou da empresa desligada não toca a linha nem envia', async () => {
    for (const overrides of [
      { isEnabled: false },
      { context: { settings: { ...CONTEXT.settings, enabled: false } } },
    ]) {
      const world = build(overrides)
      const result = await world.useCase.execute({
        companyId: COMPANY_ID,
        reminderId: 'reminder-1',
      })
      expect(result.outcome).toBe('deferred')
      expect(world.writes).toEqual([])
      expect(world.sent).toEqual([])
    }
  })
})

describe('o bloco da parada na cobrança (spec 299, dono 2026-11-07)', () => {
  test('parada com muitas NFs: o corpo nunca passa do teto de uma mensagem do WhatsApp', async () => {
    const documentNumbers = Array.from({ length: 900 }, (_, index) => String(1_000_000 + index))
    const world = build({
      stopCardRead: async () => ({ card: { ...STOP_VIEW.card, documentNumbers } }),
    })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    const body = world.sent[0]?.body ?? ''

    expect(result.outcome).toBe('sent')
    expect(body.length).toBeLessThanOrEqual(WHATSAPP_TURN_MESSAGE_LIMIT)
    expect(body).toContain('*Parada 2 de 5*')
    expect(body).toContain('📦 3 volumes para entregar')
    expect(body).toContain('*4* - Ainda estou a caminho')
    expect(body).toContain('…')
  })

  test('parada comum: o corpo não é alterado', async () => {
    const world = build()
    await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(world.sent[0]?.body).toContain(STOP_BLOCK)
    expect(world.sent[0]?.body).not.toContain('…')
  })

  test('lê o bloco da empresa e do motorista atual da parada do lembrete', async () => {
    const world = build()
    await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(world.stopCardReads).toEqual([
      { companyId: COMPANY_ID, driverId: 'driver-1', stopId: REMINDER.tripStopId },
    ])
  })

  test.each([
    ['o leitor devolve null', async () => null],
    [
      'o leitor falha',
      async (): Promise<StopCardView | null> => {
        throw new Error('db down')
      },
    ],
  ])(
    'melhor esforço: quando %s, o lembrete sai sem o bloco, sem linha em branco sobrando',
    async (_name, stopCardRead) => {
      const world = build({ stopCardRead })
      const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
      expect(result.outcome).toBe('sent')
      expect(world.sent[0]?.body).toBe(
        [
          '👋 Oi, Fulano! Já chegou na parada?',
          'Saída às *11:05* · chegada prevista *~11:40*',
          '',
          '*1* - Cheguei',
          '*2* - Já entreguei (mande a foto do canhoto)',
          '*3* - Tive um problema (abrir ocorrência)',
          '*4* - Ainda estou a caminho',
        ].join('\n'),
      )
    },
  )
})

describe('fecha quando a parada andou e respeita a empresa (spec 299 T2.2, RF8.1, BOLA)', () => {
  test('arrival: a chegada já registrada fecha por `arrived`', async () => {
    const world = build({ context: { stop: { ...CONTEXT.stop, hasArrived: true } } })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: null, outcome: 'closed' })
    expect(world.writes).toEqual([
      {
        closedAt: NOW,
        companyId: COMPANY_ID,
        kind: 'close',
        reason: 'arrived',
        reminderId: 'reminder-1',
        version: 3n,
      },
    ])
    expect(world.sent).toEqual([])
  })

  test('parada fechada fecha por `stop_closed` nas duas etapas', async () => {
    for (const stage of ['arrival', 'settlement'] as const) {
      const world = build({
        context: { stop: { ...CONTEXT.stop, hasArrived: true, isClosed: true } },
        reminder: { stage },
      })
      await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
      expect(world.writes[0]).toMatchObject({ kind: 'close', reason: 'stop_closed' })
    }
  })

  test('lembrete de outra empresa é 404, sem ler nada dela', async () => {
    await expect(run({}, OTHER_COMPANY_ID)).rejects.toBeInstanceOf(DriverStopReminderNotFoundError)
  })

  test('lembrete que não está pendente devolve o desfecho sem escrever', async () => {
    for (const [status, outcome] of [
      ['closed', 'closed'],
      ['cancelled', 'closed'],
      ['escalated', 'escalated'],
    ] as const) {
      const world = build({ reminder: { status } })
      const result = await world.useCase.execute({
        companyId: COMPANY_ID,
        reminderId: 'reminder-1',
      })
      expect(result).toEqual({ nextDueAt: null, outcome })
      expect(world.writes).toEqual([])
    }
  })
})

describe('canal do lembrete (spec 299 T2.5, D5)', () => {
  const DIRECT_SENT = {
    channel: 'direct_text',
    providerMessageId: 'direct-1',
    status: 'sent',
  } as const

  function buildWithChannel(options: {
    readonly channel: 'direct' | 'group'
    readonly directResult?: 'unavailable' | typeof DIRECT_SENT
    readonly groupJid?: string | undefined
    readonly hasDirectSender: boolean
  }) {
    const world = build({ context: { groupJid: 'groupJid' in options ? options.groupJid : GROUP } })
    const directCalls: unknown[] = []
    const resolved: unknown[] = []
    const useCase = createDeliverDriverStopReminderUseCase({
      channelResolver: {
        resolve: async (input) => {
          resolved.push(input)
          return options.channel
        },
      },
      clock: () => NOW,
      directSender: options.hasDirectSender
        ? {
            send: async (input) => {
              directCalls.push(input)
              return options.directResult === 'unavailable'
                ? { status: 'unavailable' }
                : (options.directResult ?? DIRECT_SENT)
            },
          }
        : undefined,
      driverOpenQuestions: { read: async () => FREE },
      isEnabled: true,
      promptOpener: world.promptOpener,
      repository: world.repository,
      sender: world.sender,
      speech: CATALOG_BOT_SPEECH,
    })
    return { ...world, directCalls, resolved, useCase }
  }

  const execute = (world: { useCase: { execute: (p: never) => Promise<unknown> } }) =>
    world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id } as never)

  test('canal grupo: o resolvedor é consultado com a empresa e o motorista, e o envio sai no grupo', async () => {
    const world = buildWithChannel({ channel: 'group', hasDirectSender: true })
    await execute(world)
    expect(world.resolved).toEqual([{ companyId: COMPANY_ID, driverId: 'driver-1' }])
    expect(world.directCalls).toEqual([])
    expect(world.sent).toHaveLength(1)
  })

  test('canal direto sem remetente individual (Fase 3 ausente): cai no grupo', async () => {
    const world = buildWithChannel({ channel: 'direct', hasDirectSender: false })
    const result = await execute(world)
    expect(result).toMatchObject({ outcome: 'sent' })
    expect(world.sent).toHaveLength(1)
    expect(world.writes.find((write) => write.kind === 'sent')).toMatchObject({ channel: 'group' })
  })

  test('canal direto com remetente: envia no individual, grava o canal e não abre pedido de grupo', async () => {
    const world = buildWithChannel({ channel: 'direct', hasDirectSender: true })
    const result = await execute(world)
    expect(result).toMatchObject({ outcome: 'sent' })
    expect(world.sent).toEqual([])
    expect(world.opened).toEqual([])
    expect(world.directCalls).toHaveLength(1)
    expect(world.writes.find((write) => write.kind === 'sent')).toMatchObject({
      channel: 'direct_text',
      providerMessageId: 'direct-1',
    })
  })

  test('canal direto indisponível: cai no grupo na mesma tentativa', async () => {
    const world = buildWithChannel({
      channel: 'direct',
      directResult: 'unavailable',
      hasDirectSender: true,
    })
    await execute(world)
    expect(world.sent).toHaveLength(1)
    expect(world.writes.filter((write) => write.kind === 'reserve')).toHaveLength(1)
    expect(world.writes.find((write) => write.kind === 'sent')).toMatchObject({ channel: 'group' })
  })

  test('canal direto sem remetente e sem grupo: adia como antes, sem consumir tentativa', async () => {
    const world = buildWithChannel({
      channel: 'direct',
      groupJid: undefined,
      hasDirectSender: false,
    })
    const result = await execute(world)
    expect(result).toMatchObject({ outcome: 'deferred' })
    expect(world.writes.map((write) => write.kind)).toEqual(['release'])
  })

  test('canal direto indisponível e sem grupo: devolve a reserva e adia', async () => {
    const world = buildWithChannel({
      channel: 'direct',
      directResult: 'unavailable',
      groupJid: undefined,
      hasDirectSender: true,
    })
    const result = await execute(world)
    expect(result).toMatchObject({ outcome: 'deferred' })
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve', 'release'])
  })
})

describe('a pergunta que abre entre a leitura e a reserva segura o envio (spec 299 T2.2, RF8.3)', () => {
  test('pergunta aberta só na segunda leitura: devolve a reserva, adia 5 minutos e não envia', async () => {
    const world = build({ questionsByRead: [{}, { hasPendingAudio: true }] })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 5 * MINUTE), outcome: 'deferred' })
    expect(world.sent).toEqual([])
    expect(world.opened).toEqual([])
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve', 'release'])
    expect(world.writes[1]).toMatchObject({ version: RESERVED_VERSION })
    expect(world.writes.some((write) => write.kind === 'sent')).toBe(false)
  })

  test('o pedido do próprio lembrete na segunda leitura não segura o envio', async () => {
    const world = build({
      ownPromptOpen: true,
      questionsByRead: [{}, { hasOpenGroupRequest: true }],
    })
    expect((await run_(world)).outcome).toBe('sent')
  })

  test('canal direto: a segunda leitura também é obrigatória antes do envio individual', async () => {
    const world = build({ questionsByRead: [{}, { hasOpenStopChoice: true }] })
    const directCalls: unknown[] = []
    const useCase = createDeliverDriverStopReminderUseCase({
      channelResolver: { resolve: async () => 'direct' },
      clock: () => NOW,
      directSender: {
        send: async (input) => {
          directCalls.push(input)
          return { channel: 'direct_text', providerMessageId: 'direct-1', status: 'sent' }
        },
      },
      driverOpenQuestions: {
        read: (() => {
          let reads = 0
          return async () => ({ ...FREE, hasOpenStopChoice: (reads += 1) > 1 })
        })(),
      },
      isEnabled: true,
      promptOpener: world.promptOpener,
      repository: world.repository,
      sender: world.sender,
      speech: CATALOG_BOT_SPEECH,
    })
    const result = await useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 5 * MINUTE), outcome: 'deferred' })
    expect(directCalls).toEqual([])
    expect(world.sent).toEqual([])
    expect(world.writes.map((write) => write.kind)).toEqual(['reserve', 'release'])
  })
})

describe('o registro do envio não duplica o lembrete (spec 299 T2.2, M2)', () => {
  test('envio ok e o registro falha uma vez: grava na nova tentativa, com um único envio', async () => {
    const world = build({ recordSentFailures: 1 })
    const result = await run_(world)
    expect(result).toEqual({ nextDueAt: new Date(NOW.getTime() + 30 * MINUTE), outcome: 'sent' })
    expect(world.sent).toHaveLength(1)
    expect(world.writes.filter((write) => write.kind === 'sent')).toHaveLength(1)
    expect(world.discards).toEqual([])
  })

  test('registro sempre falha: um envio, pedido mantido e próximo prazo é o intervalo', async () => {
    const world = build({ recordSentFailures: 99 })
    const result = await run_(world)
    expect(result).toEqual({
      nextDueAt: new Date(NOW.getTime() + 30 * MINUTE),
      outcome: 'deferred',
    })
    expect(world.sent).toHaveLength(1)
    expect(world.discards).toEqual([])
    const release = world.writes.find((write) => write.kind === 'release')
    expect(release).toMatchObject({
      dueAt: new Date(NOW.getTime() + 30 * MINUTE),
      version: RESERVED_VERSION,
    })
  })

  test('falha do provedor segue devolvendo a tentativa e descartando o pedido', async () => {
    const world = build({ sendError: new Error('provider down') })
    await run_(world)
    expect(world.discards).toHaveLength(1)
    expect(world.writes.find((write) => write.kind === 'release')).toMatchObject({
      dueAt: new Date(NOW.getTime() + 5 * MINUTE),
      version: RESERVED_VERSION,
    })
  })
})

function run_(world: {
  useCase: {
    execute: (p: {
      companyId: string
      reminderId: string
    }) => Promise<{ outcome: string; nextDueAt: Date | null }>
  }
}) {
  return world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
}
