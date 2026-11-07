/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T12: "saí" e "cheguei" no grupo do motorista (direto e pelo menu) e o interpretador
 * compartilhado com a conversa individual.
 */
import { describe, expect, test } from 'bun:test'

import {
  interpretDriverStopCommand,
  WHATSAPP_DRIVER_STOP_COMMAND,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import {
  createGroupDriverFlow,
  GROUP_DRIVER_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
  GroupRequestFlow,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createGroupStopFlow,
  GROUP_STOP_TEXT,
  type GroupStopCandidate,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

const stop = (
  id: string,
  sequence: number,
  numbers: string[],
  extra: Partial<GroupStopCandidate> = {},
): GroupStopCandidate => ({
  arrivedAt: null,
  completedAt: null,
  documents: numbers.map((number) => ({ number, separationStatus: 'loaded' })),
  enRouteSince: null,
  id,
  sequence,
  ...extra,
})

function setup(stops: readonly GroupStopCandidate[]) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const ports: GroupStopFlowPorts = {
    async enRouteMessage({ sequence }) {
      return `a caminho ${sequence}`
    },
    async listStops() {
      return stops
    },
    async record(input) {
      recorded.push(input)
      return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
    },
  }
  const occurrenceCalls: string[] = []
  const occurrence: GroupRequestFlow = {
    answer: async () => ({ kind: 'done', replies: ['occ-answer'] }),
    initialStep: 'start',
    start: async (turn) => {
      occurrenceCalls.push(turn.text)
      return { kind: 'done', replies: ['occ-start'] }
    },
  }
  const flow = createGroupDriverFlow({ occurrence, stop: createGroupStopFlow(ports) })
  let request: GroupRequest = {
    attempts: 0,
    companyId: 'C',
    driverId: 'D',
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: '5516',
    state: {},
    step: flow.initialStep,
    version: 1n,
  }
  const turn = (text: string) => ({ request, sender: '5516', senderName: null, text })
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue')
      request = { ...request, state: outcome.state, step: outcome.step }
    return outcome
  }
  return {
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    occurrenceCalls,
    recorded,
    start: async (text: string) => follow(await flow.start(turn(text))),
  }
}

describe('interpretDriverStopCommand', () => {
  test('reconhece saí e cheguei, com ou sem acento', () => {
    expect(interpretDriverStopCommand('cheguei')?.event).toBe(WHATSAPP_DRIVER_STOP_COMMAND.arrive)
    expect(interpretDriverStopCommand('Saí')?.event).toBe(WHATSAPP_DRIVER_STOP_COMMAND.depart)
    expect(interpretDriverStopCommand('sai para a entrega')?.event).toBe('depart')
    expect(interpretDriverStopCommand('iniciar rota')?.event).toBe('depart')
  })
  test('"acabei de chegar" é cheguei; "vou chegar" e "chegar" sozinho não são', () => {
    expect(interpretDriverStopCommand('Acabei de chegar')?.event).toBe('arrive')
    expect(interpretDriverStopCommand('acabamos de chegar na entrega')?.event).toBe('arrive')
    expect(interpretDriverStopCommand('acabei de chegar 17234')).toEqual({
      documentNumbers: ['17234'],
      event: 'arrive',
    })
    expect(interpretDriverStopCommand('vou chegar')).toBeNull()
    expect(interpretDriverStopCommand('chegar')).toBeNull()
    expect(interpretDriverStopCommand('acabei de sair')).toBeNull()
  })
  test('número de nota vira pista da parada', () => {
    expect(interpretDriverStopCommand('cheguei NF 000017234')).toEqual({
      documentNumbers: ['17234'],
      event: 'arrive',
    })
  })
  test('frase longa ou ambígua é ocorrência, não comando', () => {
    expect(
      interpretDriverStopCommand('cliente fechado quando cheguei e ninguém atendeu'),
    ).toBeNull()
    expect(interpretDriverStopCommand('cheguei e sai')).toBeNull()
    expect(interpretDriverStopCommand('prorrogação do boleto 17234')).toBeNull()
    expect(interpretDriverStopCommand('')).toBeNull()
  })
})

