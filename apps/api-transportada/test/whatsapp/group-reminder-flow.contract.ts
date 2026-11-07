/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 (RF11, RF13, RF14): o passo `reminder.stage` do grupo delega as opções 1–3 aos mesmos fluxos de
 * "cheguei", "entreguei", "não entreguei" e ocorrência, a 4 adia, o comando digitado escapa e "cancelar" só fecha o
 * pedido. Nenhuma regra de registro nova: o que se mede aqui é para quem cada resposta vai.
 */
import { describe, expect, test } from 'bun:test'

import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type { BotSpeechKey } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import {
  createGroupDriverFlow,
  GROUP_STEP_REGISTRY,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import {
  createGroupReminderFlow,
  GROUP_REMINDER_STEP,
} from '../../src/whatsapp/application/whatsapp-group-reminder-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'

const COMPANY_ID = 'C1'
const OWNER_NUMBER = '5516988887777'
const NOTE = '17234'

type PostponeOutcome = 'closed' | 'no_answer' | 'postponed'

function request(
  stage: 'arrival' | 'idle' | 'settlement',
  state: Record<string, unknown> = {},
): GroupRequest {
  return {
    attempts: 0,
    companyId: COMPANY_ID,
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: OWNER_NUMBER,
    state: { reminderId: 'REM1', stage, tripStopId: 'S1', ...state },
    step: 'reminder.stage',
    version: 1n,
  }
}

const turnOf = (text: string, base: GroupRequest): GroupFlowTurn => ({
  request: base,
  sender: OWNER_NUMBER,
  senderName: null,
  text,
})

function setup(options: { postpone?: PostponeOutcome; note?: string | undefined } = {}) {
  const calls: string[] = []
  const postponed: unknown[] = []
  const spy =
    (name: string) =>
    async (...args: unknown[]): Promise<GroupFlowOutcome> => {
      calls.push(`${name}:${JSON.stringify(args.slice(1))}`)
      return { kind: 'continue', replies: [name], state: {}, step: 'inner' }
    }
  const flow = createGroupDriverFlow({
    delivery: {
      answer: spy('delivery.answer'),
      awaitingText: async () => false,
      begin: spy('delivery.begin'),
      hasOpen: async () => false,
    } as never,
    occurrence: {
      answer: spy('occurrence.answer'),
      initialStep: 'document',
      start: async (turn) => {
        calls.push(`occurrence.start:${JSON.stringify([turn.text])}`)
        return { kind: 'done', replies: ['occurrence'] }
      },
    },
    reminder: createGroupReminderFlow({
      postpone: async (input) => {
        postponed.push(input)
        return { outcome: options.postpone ?? 'postponed' }
      },
      readNoteNumber: async () => ('note' in options ? options.note : NOTE),
      speech: CATALOG_BOT_SPEECH,
    }),
    return: { answer: spy('return.answer'), begin: spy('return.begin') } as never,
    stop: {
      answer: spy('stop.answer'),
      begin: spy('stop.begin'),
      chooseDeparture: spy('stop.chooseDeparture'),
      departStop: spy('stop.departStop'),
      nextStepText: async () => 'proximo',
      settledDocument: async () => null,
    } as never,
  })
  return { calls, flow, postponed }
}

const say = (key: BotSpeechKey) => CATALOG_BOT_SPEECH.text({ companyId: COMPANY_ID, key })

describe('passo reminder.stage no registro do grupo (spec 299 T2.3, RF14)', () => {
  test('o passo tem dono próprio e prefixo próprio', () => {
    expect(GROUP_STEP_REGISTRY).toContainEqual({
      owner: 'reminder',
      prefix: 'reminder.',
      steps: [GROUP_REMINDER_STEP.stage],
    })
  })
})

describe('chegada: 1 cheguei · 2 entreguei · 3 ocorrência · 4 adia (RF11)', () => {
  test('1 vai ao "cheguei" da parada, com a nota dela', async () => {
    const { calls, flow } = setup()
    const outcome = await flow.answer(turnOf('1', request('arrival')))
    expect(calls).toEqual([`stop.begin:["arrive",["${NOTE}"]]`])
    expect(outcome).toMatchObject({ kind: 'continue', step: 'stop.inner' })
  })

  test('2 vai à entrega em preparo da nota (o canhoto)', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('2', request('arrival')))
    expect(calls).toEqual([`delivery.begin:[["${NOTE}"]]`])
  })

  test('3 abre a ocorrência da nota', async () => {
    const { calls, flow } = setup()
    expect(await flow.answer(turnOf('3', request('arrival')))).toMatchObject({ kind: 'done' })
    expect(calls).toEqual([`occurrence.start:["${NOTE}"]`])
  })

  test('"opção dois" falada vale como o 2', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('opção dois', request('arrival')))
    expect(calls).toEqual([`delivery.begin:[["${NOTE}"]]`])
  })
})

