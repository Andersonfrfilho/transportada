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
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { botSpeechNodeId } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { DRIVER_STOP_REMINDER_SPEECH_NODE } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import type { DriverOpenQuestions } from '../../src/whatsapp-commands/domain/driver-open-question.policy.js'

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const NOW = new Date('2026-11-07T17:00:00.000Z')
const MINUTE = 60_000
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

type Overrides = {
  readonly context?: Partial<StopReminderDeliveryContext>
  readonly isEnabled?: boolean
  readonly ownPromptOpen?: boolean
  readonly questions?: Partial<DriverOpenQuestions>
  readonly reminder?: Partial<DeliverableStopReminder> | undefined
  readonly reserve?: boolean
  readonly sendError?: Error
}

function build(overrides: Overrides = {}) {
  const writes: Array<{ readonly kind: string; readonly [key: string]: unknown }> = []
  const sent: Array<{ body: string; companyId: string; groupJid: string; tripId: string }> = []
  const opened: unknown[] = []
  const reminder = { ...REMINDER, ...overrides.reminder }
  const repository: DriverStopReminderDeliveryRepository = {
    close: async (params) => void writes.push({ kind: 'close', ...params }),
    escalate: async (params) => void writes.push({ kind: 'escalate', ...params }),
    findReminder: async ({ companyId }) =>
      companyId === reminder.companyId ? reminder : undefined,
    readContext: async () => ({ ...CONTEXT, ...overrides.context }),
    recordSent: async (params) => void writes.push({ kind: 'sent', ...params }),
    release: async (params) => void writes.push({ kind: 'release', ...params }),
    reserveAttempt: async (params) => {
      writes.push({ kind: 'reserve', ...params })
      return overrides.reserve ?? true
    },
  }
  const useCase = createDeliverDriverStopReminderUseCase({
    clock: () => NOW,
    driverOpenQuestions: { read: async () => ({ ...FREE, ...overrides.questions }) },
    isEnabled: overrides.isEnabled ?? true,
    promptOpener: {
      discard: async () => undefined,
      hasOwnOpen: async () => overrides.ownPromptOpen ?? false,
      open: async (params) => void opened.push(params),
    },
    repository,
    sender: {
      send: async (params) => {
        if (overrides.sendError !== undefined) throw overrides.sendError
        sent.push(params)
        return { providerMessageId: 'provider-1' }
      },
    },
    speech: CATALOG_BOT_SPEECH,
  })
  return { opened, sent, useCase, writes }
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
          '👋 Oi, Fulano! Já chegou na *NF 17234 · Cliente Bom*?',
          'Saída às *11:05* · chegada prevista *~11:40*',
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
    expect(world.sent[0]?.body.split('\n')[1]).toBe('Saída às *11:05*')
  })

  test('settlement: texto da entrega com a hora da chegada', async () => {
    const world = build({
      reminder: { anchorAt: new Date('2026-11-07T14:41:00.000Z'), stage: 'settlement' },
      context: { stop: { ...CONTEXT.stop, hasArrived: true, noteCount: 3 } },
    })
    await world.useCase.execute({ companyId: COMPANY_ID, reminderId: REMINDER.id })
    expect(world.sent[0]?.body).toBe(
      [
        '👋 Oi, Fulano! Já entregou na *NF 17234 +2 · Cliente Bom*?',
        'Chegada às *11:41*',
        '*1* - Entreguei (mande a foto do canhoto)',
        '*2* - Não entreguei',
        '*3* - Tive um problema (abrir ocorrência)',
        '*4* - Ainda estou descarregando',
      ].join('\n'),
    )
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
