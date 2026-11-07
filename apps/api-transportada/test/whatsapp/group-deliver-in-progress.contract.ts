/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * "@bot entreguei" sem número no grupo do motorista (defeito de staging, NF 899840): o bot listava as sete notas abertas
 * da viagem. Agora segue o que está em andamento — a entrega em preparo é retomada; sem ela, a parada que chegou e falta
 * a baixa (ou a que está a caminho) decide; só sem nada em andamento a lista é a da viagem. O número digitado vence.
 * E "cancelar" com a lista "Qual nota você entregou?" aberta fecha o pedido em vez de "não achei essa nota na lista".
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { readWhatsAppStopInProgress } from '../../src/whatsapp-commands/application/whatsapp-stop-in-progress.service.js'
import {
  createGroupDeliveryFlow,
  GROUP_DELIVERY_TEXT,
  type GroupDeliveryDocument,
} from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type { GroupRequest } from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createInMemoryDeliveryPreparations } from '../fixtures/in-memory-delivery-preparations.fixture.js'

const OWNER = '5516988887777'
const ARRIVED = { arrivedAt: '2026-11-06T03:28:00.000Z', enRouteSince: '2026-11-06T03:00:00.000Z' }
const EN_ROUTE = { enRouteSince: '2026-11-06T03:00:00.000Z' }
const OFF = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'required',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
} as const

function stopOf(
  id: string,
  sequence: number,
  numbers: readonly string[],
  extra: Partial<WhatsAppStopCandidate> = {},
): WhatsAppStopCandidate {
  return {
    arrivedAt: null,
    completedAt: null,
    documents: numbers.map((number) => ({
      id: `doc-${number}`,
      number,
      recipientName: `CLIENTE ${number}`,
      separationStatus: 'loaded',
    })),
    enRouteSince: null,
    id,
    sequence,
    ...extra,
  }
}

const request = (step: string, state: Record<string, unknown> = {}): GroupRequest => ({
  attempts: 0,
  companyId: 'C1',
  driverId: 'D1',
  expiresAt: new Date(),
  groupJid: '1@g.us',
  id: 'R1',
  ownerNumber: OWNER,
  state,
  step,
  version: 1n,
})

function setup(stops: readonly WhatsAppStopCandidate[]) {
  const preparations = createInMemoryDeliveryPreparations(OFF)
  const documents: GroupDeliveryDocument[] = stops.flatMap((stop) =>
    stop.documents.map((document) => ({
      id: document.id ?? '',
      number: document.number,
      recipientName: document.recipientName,
    })),
  )
  const delivery = createGroupDeliveryFlow({
    consumeLocation: () => null,
    findActorUserId: async () => 'U1',
    findStopInProgress: (actor) =>
      readWhatsAppStopInProgress({ actor, listStops: async () => stops }),
    listOpenDocuments: async () => documents,
    preparations: preparations.service,
    withoutAccessText: async () => 'sem acesso',
  })
  const flow = createGroupDriverFlow({
    delivery,
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      listStops: async () => [],
      record: async () => ({ message: 'ok' }),
    }),
  })
  const turn = (text: string, step = 'document', state: Record<string, unknown> = {}) => ({
    request: request(step, state),
    sender: OWNER,
    senderName: null,
    text,
  })
  return { flow, preparations, turn }
}

const SEVEN_NOTES = [
  stopOf('S1', 1, ['899840'], ARRIVED),
  stopOf('S2', 2, ['899841']),
  stopOf('S3', 3, ['899842']),
  stopOf('S4', 4, ['899843', '899844']),
  stopOf('S5', 5, ['899845', '899846']),
]

const PHOTO_QUESTION = [
  '📸 *NF `899840` · foto do canhoto*',
  'Mande a foto do canhoto assinado.',
  '',
  '_Falta 1 item._',
].join('\n')