describe('entrega: 1 entreguei · 2 não entreguei · 3 ocorrência · 4 adia (RF11)', () => {
  test('1 vai à entrega em preparo', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('1', request('settlement')))
    expect(calls).toEqual([`delivery.begin:[["${NOTE}"]]`])
  })

  test('2 vai ao "não entreguei" (motivo da lista fechada)', async () => {
    const { calls, flow } = setup()
    const outcome = await flow.answer(turnOf('2', request('settlement')))
    expect(calls).toEqual([`return.begin:[{"numbers":["${NOTE}"]}]`])
    expect(outcome).toMatchObject({ kind: 'continue', step: 'return.inner' })
  })

  test('3 abre a ocorrência da nota', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('3', request('settlement')))
    expect(calls).toEqual([`occurrence.start:["${NOTE}"]`])
  })
})

describe('4 adia sem consumir tentativa, no máximo 3 por etapa (RF13)', () => {
  test('adiou: confirma com a fala do adiamento e fecha o pedido sem despedida', async () => {
    const { calls, flow, postponed } = setup({ postpone: 'postponed' })
    const outcome = await flow.answer(turnOf('4', request('arrival')))
    expect(outcome).toEqual({
      kind: 'done',
      replies: [await say('lembreteAdiado')],
      withoutFarewell: true,
    })
    expect(postponed).toEqual([{ companyId: COMPANY_ID, reminderId: 'REM1' }])
    expect(calls).toEqual([])
  })

  test('esgotado: conta como sem resposta e a fala diz que não adia mais', async () => {
    const { flow } = setup({ postpone: 'no_answer' })
    expect(await flow.answer(turnOf('4', request('settlement')))).toEqual({
      kind: 'done',
      replies: [await say('lembreteAdiamentoEsgotado')],
      withoutFarewell: true,
    })
  })

  test('lembrete já encerrado: avisa que não precisa responder', async () => {
    const { flow } = setup({ postpone: 'closed' })
    expect(await flow.answer(turnOf('4', request('arrival')))).toEqual({
      kind: 'done',
      replies: [await say('lembreteEncerrado')],
      withoutFarewell: true,
    })
  })

  test('as falas do adiamento são nós distintos do catálogo', async () => {
    const texts = await Promise.all(
      (['lembreteAdiado', 'lembreteAdiamentoEsgotado', 'lembreteEncerrado'] as const).map((key) =>
        say(key),
      ),
    )
    expect(new Set(texts).size).toBe(3)
  })
})

describe('resposta que não cabe, comando digitado e cancelar', () => {
  test.each(['5', '0', 'pular', 'texto livre qualquer', ''])(
    '"%s" não é opção: repete a pergunta sem chamar fluxo nenhum',
    async (text) => {
      const { calls, flow, postponed } = setup()
      expect(await flow.answer(turnOf(text, request('arrival')))).toEqual({
        kind: 'not_understood',
        prompt: '',
        reason: await CATALOG_BOT_SPEECH.text({
          companyId: COMPANY_ID,
          key: 'lembreteOpcaoInvalida',
          params: { ultimaOpcao: '4' },
        }),
      })
      expect(calls).toEqual([])
      expect(postponed).toEqual([])
    },
  )

  test('"cheguei" digitado escapa do passo e vai ao dono do comando', async () => {
    const { calls, flow, postponed } = setup()
    await flow.answer(turnOf('cheguei', request('arrival')))
    expect(calls).toEqual(['stop.begin:["arrive",[]]'])
    expect(postponed).toEqual([])
  })

  test('"entreguei 17234" digitado escapa e abre a entrega da nota, mesmo na etapa de chegada', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('entreguei 17234', request('arrival')))
    expect(calls).toEqual(['delivery.begin:[["17234"]]'])
  })

  test('"cancelar" não tem cancelamento próprio: o pedido só fecha, sem tocar fluxo nem lembrete', async () => {
    const { calls, flow, postponed } = setup()
    expect((await flow.cancel?.(turnOf('cancelar', request('arrival')))) ?? null).toBeNull()
    expect(calls).toEqual([])
    expect(postponed).toEqual([])
  })

  test('estado sem lembrete (pedido corrompido) não é consumido por ninguém', async () => {
    const { calls, flow } = setup()
    const broken = { ...request('arrival'), state: {} }
    expect(await flow.answer(turnOf('1', broken))).toMatchObject({ kind: 'not_understood' })
    expect(calls).toEqual([])
  })

  test('parada sem nota aberta não registra nada e mostra o próximo passo', async () => {
    const { calls, flow } = setup({ note: undefined })
    await flow.answer(turnOf('2', request('arrival')))
    expect(calls.filter((call) => call.startsWith('delivery.begin'))).toEqual([])
  })
})