describe('grupo: saí e cheguei', () => {
  test('a lista de escolha traz o cliente junto da nota (spec 294 RF17)', async () => {
    const named = (id: string, sequence: number, number: string, recipientName: string) =>
      stop(id, sequence, [], {
        documents: [{ number, recipientName, separationStatus: 'loaded' }],
      })
    const t = setup([
      named('S1', 1, '17234', 'Padaria Sol'),
      named('S2', 2, '17235', 'Mercado Lua'),
    ])
    const asked = await t.start('cheguei')
    expect(asked).toMatchObject({ kind: 'continue' })
    const text = asked.kind === 'continue' ? asked.replies.join('\n') : ''
    expect(text).toContain('*1* - NF 17234 · Padaria Sol')
    expect(text).toContain('*2* - NF 17235 · Mercado Lua')
  })

  test('cheguei com uma parada só registra direto', async () => {
    const t = setup([stop('S1', 1, ['17234'])])
    expect(await t.start('cheguei')).toEqual({
      kind: 'done',
      replies: ['Chegada registrada.'],
      withoutFarewell: true,
    })
    expect(t.recorded).toEqual([
      {
        companyId: 'C',
        documentNumber: '17234',
        driverId: 'D',
        event: 'arrive',
        idempotencyKey: 'whatsapp-group-request:R1',
        stopId: 'S1',
      },
    ])
  })

  test('saí com uma parada a caminho diz que a saída já foi registrada e oferece o que cabe', async () => {
    const t = setup([
      stop('S1', 3, ['1'], { enRouteSince: '2026-11-06T13:05:00.000Z' }),
      stop('S2', 4, ['2']),
    ])
    expect(await t.start('saí')).toEqual({
      kind: 'continue',
      replies: [
        [
          '⚠️ *A saída para esta parada já foi registrada* às 10:05.',
          '*Parada 3*',
          '*NF 1*',
          '',
          '*O que você quer fazer agora?*',
          '*1* - Cheguei',
          '*2* - Abrir ocorrência',
          '*3* - Nada por enquanto',
        ].join('\n'),
      ],
      state: {
        journeyActions: [
          { documentNumber: '1', kind: 'arrive', stopId: 'S1' },
          { documentNumber: '1', kind: 'occurrence' },
          { kind: 'none' },
        ],
      },
      step: 'journey.actions',
    })
    expect(t.recorded).toEqual([])
  })

  test('sem parada pendente avisa', async () => {
    const t = setup([])
    expect(await t.start('cheguei')).toEqual({
      kind: 'done',
      replies: [GROUP_STOP_TEXT.noStopArrive],
    })
  })

  test('várias paradas: lista, e a resposta pelo número da opção registra', async () => {
    const t = setup([stop('S1', 1, ['17234', '17235']), stop('S2', 2, ['900'])])
    const first = await t.start('saí')
    expect(first).toMatchObject({ kind: 'continue', step: 'stop.choose' })
    expect((first as Extract<GroupFlowOutcome, { kind: 'continue' }>).replies[0]).toContain(
      '*1* - NF 17234 e mais 1',
    )
    expect(await t.answer('2')).toEqual({
      kind: 'done',
      replies: ['Saída registrada.'],
      withoutFarewell: true,
    })
    expect(t.recorded[0]?.stopId).toBe('S2')
  })

  test('várias paradas: o número da nota no comando escolhe sozinho', async () => {
    const t = setup([stop('S1', 1, ['17234']), stop('S2', 2, ['900'])])
    expect(await t.start('cheguei 900')).toEqual({
      kind: 'done',
      replies: ['Chegada registrada.'],
      withoutFarewell: true,
    })
    expect(t.recorded[0]?.stopId).toBe('S2')
  })

  test('resposta fora da lista não registra e pede de novo', async () => {
    const t = setup([stop('S1', 1, ['17234']), stop('S2', 2, ['900'])])
    await t.start('saí')
    expect(await t.answer('talvez')).toMatchObject({ kind: 'not_understood' })
    expect(t.recorded).toEqual([])
  })

  test('@bot sozinho lista o menu; a opção 2 é cheguei', async () => {
    const t = setup([stop('S1', 1, ['17234'])])
    expect(await t.start('')).toMatchObject({
      kind: 'continue',
      replies: [GROUP_DRIVER_TEXT.menuWithoutDelivery],
      step: 'menu',
    })
    expect(await t.answer('2')).toEqual({
      kind: 'done',
      replies: ['Chegada registrada.'],
      withoutFarewell: true,
    })
  })

  test('menu: ocorrência vai ao fluxo de ocorrência; opção inválida repete o menu', async () => {
    const t = setup([])
    await t.start('')
    expect(await t.answer('9')).toMatchObject({ kind: 'not_understood' })
    expect(await t.answer('ocorrência')).toEqual({ kind: 'done', replies: ['occ-start'] })
  })

  test('menu: a frase inteira (texto ou áudio confirmado) vale como pedido direto', async () => {
    const t = setup([])
    await t.start('')
    expect(await t.answer('ocorrência, prorrogação do boleto da nota 899877')).toEqual({
      kind: 'done',
      replies: ['occ-start'],
    })
    expect(t.occurrenceCalls).toEqual(['ocorrência, prorrogação do boleto da nota 899877'])
  })

  test('menu: conversa solta não abre ocorrência; repete o menu e a opção seguinte vale', async () => {
    const t = setup([stop('S1', 1, ['17234'])])
    await t.start('')
    expect(await t.answer('Acabei de chegar já vou fazer aqui')).toEqual({
      kind: 'not_understood',
      prompt: [
        '*1* - 🚚 Saí para a entrega',
        '*2* - 📍 Cheguei',
        '*3* - ↩️ Não entreguei',
        '*4* - ⚠️ Ocorrência',
      ].join('\n'),
      reason: 'Responda com o número da opção:',
    })
    expect(t.occurrenceCalls).toEqual([])
    expect(await t.answer('2')).toEqual({
      kind: 'done',
      replies: ['Chegada registrada.'],
      withoutFarewell: true,
    })
  })

  test('menu: frase com número de nota ainda vale como pedido direto', async () => {
    const t = setup([])
    await t.start('')
    expect(await t.answer('prorrogação do boleto 899877')).toEqual({
      kind: 'done',
      replies: ['occ-start'],
    })
    expect(t.occurrenceCalls).toEqual(['prorrogação do boleto 899877'])
  })

  test('menu: "acabei de chegar" escolhe cheguei', async () => {
    const t = setup([stop('S1', 1, ['17234'])])
    await t.start('')
    expect(await t.answer('acabei de chegar')).toEqual({
      kind: 'done',
      replies: ['Chegada registrada.'],
      withoutFarewell: true,
    })
    expect(t.occurrenceCalls).toEqual([])
  })

  test('o que não é comando segue para a ocorrência com o texto original', async () => {
    const t = setup([])
    await t.start('prorrogação do boleto 17234')
    expect(t.occurrenceCalls).toEqual(['prorrogação do boleto 17234'])
  })
})