describe('grupo: "entreguei" sem número segue o que está em andamento', () => {
  test('entrega em preparo aberta (o pedido venceu): retoma a NF e repete a pergunta da foto', async () => {
    const t = setup(SEVEN_NOTES)
    await t.preparations.begin('doc-899840', '899840')
    await t.preparations.answer('pular')
    expect(await t.flow.start(t.turn('entreguei'))).toEqual({
      kind: 'continue',
      // Uma mensagem só: o Evolution espaça as mensagens, e a pergunta separada chegava depois da resposta seguinte.
      replies: [`↩️ *Continuando a entrega da NF \`899840\`.*\n${PHOTO_QUESTION}`],
      state: {},
      step: 'delivery.answer',
    })
  })

  test('sem preparação, a parada que chegou e falta a baixa decide: uma nota vai direto, com o bloco da parada', async () => {
    const t = setup(SEVEN_NOTES)
    expect(await t.flow.start(t.turn('entreguei'))).toEqual({
      kind: 'continue',
      replies: [
        [
          '*Parada 1*',
          '*NF 899840*',
          '🏪 *CLIENTE 899840*',
          '📍 *NF `899840` · localização*',
          'Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).',
          '_Falta 1 item. Se não tiver, responda pular._',
        ].join('\n'),
      ],
      state: {},
      step: 'delivery.answer',
    })
  })

  test('preparação cancelada (ou vencida): a parada em andamento ainda decide', async () => {
    const t = setup(SEVEN_NOTES)
    await t.preparations.begin('doc-899840', '899840')
    await t.preparations.answer('cancelar')
    const outcome = await t.flow.start(t.turn('entreguei'))
    expect(outcome).toMatchObject({ kind: 'continue', step: 'delivery.answer' })
    expect(outcome.kind === 'continue' ? outcome.replies[0] : '').toContain('*NF 899840*')
  })

  test('parada a caminho com várias notas: lista só as dela', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S4', 2, ['899843', '899844'], EN_ROUTE)]
    const t = setup(stops)
    expect(await t.flow.start(t.turn('entreguei'))).toEqual({
      kind: 'continue',
      replies: [
        [
          '✅ *Qual nota você entregou?*',
          '',
          '*1* - 🧾 NF `899843` · *CLIENTE 899843*',
          '*2* - 🧾 NF `899844` · *CLIENTE 899844*',
          '',
          '_Responda com o número da opção ou da nota._',
        ].join('\n'),
      ],
      state: {
        documents: [
          { id: 'doc-899843', number: '899843', recipientName: 'CLIENTE 899843' },
          { id: 'doc-899844', number: '899844', recipientName: 'CLIENTE 899844' },
        ],
      },
      step: 'delivery.choose',
    })
  })

  test('nada em andamento: a lista da viagem inteira, como antes', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S2', 2, ['899841'])]
    const t = setup(stops)
    expect(await t.flow.start(t.turn('entreguei'))).toMatchObject({
      replies: [
        GROUP_DELIVERY_TEXT.askDocument([
          { id: 'doc-899840', number: '899840', recipientName: 'CLIENTE 899840' },
          { id: 'doc-899841', number: '899841', recipientName: 'CLIENTE 899841' },
        ]),
      ],
      step: 'delivery.choose',
    })
  })

  test('o número digitado vence a parada em andamento e a preparação aberta', async () => {
    const t = setup(SEVEN_NOTES)
    await t.preparations.begin('doc-899840', '899840')
    expect(await t.flow.start(t.turn('entreguei 899845'))).toMatchObject({
      kind: 'continue',
      replies: [
        [
          '📍 *NF `899845` · localização*',
          'Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).',
          '_Falta 1 item. Se não tiver, responda pular._',
        ].join('\n'),
      ],
      step: 'delivery.answer',
    })
  })
})

describe('grupo: "cancelar" fecha a pergunta da entrega, nunca vira resposta', () => {
  test('"Qual nota você entregou?" aberta: "cancelar" deixa o pedido fechar (nada registrado)', async () => {
    const t = setup(SEVEN_NOTES)
    const state = { documents: [{ id: 'doc-899840', number: '899840' }] }
    expect(await t.flow.cancel?.(t.turn('cancelar', 'delivery.choose', state))).toBeNull()
    expect(t.preparations.status()).toEqual([])
  })

  test('foto do canhoto pedida: "cancelar" encerra a entrega em preparo', async () => {
    const t = setup(SEVEN_NOTES)
    await t.preparations.begin('doc-899840', '899840')
    await t.preparations.answer('pular')
    expect(await t.flow.cancel?.(t.turn('cancelar', 'delivery.answer'))).toEqual({
      kind: 'done',
      replies: ['Entrega da NF 899840 cancelada. A nota continua aberta na viagem.'],
    })
    expect(t.preparations.status()).toEqual(['cancelled'])
    expect(t.preparations.delivered).toEqual([])
  })
})
