/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.2 (RF1–RF5, RNF2, casos extremos): evento da parada × lembretes abertos da viagem → o que abrir e
 * fechar. Pura: a ligação com a transação é da T1.4.
 */
import { describe, expect, test } from 'bun:test'

import {
  decideStopReminderTransition,
  type StopReminderEvent,
  type StopReminderOpen,
} from '../../src/driver-stop-reminders/domain/stop-reminder-transition.policy.js'

const STOP_A = 'stop-a'
const STOP_B = 'stop-b'

function event(
  overrides: Partial<StopReminderEvent> & Pick<StopReminderEvent, 'kind'>,
): StopReminderEvent {
  return {
    stopId: STOP_A,
    authorship: 'crew',
    recordedTogether: false,
    stopClosed: false,
    ...overrides,
  }
}

const openArrivalA: StopReminderOpen = { id: 'rem-arrival-a', stopId: STOP_A, stage: 'arrival' }
const openSettlementA: StopReminderOpen = {
  id: 'rem-settlement-a',
  stopId: STOP_A,
  stage: 'settlement',
}
const openArrivalB: StopReminderOpen = { id: 'rem-arrival-b', stopId: STOP_B, stage: 'arrival' }

describe('saída (RF1)', () => {
  test('departed abre a etapa arrival da parada', () => {
    expect(
      decideStopReminderTransition({ event: event({ kind: 'departed' }), openReminders: [] }),
    ).toEqual([{ type: 'open', stopId: STOP_A, stage: 'arrival' }])
  })

  test('departed marcada junto pela 294 também abre', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'departed', recordedTogether: true }),
        openReminders: [],
      }),
    ).toEqual([{ type: 'open', stopId: STOP_A, stage: 'arrival' }])
  })

  test('departure_cancelled cancela o lembrete aberto da parada e não abre nada', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'departure_cancelled' }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([{ type: 'close', reminderId: 'rem-arrival-a', reason: 'departure_cancelled' }])
  })

  test('departure_cancelled sem lembrete aberto não faz nada', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'departure_cancelled' }),
        openReminders: [],
      }),
    ).toEqual([])
  })

  test('saída de outra parada substitui o lembrete da parada abandonada e abre o novo', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'departed', stopId: STOP_B }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([
      { type: 'close', reminderId: 'rem-arrival-a', reason: 'superseded' },
      { type: 'open', stopId: STOP_B, stage: 'arrival' },
    ])
  })

  test('saída repetida (arrival já aberta) não abre outro: um por parada e etapa', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'departed' }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([])
  })

  test('saída (sair e voltar, cancelamento antes) abre de novo quando não há lembrete aberto', () => {
    expect(
      decideStopReminderTransition({ event: event({ kind: 'departed' }), openReminders: [] }),
    ).toEqual([{ type: 'open', stopId: STOP_A, stage: 'arrival' }])
  })
})

describe('chegada (RF2)', () => {
  test('arrived fecha arrival (closed_by arrived) e abre settlement', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'arrived' }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([
      { type: 'close', reminderId: 'rem-arrival-a', reason: 'arrived' },
      { type: 'open', stopId: STOP_A, stage: 'settlement' },
    ])
  })

  test('arrived sem arrival aberta (ninguém saiu pelo sistema) ainda abre settlement', () => {
    expect(
      decideStopReminderTransition({ event: event({ kind: 'arrived' }), openReminders: [] }),
    ).toEqual([{ type: 'open', stopId: STOP_A, stage: 'settlement' }])
  })

  test('arrived marcada junto com a baixa fecha arrival e NÃO abre settlement', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'arrived', recordedTogether: true }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([{ type: 'close', reminderId: 'rem-arrival-a', reason: 'arrived' }])
  })

  test('arrived repetida (settlement já aberto, arrival já fechada) não faz nada', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'arrived' }),
        openReminders: [openSettlementA],
      }),
    ).toEqual([])
  })
})

