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
  capStopReminderBody,
  decideStopReminderPostponement,
  shortenStopBlock,
  resolveStopReminderChoice,
  type StopReminderMessageInput,
} from '../../src/driver-stop-reminders/domain/stop-reminder-message.policy.js'

const STOP_BLOCK = '*Parada 2 de 5*\n*NF 17234* · R$ 1.234,56\n🏪 *Mercado Central*'
const TIME_ZONE = 'America/Sao_Paulo'
const DEPARTED_AT = new Date('2026-11-09T17:05:00.000Z') // 14:05 local
const EXPECTED_AT = new Date('2026-11-09T17:40:00.000Z') // 14:40 local
const ARRIVED_AT = new Date('2026-11-09T17:41:00.000Z') // 14:41 local
const NOW = new Date('2026-11-09T18:00:00.000Z') // 15:00 local, o mesmo dia

function input(overrides: Partial<StopReminderMessageInput> = {}): StopReminderMessageInput {
  return {
    stage: 'arrival',
    driverName: 'Carlos',
    stopBlock: STOP_BLOCK,
    departedAt: DEPARTED_AT,
    expectedAt: EXPECTED_AT,
    arrivedAt: undefined,
    isSharedPoint: true,
    now: NOW,
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
      idleStart: 'fala_lembrete_sem_evento_inicio',
      idleRoute: 'fala_lembrete_sem_evento_rota',
    })
  })
})

