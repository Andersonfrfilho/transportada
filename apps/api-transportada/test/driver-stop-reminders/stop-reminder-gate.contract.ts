/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.2 (RF8, RNF6): o portão antes de cada envio, na ordem do spec — etapa, horário de funcionamento (fuso
 * da empresa, feriado fechado, faixa vazia aberta), pedido aberto e vaga do Evolution. A conferência das duas
 * chaves (env global + empresa) NÃO é do portão: o plano a faz na consulta da rotina, que só devolve empresa ligada.
 */
import { describe, expect, test } from 'bun:test'

import {
  decideStopReminderGate,
  type StopReminderGateInput,
} from '../../src/driver-stop-reminders/domain/stop-reminder-gate.policy.js'

const TIME_ZONE = 'America/Sao_Paulo' // UTC-3, sem horário de verão desde 2019
// 2026-11-09 é segunda-feira (weekday 1, domingo = 0)
const WEEKDAYS = [1, 2, 3, 4, 5]
const businessHours = WEEKDAYS.map((weekday) => ({ weekday, start: '08:00', end: '18:00' }))

function gate(
  overrides: Partial<StopReminderGateInput> = {},
): ReturnType<typeof decideStopReminderGate> {
  return decideStopReminderGate({
    now: new Date('2026-11-09T15:00:00.000Z'), // segunda 12:00 local
    stage: 'arrival',
    stop: { hasArrived: false, isClosed: false },
    operatingHours: businessHours,
    holidayDates: [],
    timeZone: TIME_ZONE,
    hasOpenQuestion: false,
    sendSlotAt: undefined,
    ...overrides,
  })
}

describe('1. a parada ainda está na etapa', () => {
  test('arrival: segue sem chegada → envia', () => {
    expect(gate()).toEqual({ decision: 'send' })
  })

  test('arrival: a parada já registrou chegada → fecha', () => {
    expect(gate({ stop: { hasArrived: true, isClosed: false } })).toEqual({ decision: 'close' })
  })

  test('arrival: a parada já foi baixada → fecha', () => {
    expect(gate({ stop: { hasArrived: true, isClosed: true } })).toEqual({ decision: 'close' })
  })

  test('settlement: parada aberta (com chegada) → envia', () => {
    expect(gate({ stage: 'settlement', stop: { hasArrived: true, isClosed: false } })).toEqual({
      decision: 'send',
    })
  })

  test('settlement: parada fechada → fecha', () => {
    expect(gate({ stage: 'settlement', stop: { hasArrived: true, isClosed: true } })).toEqual({
      decision: 'close',
    })
  })

  test('a etapa vence todas as outras condições (fora do horário e pergunta aberta: fecha mesmo assim)', () => {
    expect(
      gate({
        now: new Date('2026-11-09T23:00:00.000Z'),
        stop: { hasArrived: true, isClosed: false },
        hasOpenQuestion: true,
      }),
    ).toEqual({ decision: 'close' })
  })
})

describe('2. horário de funcionamento no fuso da empresa', () => {
  test('dentro da faixa (12:00 local) envia', () => {
    expect(gate()).toEqual({ decision: 'send' })
  })

  test('antes de abrir adia para a abertura do mesmo dia: 07:30 local (10:30Z, que no UTC já estaria aberto) → 08:00 local', () => {
    expect(gate({ now: new Date('2026-11-09T10:30:00.000Z') })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-09T11:00:00.000Z'),
    })
  })

  test('início inclusivo: 08:00 local em ponto envia', () => {
    expect(gate({ now: new Date('2026-11-09T11:00:00.000Z') })).toEqual({ decision: 'send' })
  })

  test('17:59 local ainda envia; fim exclusivo: 18:00 local adia', () => {
    expect(gate({ now: new Date('2026-11-09T20:59:00.000Z') })).toEqual({ decision: 'send' })
    expect(gate({ now: new Date('2026-11-09T21:00:00.000Z') })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-10T11:00:00.000Z'),
    })
  })

  test('sexta à noite adia para segunda 08:00 local', () => {
    expect(gate({ now: new Date('2026-11-14T00:00:00.000Z') })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-16T11:00:00.000Z'),
    })
  })

  test('sábado (sem faixa) adia para segunda', () => {
    expect(gate({ now: new Date('2026-11-14T15:00:00.000Z') })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-16T11:00:00.000Z'),
    })
  })

  test('duas faixas no dia: no intervalo do almoço adia para a segunda faixa', () => {
    const lunchBreak = [
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 1, start: '14:00', end: '18:00' },
    ]
    expect(gate({ operatingHours: lunchBreak, now: new Date('2026-11-09T15:30:00.000Z') })).toEqual(
      {
        decision: 'defer',
        reason: 'outside_operating_hours',
        until: new Date('2026-11-09T17:00:00.000Z'),
      },
    )
  })

  test('feriado conta como fechado: dentro do horário num feriado adia para a próxima abertura', () => {
    expect(gate({ holidayDates: ['2026-11-09'] })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-10T11:00:00.000Z'),
    })
  })

  test('feriado no dia seguinte é pulado: segunda à noite adia para quarta 08:00 local', () => {
    expect(
      gate({ now: new Date('2026-11-10T01:00:00.000Z'), holidayDates: ['2026-11-10'] }),
    ).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-11T11:00:00.000Z'),
    })
  })

  test('o feriado é conferido na data local: 22:00 local de domingo (01:00Z de segunda) segue o domingo, não o feriado de segunda', () => {
    expect(
      gate({ now: new Date('2026-11-09T01:00:00.000Z'), holidayDates: ['2026-11-09'] }),
    ).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-10T11:00:00.000Z'),
    })
  })

  test('faixa vazia = sempre aberto, de madrugada e em sábado', () => {
    expect(gate({ operatingHours: [], now: new Date('2026-11-14T05:00:00.000Z') })).toEqual({
      decision: 'send',
    })
  })
})