describe('etapa idle (T2.7, RF23, RF24): o mesmo passo, cardápio por variante', () => {
  const start = (state: Record<string, unknown> = {}) =>
    request('idle', { idleVariant: 'start', ...state })
  const route = () => request('idle', { idleVariant: 'route' })

  test('A1 inicia a rota pela parada suposta (o mesmo caminho do "saí")', async () => {
    const { calls, flow } = setup()
    const outcome = await flow.answer(turnOf('1', start()))
    expect(calls).toEqual([`stop.departStop:[{"documentNumber":"${NOTE}","stopId":"S1"}]`])
    expect(outcome).toMatchObject({ kind: 'continue', step: 'stop.inner' })
  })

  test('A2 vai à escolha de parada (com a confirmação fora de ordem da 294)', async () => {
    const { calls, flow } = setup()
    await flow.answer(turnOf('2', start()))
    expect(calls).toEqual(['stop.chooseDeparture:[]'])
  })

  test('A3 adia sem consumir tentativa e fecha o pedido', async () => {
    const { calls, flow, postponed } = setup({ postpone: 'postponed' })
    expect(await flow.answer(turnOf('3', start()))).toEqual({
      kind: 'done',
      replies: [await say('lembreteAdiado')],
      withoutFarewell: true,
    })
    expect(postponed).toEqual([{ companyId: COMPANY_ID, reminderId: 'REM1' }])
    expect(calls).toEqual([])
  })

  test('A4 não existe na variante A', async () => {
    const { calls, flow } = setup()
    expect(await flow.answer(turnOf('4', start()))).toMatchObject({ kind: 'not_understood' })
    expect(calls).toEqual([])
  })

  test('B1 saída · B2 chegada · B3 entreguei · B4 ocorrência · B5 adia', async () => {
    const one = setup()
    await one.flow.answer(turnOf('1', route()))
    expect(one.calls).toEqual([`stop.departStop:[{"documentNumber":"${NOTE}","stopId":"S1"}]`])

    const two = setup()
    await two.flow.answer(turnOf('2', route()))
    expect(two.calls).toEqual([`stop.begin:["arrive",["${NOTE}"]]`])

    const three = setup()
    await three.flow.answer(turnOf('3', route()))
    expect(three.calls).toEqual([`delivery.begin:[["${NOTE}"]]`])

    const four = setup()
    await four.flow.answer(turnOf('4', route()))
    expect(four.calls).toEqual([`occurrence.start:["${NOTE}"]`])

    const five = setup({ postpone: 'postponed' })
    expect(await five.flow.answer(turnOf('5', route()))).toMatchObject({ kind: 'done' })
    expect(five.postponed).toHaveLength(1)
  })

  test('comando digitado escapa do passo idle como nos outros', async () => {
    const { calls, flow, postponed } = setup()
    await flow.answer(turnOf('cheguei', route()))
    expect(calls).toEqual(['stop.begin:["arrive",[]]'])
    expect(postponed).toEqual([])
  })
})

describe('a fala de opção inválida diz a última opção da etapa/variante (T2.7)', () => {
  test.each([
    ['arrival', {}, 'de 1 a 4'],
    ['settlement', {}, 'de 1 a 4'],
    ['idle', { idleVariant: 'start' }, 'de 1 a 3'],
    ['idle', { idleVariant: 'route' }, 'de 1 a 5'],
  ] as const)('%s %j → "%s"', async (stage, state, expected) => {
    const { flow } = setup()
    const outcome = await flow.answer(turnOf('9', request(stage, state)))
    expect(outcome).toMatchObject({ kind: 'not_understood' })
    expect((outcome as { reason: string }).reason).toContain(expected)
    expect((outcome as { reason: string }).reason).not.toContain('{{')
  })
})
