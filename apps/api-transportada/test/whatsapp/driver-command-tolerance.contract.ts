/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O comando do motorista tolera erro de digitação e variação ("sai apra entrega", "chegei",
 * "entregei"), sem deixar frase longa virar comando.
 */
import { describe, expect, test } from 'bun:test'

import { interpretDriverStopCommand } from '../../src/whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import { interpretWhatsAppDriverEventCommand } from '../../src/whatsapp-commands/domain/whatsapp-driver-event-command.policy.js'
import { interpretCloseTripCommand } from '../../src/whatsapp-commands/domain/whatsapp-trip-close-command.policy.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupRequest,
  GroupRequestFlow,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

const DEPART_VARIANTS = [
  'sai',
  'saí',
  'saindo',
  'to saindo',
  'estou saindo',
  'sai pra entrega',
  'sai p entrega',
  'sai apra entrega',
  'sai para a entrega',
  'sai para entrega',
  'saí pra rota',
  'iniciar rota',
  'inicia rota',
  'sai apra entrga',
  'Saí para a entrega!',
]
const ARRIVE_VARIANTS = ['cheguei', 'chegei', 'chegamos', 'cheguei no cliente', 'chegeui']
const NOT_COMMANDS = [
  'o motorista saiu da empresa ontem',
  'cliente fechado quando cheguei e ninguém atendeu',
  'cheguei e sai',
  'sair',
  'prorrogação do boleto 17234',
]

describe('interpretDriverStopCommand: tolerância', () => {
  test.each(DEPART_VARIANTS)('"%s" é saída', (text) => {
    expect(interpretDriverStopCommand(text)?.event).toBe('depart')
  })
  test.each(ARRIVE_VARIANTS)('"%s" é chegada', (text) => {
    expect(interpretDriverStopCommand(text)?.event).toBe('arrive')
  })
  test.each(NOT_COMMANDS)('"%s" não é comando', (text) => {
    expect(interpretDriverStopCommand(text)).toBeNull()
  })
  test('a nota continua sendo extraída', () => {
    expect(interpretDriverStopCommand('chegei 17234')).toEqual({
      documentNumbers: ['17234'],
      event: 'arrive',
    })
  })
})

describe('entrega e encerrar rota: tolerância', () => {
  test.each(['entreguei', 'entregei', 'entregue', 'entreguei 17234'])('"%s" é entrega', (text) => {
    expect(interpretWhatsAppDriverEventCommand(text)?.kind).toBe('deliver')
  })
  test('número da nota segue extraído', () => {
    expect(interpretWhatsAppDriverEventCommand('entregei 17234')).toEqual({
      kind: 'deliver',
      numbers: ['17234'],
    })
  })
  test.each(['encerrar a rota', 'encerar a rota', 'fechar viagem', 'finalizar rota'])(
    '"%s" encerra a viagem',
    (text) => {
      expect(interpretCloseTripCommand(text)).not.toBeNull()
    },
  )
  test('"fechado a rota" não encerra', () => {
    expect(interpretCloseTripCommand('cliente fechou rota')).toBeNull()
  })
})

describe('grupo: texto do motorista', () => {
  function setup() {
    const recorded: unknown[] = []
    const occurrenceCalls: string[] = []
    const occurrence: GroupRequestFlow = {
      answer: async () => ({ kind: 'done', replies: ['occ-answer'] }),
      initialStep: 'start',
      start: async (turn) => {
        occurrenceCalls.push(turn.text)
        return { kind: 'done', replies: ['occ-start'] }
      },
    }
    const stop = createGroupStopFlow({
      async enRouteMessage() {
        return 'a caminho'
      },
      async listStops() {
        return [
          {
            arrivedAt: null,
            completedAt: null,
            documents: [{ number: '17234', separationStatus: 'loaded' }],
            enRouteSince: null,
            id: 'S1',
            sequence: 1,
          },
        ]
      },
      async record(input) {
        recorded.push(input)
        return { message: 'Saída registrada.' }
      },
    })
    const flow = createGroupDriverFlow({ occurrence, stop })
    const request: GroupRequest = {
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
    return {
      occurrenceCalls,
      recorded,
      start: (text: string) => flow.start({ request, sender: '5516', senderName: null, text }),
    }
  }

  test('"sai apra entrega" abre a saída, não a ocorrência', async () => {
    const t = setup()
    const outcome = await t.start('sai apra entrega')
    expect(t.occurrenceCalls).toEqual([])
    expect(t.recorded).toHaveLength(1)
    expect(outcome.kind).toBe('done')
  })

  test('texto livre que não é comando segue para a ocorrência (regra da spec 292)', async () => {
    const t = setup()
    await t.start('o motorista saiu da empresa ontem')
    expect(t.occurrenceCalls).toEqual(['o motorista saiu da empresa ontem'])
    expect(t.recorded).toHaveLength(0)
  })
})
