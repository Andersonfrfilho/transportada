/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.2 (RF9, RF10, RF11, RF13): a política devolve a CHAVE do nó fala_lembrete_* e as variáveis — nunca o
 * texto final (a regra da 286 reprova literal; o texto mora no grafo raiz). Horas no fuso da empresa.
 */
import { describe, expect, test } from 'bun:test'

import { DRIVER_STOP_REMINDER_SPEECH_NODE } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import {
  buildStopReminderMessage,
  decideStopReminderPostponement,
  type StopReminderMessageInput,
} from '../../src/driver-stop-reminders/domain/stop-reminder-message.policy.js'

const TIME_ZONE = 'America/Sao_Paulo'
const DEPARTED_AT = new Date('2026-11-09T17:05:00.000Z') // 14:05 local
const EXPECTED_AT = new Date('2026-11-09T17:40:00.000Z') // 14:40 local
const ARRIVED_AT = new Date('2026-11-09T17:41:00.000Z') // 14:41 local

function input(overrides: Partial<StopReminderMessageInput> = {}): StopReminderMessageInput {
  return {
    stage: 'arrival',
    driverName: 'Carlos',
    stop: { firstNoteNumber: '17234', noteCount: 1, clientName: 'Mercado Central' },
    departedAt: DEPARTED_AT,
    expectedAt: EXPECTED_AT,
    arrivedAt: undefined,
    isSharedPoint: true,
    timeZone: TIME_ZONE,
    ...overrides,
  }
}

describe('nós de fala (chaves, nunca texto)', () => {
  test('as chaves escolhidas são fala_lembrete_*', () => {
    expect(DRIVER_STOP_REMINDER_SPEECH_NODE).toEqual({
      arrival: 'fala_lembrete_chegada',
      arrivalWithoutEstimate: 'fala_lembrete_chegada_sem_previsao',
      settlement: 'fala_lembrete_entrega',
    })
  })
})

describe('etapa arrival (RF9)', () => {
  test('com ponto compartilhado: nó com previsão, hora de saída e chegada prevista no fuso da empresa', () => {
    const message = buildStopReminderMessage(input())
    expect(message.nodeKey).toBe('fala_lembrete_chegada')
    expect(message.variables).toEqual({
      nome: 'Carlos',
      parada: 'NF 17234 · Mercado Central',
      saida: '14:05',
      previsao: '14:40',
    })
  })

  test('sem ponto compartilhado a linha da previsão some (RF6): outro nó e nenhuma variável de previsão', () => {
    const message = buildStopReminderMessage(input({ isSharedPoint: false }))
    expect(message.nodeKey).toBe('fala_lembrete_chegada_sem_previsao')
    expect(message.variables).toEqual({
      nome: 'Carlos',
      parada: 'NF 17234 · Mercado Central',
      saida: '14:05',
    })
  })

  test('parada com várias notas mostra a primeira e "+N" (N = restantes)', () => {
    const message = buildStopReminderMessage(
      input({ stop: { firstNoteNumber: '17234', noteCount: 3, clientName: 'Mercado Central' } }),
    )
    expect(message.variables.parada).toBe('NF 17234 +2 · Mercado Central')
  })

  test('opções: 1 Cheguei, 2 Já entreguei, 3 Tive um problema, 4 Ainda a caminho', () => {
    expect(buildStopReminderMessage(input()).options).toEqual([
      { choice: '1', action: 'arrived' },
      { choice: '2', action: 'delivered' },
      { choice: '3', action: 'occurrence' },
      { choice: '4', action: 'postpone' },
    ])
  })

  test('as opções não dependem de a previsão aparecer', () => {
    expect(
      buildStopReminderMessage(input({ isSharedPoint: false })).options.map(
        (option) => option.action,
      ),
    ).toEqual(['arrived', 'delivered', 'occurrence', 'postpone'])
  })
})

describe('etapa settlement (RF10)', () => {
  const settlementInput = input({
    stage: 'settlement',
    arrivedAt: ARRIVED_AT,
    departedAt: undefined,
    expectedAt: undefined,
    isSharedPoint: false,
  })

  test('nó de entrega com a hora da chegada, sem linha de previsão', () => {
    const message = buildStopReminderMessage(settlementInput)
    expect(message.nodeKey).toBe('fala_lembrete_entrega')
    expect(message.variables).toEqual({
      nome: 'Carlos',
      parada: 'NF 17234 · Mercado Central',
      chegada: '14:41',
    })
  })

  test('a previsão não aparece no settlement mesmo com ponto compartilhado na saída', () => {
    const message = buildStopReminderMessage({
      ...settlementInput,
      isSharedPoint: true,
      expectedAt: EXPECTED_AT,
    })
    expect(message.variables).not.toHaveProperty('previsao')
    expect(message.nodeKey).toBe('fala_lembrete_entrega')
  })

  test('opções: 1 Entreguei, 2 Não entreguei, 3 Tive um problema, 4 Ainda descarregando', () => {
    expect(buildStopReminderMessage(settlementInput).options).toEqual([
      { choice: '1', action: 'delivered' },
      { choice: '2', action: 'not_delivered' },
      { choice: '3', action: 'occurrence' },
      { choice: '4', action: 'postpone' },
    ])
  })

  test('várias notas: primeira e "+N" também aqui', () => {
    const message = buildStopReminderMessage({
      ...settlementInput,
      stop: { firstNoteNumber: '900', noteCount: 2, clientName: 'Padaria Sol' },
    })
    expect(message.variables.parada).toBe('NF 900 +1 · Padaria Sol')
  })
})

describe('opção 4 adia sem consumir tentativa, até 3 por etapa (RF13)', () => {
  test.each([0, 1, 2])(
    'com %i adiamentos já feitos adia e soma um, sem consumir tentativa',
    (postponements) => {
      expect(decideStopReminderPostponement({ postponements })).toEqual({
        outcome: 'postponed',
        postponements: postponements + 1,
        consumesAttempt: false,
      })
    },
  )

  test('esgotados os 3 adiamentos a opção 4 conta como sem resposta (segue para as tentativas e a escalada)', () => {
    expect(decideStopReminderPostponement({ postponements: 3 })).toEqual({
      outcome: 'no_answer',
      postponements: 3,
      consumesAttempt: true,
    })
    expect(decideStopReminderPostponement({ postponements: 5 }).outcome).toBe('no_answer')
  })
})