describe('etapa arrival (RF9)', () => {
  test('com ponto compartilhado: nó com previsão, hora de saída e chegada prevista no fuso da empresa', () => {
    const message = buildStopReminderMessage(input())
    expect(message.nodeKey).toBe('fala_lembrete_chegada')
    expect(message.variables).toEqual({
      nome: 'Carlos',
      blocoParada: STOP_BLOCK,
      saida: '14:05',
      saidaQuando: 'às *14:05*',
      previsao: '14:40',
    })
  })

  test('sem ponto compartilhado a linha da previsão some (RF6): outro nó e nenhuma variável de previsão', () => {
    const message = buildStopReminderMessage(input({ isSharedPoint: false }))
    expect(message.nodeKey).toBe('fala_lembrete_chegada_sem_previsao')
    expect(message.variables).toEqual({
      nome: 'Carlos',
      blocoParada: STOP_BLOCK,
      saida: '14:05',
      saidaQuando: 'às *14:05*',
    })
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
      blocoParada: STOP_BLOCK,
      chegada: '14:41',
      chegadaQuando: 'às *14:41*',
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
})

describe('quando foi a saída ou a chegada, no dia local da empresa (spec 299, dono 2026-11-07)', () => {
  const when = (departedAt: string, now: string) =>
    buildStopReminderMessage(input({ departedAt: new Date(departedAt), now: new Date(now) }))
      .variables.saidaQuando

  test('no mesmo dia local: só a hora', () => {
    expect(when('2026-11-09T03:00:00.000Z', '2026-11-10T02:59:59.000Z')).toBe('às *00:00*')
  })

  test('no dia local anterior: "ontem" — a virada da meia-noite é a de São Paulo, não a UTC', () => {
    expect(when('2026-11-10T02:59:00.000Z', '2026-11-10T03:00:00.000Z')).toBe('*ontem* às *23:59*')
    expect(when('2026-11-09T03:00:00.000Z', '2026-11-10T14:00:00.000Z')).toBe('*ontem* às *00:00*')
  })

  test('mais antigo: dia e mês', () => {
    expect(when('2026-11-06T22:01:00.000Z', '2026-11-09T12:00:00.000Z')).toBe(
      'em *06/11* às *19:01*',
    )
    expect(when('2026-11-08T02:59:00.000Z', '2026-11-10T12:00:00.000Z')).toBe(
      'em *07/11* às *23:59*',
    )
  })

  test('a chegada segue a mesma regra', () => {
    const message = buildStopReminderMessage(
      input({
        arrivedAt: new Date('2026-11-08T13:00:00.000Z'),
        departedAt: undefined,
        expectedAt: undefined,
        isSharedPoint: false,
        now: NOW,
        stage: 'settlement',
      }),
    )
    expect(message.variables.chegadaQuando).toBe('*ontem* às *10:00*')
  })
})

describe('bloco da parada (spec 299, dono 2026-11-07)', () => {
  test('o bloco pronto vai na variável blocoParada, sem reescrever nada', () => {
    const block = '*Parada 1*\n📍 Rua A'
    expect(buildStopReminderMessage(input({ stopBlock: block })).variables.blocoParada).toBe(block)
    expect(
      buildStopReminderMessage(input({ stage: 'settlement', stopBlock: block })).variables
        .blocoParada,
    ).toBe(block)
  })

  test('a variável antiga "parada" não existe mais', () => {
    expect(buildStopReminderMessage(input()).variables).not.toHaveProperty('parada')
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

function hasBalancedMarkup(text: string): boolean {
  return ['*', '_', '~'].every((marker) => text.split(marker).length % 2 === 1)
}

describe('corte do limite de 4000 (spec 299, revisão PR 570 M2)', () => {
  test('o corte cai no meio de um emoji: nunca deixa meio par substituto', () => {
    const block = `*Parada 1*\n${'😀'.repeat(20)}`
    const shortened = shortenStopBlock({ excess: 5, stopBlock: block })
    expect(shortened.isWellFormed()).toBe(true)
    expect(shortened.endsWith('…')).toBe(true)
  })

  test('o corte cai dentro de uma marcação: não sobra `*`, `_` ou `~` aberto', () => {
    const block = '*Parada 2 de 5*\n*NF 1 · NF 2 · NF 3 · NF 4*'
    for (let excess = 1; excess < 24; excess += 1) {
      const shortened = shortenStopBlock({ excess, stopBlock: block })
      expect(hasBalancedMarkup(shortened)).toBe(true)
    }
    expect(
      hasBalancedMarkup(shortenStopBlock({ excess: 6, stopBlock: '_nota longa demais_' })),
    ).toBe(true)
  })

  test('o excesso maior que a linha mais longa ainda devolve texto bem formado', () => {
    const shortened = shortenStopBlock({ excess: 500, stopBlock: '*Parada*\n*NF 1*' })
    expect(shortened.isWellFormed()).toBe(true)
    expect(shortened.length).toBeLessThanOrEqual('*Parada*\n*NF 1*'.length)
  })

  test('o teto final garante o corpo dentro do limite, por pontos de código e com marcação fechada', () => {
    const body = `*Oi*\n${'😀'.repeat(3000)}*fim*`
    const capped = capStopReminderBody({ body, limit: 4000 })
    expect(capped.length).toBeLessThanOrEqual(4000)
    expect(capped.isWellFormed()).toBe(true)
    expect(hasBalancedMarkup(capped)).toBe(true)
    expect(capStopReminderBody({ body: 'curto', limit: 4000 })).toBe('curto')
  })
})

describe('instante no futuro por desvio de relógio (spec 299, revisão PR 570 L3)', () => {
  test('saída marcada à frente do servidor conta como hoje, nunca "em dd/mm"', () => {
    const message = buildStopReminderMessage(
      input({ departedAt: new Date(NOW.getTime() + 2 * 86_400_000) }),
    )
    expect(message.variables.saidaQuando).toMatch(/^às \*\d{2}:\d{2}\*$/u)
  })
})

describe('etapa idle (T2.7, RF23, RF24)', () => {
  test('variante A (viagem sem evento): nó de início, nome e bloco, três opções', () => {
    const message = buildStopReminderMessage(input({ stage: 'idle', idleVariant: 'start' }))
    expect(message.nodeKey).toBe('fala_lembrete_sem_evento_inicio')
    expect(message.variables).toEqual({ nome: 'Carlos', blocoParada: STOP_BLOCK })
    expect(message.options).toEqual([
      { choice: '1', action: 'departed' },
      { choice: '2', action: 'choose_stop' },
      { choice: '3', action: 'postpone' },
    ])
  })

  test('variante B (rota em andamento): nó da rota, cinco opções', () => {
    const message = buildStopReminderMessage(input({ stage: 'idle', idleVariant: 'route' }))
    expect(message.nodeKey).toBe('fala_lembrete_sem_evento_rota')
    expect(message.variables).toEqual({ nome: 'Carlos', blocoParada: STOP_BLOCK })
    expect(message.options).toEqual([
      { choice: '1', action: 'departed' },
      { choice: '2', action: 'arrived' },
      { choice: '3', action: 'delivered' },
      { choice: '4', action: 'occurrence' },
      { choice: '5', action: 'postpone' },
    ])
  })

  test('a opção numerada resolve pela variante, e fora do cardápio é indefinida', () => {
    expect(resolveStopReminderChoice({ stage: 'idle', idleVariant: 'start', choice: 2 })).toBe(
      'choose_stop',
    )
    expect(
      resolveStopReminderChoice({ stage: 'idle', idleVariant: 'start', choice: 4 }),
    ).toBeUndefined()
    expect(resolveStopReminderChoice({ stage: 'idle', idleVariant: 'route', choice: 5 })).toBe(
      'postpone',
    )
  })
})