describe('3. pergunta aberta do bot em qualquer fluxo', () => {
  test('com pergunta aberta adia 5 min, sem consumir tentativa', () => {
    expect(gate({ hasOpenQuestion: true })).toEqual({
      decision: 'defer',
      reason: 'open_question',
      until: new Date('2026-11-09T15:05:00.000Z'),
    })
  })

  test('fora do horário vence a pergunta aberta (a ordem do RF8)', () => {
    expect(gate({ now: new Date('2026-11-09T10:30:00.000Z'), hasOpenQuestion: true })).toEqual({
      decision: 'defer',
      reason: 'outside_operating_hours',
      until: new Date('2026-11-09T11:00:00.000Z'),
    })
  })
})

describe('4. vaga de envio do Evolution (289)', () => {
  const now = new Date('2026-11-09T15:00:00.000Z')

  test('sem vaga a esperar (conversa individual ou vaga livre) envia', () => {
    expect(gate({ sendSlotAt: undefined })).toEqual({ decision: 'send' })
    expect(gate({ sendSlotAt: now })).toEqual({ decision: 'send' })
  })

  test('vaga dentro da espera do worker (120 s) envia', () => {
    expect(gate({ sendSlotAt: new Date('2026-11-09T15:02:00.000Z') })).toEqual({ decision: 'send' })
  })

  test('vaga além da espera do worker adia exatamente para a vaga', () => {
    expect(gate({ sendSlotAt: new Date('2026-11-09T15:02:01.000Z') })).toEqual({
      decision: 'defer',
      reason: 'no_send_slot',
      until: new Date('2026-11-09T15:02:01.000Z'),
    })
  })

  test('pergunta aberta vence a vaga (a ordem do RF8)', () => {
    expect(
      gate({ hasOpenQuestion: true, sendSlotAt: new Date('2026-11-09T16:00:00.000Z') }),
    ).toEqual({
      decision: 'defer',
      reason: 'open_question',
      until: new Date('2026-11-09T15:05:00.000Z'),
    })
  })
})

describe('etapa idle (T2.7, RF22)', () => {
  const idle = { stage: 'idle' as const }

  test('parada ainda parada e sem evento → envia', () => {
    expect(
      gate({ ...idle, stop: { hasArrived: false, hasDeparted: false, isClosed: false } }),
    ).toEqual({
      decision: 'send',
    })
  })

  test.each([
    { hasArrived: false, hasDeparted: true, isClosed: false },
    { hasArrived: true, hasDeparted: false, isClosed: false },
    { hasArrived: true, hasDeparted: false, isClosed: true },
  ])('a parada já saiu, chegou ou fechou → fecha', (stop) => {
    expect(gate({ ...idle, stop })).toEqual({ decision: 'close' })
  })

  test('fora do horário e com pergunta aberta o idle espera como as outras etapas', () => {
    expect(gate({ ...idle, hasOpenQuestion: true })).toMatchObject({
      decision: 'defer',
      reason: 'open_question',
    })
    expect(gate({ ...idle, now: new Date('2026-11-09T03:00:00.000Z') })).toMatchObject({
      decision: 'defer',
      reason: 'outside_operating_hours',
    })
  })
})