describe('baixa, ocorrência e fim da viagem (RF3)', () => {
  test.each(['delivered', 'returned'] as const)(
    '%s que fecha a parada fecha todo lembrete dela, sem envio',
    (kind) => {
      expect(
        decideStopReminderTransition({
          event: event({ kind, stopClosed: true }),
          openReminders: [openSettlementA, openArrivalB],
        }),
      ).toEqual([{ type: 'close', reminderId: 'rem-settlement-a', reason: 'stop_closed' }])
    },
  )

  test.each(['delivered', 'returned'] as const)(
    '%s que NÃO fecha a parada (restam notas) mantém o lembrete',
    (kind) => {
      expect(
        decideStopReminderTransition({
          event: event({ kind, stopClosed: false }),
          openReminders: [openSettlementA],
        }),
      ).toEqual([])
    },
  )

  test.each(['delivered', 'returned'] as const)(
    '%s que NÃO fecha a parada já não deixa a chegada aberta: quem baixa não está a caminho',
    (kind) => {
      expect(
        decideStopReminderTransition({
          event: event({ kind, stopClosed: false }),
          openReminders: [openArrivalA, openSettlementA, openArrivalB],
        }),
      ).toEqual([{ type: 'close', reminderId: 'rem-arrival-a', reason: 'arrived' }])
    },
  )

  test('ocorrência na parada (ou numa nota dela) fecha com closed_by occurrence', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'occurrence' }),
        openReminders: [openArrivalA, openArrivalB],
      }),
    ).toEqual([{ type: 'close', reminderId: 'rem-arrival-a', reason: 'occurrence' }])
  })

  test('ocorrência sem lembrete aberto não faz nada', () => {
    expect(
      decideStopReminderTransition({ event: event({ kind: 'occurrence' }), openReminders: [] }),
    ).toEqual([])
  })

  test('encerrar a viagem fecha o lembrete de todas as paradas', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'trip_closed' }),
        openReminders: [openSettlementA, openArrivalB],
      }),
    ).toEqual([
      { type: 'close', reminderId: 'rem-settlement-a', reason: 'trip_closed' },
      { type: 'close', reminderId: 'rem-arrival-b', reason: 'trip_closed' },
    ])
  })

  test('cancelar a viagem fecha o lembrete de todas as paradas', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'trip_cancelled' }),
        openReminders: [openArrivalA, openArrivalB],
      }),
    ).toEqual([
      { type: 'close', reminderId: 'rem-arrival-a', reason: 'trip_cancelled' },
      { type: 'close', reminderId: 'rem-arrival-b', reason: 'trip_cancelled' },
    ])
  })
})

describe('autoria (RF5, Q2)', () => {
  test('escritório que sai, chega ou dá baixa se comporta como a tripulação', () => {
    const decide = (
      overrides: Partial<StopReminderEvent> & Pick<StopReminderEvent, 'kind'>,
      open: StopReminderOpen[],
    ) => ({
      office: decideStopReminderTransition({
        event: event({ ...overrides, authorship: 'office' }),
        openReminders: open,
      }),
      crew: decideStopReminderTransition({
        event: event({ ...overrides, authorship: 'crew' }),
        openReminders: open,
      }),
    })

    for (const scenario of [
      decide({ kind: 'departed' }, []),
      decide({ kind: 'arrived' }, [openArrivalA]),
      decide({ kind: 'delivered', stopClosed: true }, [openSettlementA]),
    ]) {
      expect(scenario.office).toEqual(scenario.crew)
    }
  })

  test('chegada do escritório abre settlement (Q2)', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'arrived', authorship: 'office' }),
        openReminders: [openArrivalA],
      }),
    ).toEqual([
      { type: 'close', reminderId: 'rem-arrival-a', reason: 'arrived' },
      { type: 'open', stopId: STOP_A, stage: 'settlement' },
    ])
  })

  test('baixa do escritório fecha o lembrete', () => {
    expect(
      decideStopReminderTransition({
        event: event({ kind: 'returned', authorship: 'office', stopClosed: true }),
        openReminders: [openSettlementA],
      }),
    ).toEqual([{ type: 'close', reminderId: 'rem-settlement-a', reason: 'stop_closed' }])
  })
})
