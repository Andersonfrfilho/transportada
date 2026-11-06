/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.10 (RF25): o bot confere o fora de ordem que a API recusa (`409 TRIP_STOP_OUT_OF_ORDER`): mostra a
 * pergunta 1/2 (também por áudio), reenvia com `confirmOutOfOrder: true` no "1", e o atendente nunca vê a pergunta.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { TripStopOutOfOrderError } from '../../src/trips/domain/stop-order.error.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import {
  classifyWhatsAppDriverEventError,
  deliverWhatsAppDriverDocument,
  type WhatsAppDocumentEventInput,
  type WhatsAppDriverActor,
  type WhatsAppDriverEventPorts,
  type WhatsAppDriverEventResult,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_TEXT,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'
import {
  describeOutOfOrderViolation,
  OUT_OF_ORDER_TEXT,
  toOrderStopLabel,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

const NOW = new Date('2026-11-05T12:00:00.000Z')
const PHONE = '5516999995151'
const ACTOR: WhatsAppDriverActor = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }

const stop = (
  id: string,
  sequence: number,
  number: string,
  recipientName: string,
): WhatsAppStopCandidate => ({
  arrivedAt: null,
  completedAt: null,
  documents: [{ number, recipientName, separationStatus: 'loaded' }],
  enRouteSince: null,
  id,
  sequence,
})
const STOPS = [
  stop('s3', 3, '017234', 'Padaria Sol'),
  stop('s4', 4, '17250', 'Farmácia Lua'),
  stop('s5', 5, '17300', 'Mercado Estrela'),
  stop('s6', 6, '17400', 'Loja Norte'),
]
const LABELS = new Map(STOPS.map((item) => [item.id, toOrderStopLabel(item)] as const))

const violation = (overrides: Record<string, unknown>) =>
  ({
    currentSequence: 3,
    currentStopId: 's3',
    nextSequence: 3,
    nextStopId: 's3',
    requestedSequence: 5,
    requestedStopId: 's5',
    ...overrides,
  }) as Parameters<typeof describeOutOfOrderViolation>[0]['violation']

describe('a pergunta do fora de ordem (spec 294 RF25)', () => {
  test('entrega de outra parada: cita a iniciada e a da nota, 1 - Entreguei mesmo / 2 - Foi engano', () => {
    const text = describeOutOfOrderViolation({
      documentNumber: '17300',
      event: 'deliver',
      labels: LABELS,
      violation: violation({}),
    })
    expect(text).toBe(
      [
        '⚠️ *Você iniciou a rota para a parada 3 (NF 17234 — Padaria Sol)*, mas esta nota é da parada 5 (NF 17300 — Mercado Estrela).',
        '*1* - Entreguei a parada 5 mesmo',
        '*2* - Foi engano, descartar',
      ].join('\n'),
    )
  })

  test('chegada em outra parada', () => {
    const text = describeOutOfOrderViolation({
      event: 'arrive',
      labels: LABELS,
      violation: violation({}),
    })
    expect(text).toContain('Você iniciou a rota para a parada 3 (NF 17234 — Padaria Sol)')
    expect(text).toContain('você está chegando na parada 5 (NF 17300 — Mercado Estrela)')
    expect(text).toContain('*1* - Cheguei na parada 5 mesmo')
    expect(text).toContain('*2* - Foi engano')
  })

  test('saída que não é a próxima do roteiro: "Sim, a 6 / Não, a 4"', () => {
    const text = describeOutOfOrderViolation({
      event: 'depart',
      labels: LABELS,
      violation: violation({
        currentSequence: null,
        currentStopId: null,
        nextSequence: 4,
        nextStopId: 's4',
        requestedSequence: 6,
        requestedStopId: 's6',
      }),
    })
    expect(text).toBe(
      [
        '⚠️ *A próxima no roteiro é a parada 4 (NF 17250 — Farmácia Lua).* Quer mesmo iniciar a parada 6?',
        '*1* - Sim, a 6',
        '*2* - Não, a 4',
      ].join('\n'),
    )
  })

  test('parada sem rótulo conhecido fica só com a sequência', () => {
    const text = describeOutOfOrderViolation({
      event: 'arrive',
      labels: new Map(),
      violation: violation({}),
    })
    expect(text).toContain('para a parada 3*, mas você está chegando na parada 5.')
  })

  test('o 409 da API vira a recusa com os ids das paradas', () => {
    const refusal = classifyWhatsAppDriverEventError(
      new TripStopOutOfOrderError({
        currentSequence: null,
        currentStopId: null,
        nextSequence: 4,
        nextStopId: 's4',
        requestedSequence: 6,
        requestedStopId: 's6',
      }),
    )
    expect(refusal).toMatchObject({
      code: 'stop_out_of_order',
      nextStopId: 's4',
      requestedStopId: 's6',
    })
  })
})

describe('conversa individual: saída fora do roteiro (RF25)', () => {
  function build() {
    const departures: Record<string, unknown>[] = []
    const prompts = createWhatsAppDriverPrompts({
      clock: () => NOW,
      listStops: async () => STOPS,
      ports: {
        reportArrival: async () => ({}),
        reportDeparture: async (input) => {
          departures.push(input)
          if (input.confirmOutOfOrder !== true && input.stopId === 's6') {
            throw new TripStopOutOfOrderError({
              currentSequence: null,
              currentStopId: null,
              nextSequence: 4,
              nextStopId: 's4',
              requestedSequence: 6,
              requestedStopId: 's6',
            })
          }
          return { changed: true }
        },
      },
      speech: CATALOG_BOT_SPEECH,
    })
    return { departures, prompts }
  }
  const record = (prompts: ReturnType<typeof build>['prompts'], stopId: string) =>
    prompts.recordStop({
      actor: ACTOR,
      context: {},
      documentNumber: '17400',
      event: 'depart',
      idempotencyKey: 'k1',
      location: null,
      stopId,
    })

  test('a API recusou: a pergunta sai e o pedido fica no contexto, sem gravar nada', async () => {
    const { departures, prompts } = build()
    const result = await record(prompts, 's6')
    expect(result.texts[0]).toContain('A próxima no roteiro é a parada 4 (NF 17250 — Farmácia Lua)')
    expect(result.texts[0]).toContain('*1* - Sim, a 6')
    expect(result.context[DRIVER_PROMPT_CONTEXT_KEY]).toMatchObject({
      kind: 'out_of_order',
      nextStopId: 's4',
      stopId: 's6',
    })
    expect(departures).toHaveLength(1)
  })

  test.each(['1', 'um', 'sim'])(
    '"%s" reenvia com confirmOutOfOrder: true e registra a parada 6',
    async (answer) => {
      const { departures, prompts } = build()
      const asked = await record(prompts, 's6')
      const confirmed = await prompts.answer({
        actor: ACTOR,
        context: asked.context,
        text: answer,
        whatsappNumber: PHONE,
      })
      expect(departures.at(-1)).toMatchObject({ confirmOutOfOrder: true, stopId: 's6' })
      expect(confirmed?.texts).toEqual(['*Saída registrada* 🚚'])
      expect(confirmed?.context[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
    },
  )

  test.each(['2', 'dois', 'não'])(
    '"%s" vai para a próxima do roteiro (a 4), sem confirmar a 6',
    async (answer) => {
      const { departures, prompts } = build()
      const asked = await record(prompts, 's6')
      await prompts.answer({
        actor: ACTOR,
        context: asked.context,
        text: answer,
        whatsappNumber: PHONE,
      })
      expect(departures.at(-1)).toMatchObject({ stopId: 's4' })
      expect(departures.at(-1)?.confirmOutOfOrder).toBeUndefined()
    },
  )

  test('texto que não responde repete o 1/2 e mantém o pedido, sem gravar', async () => {
    const { departures, prompts } = build()
    const asked = await record(prompts, 's6')
    const other = await prompts.answer({
      actor: ACTOR,
      context: asked.context,
      text: 'quero ver o menu',
      whatsappNumber: PHONE,
    })
    expect(other).toMatchObject({ handled: true, texts: [OUT_OF_ORDER_TEXT.notUnderstood] })
    expect(other?.context[DRIVER_PROMPT_CONTEXT_KEY]).toBeDefined()
    expect(departures).toHaveLength(1)
  })

  test.each(['menu', 'saí'])(
    '"%s" é comando: tira o pedido de cena e segue o fluxo',
    async (text) => {
      const { departures, prompts } = build()
      const asked = await record(prompts, 's6')
      const other = await prompts.answer({
        actor: ACTOR,
        context: asked.context,
        text,
        whatsappNumber: PHONE,
      })
      expect(other).toMatchObject({ handled: false })
      expect(other?.context[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
      expect(departures).toHaveLength(1)
    },
  )

  test('"cancelar" é do dono da pergunta: descarta sem gravar', async () => {
    const { departures, prompts } = build()
    const asked = await record(prompts, 's6')
    const cancelled = await prompts.answer({
      actor: ACTOR,
      context: asked.context,
      text: 'cancelar',
      whatsappNumber: PHONE,
    })
    expect(cancelled).toMatchObject({ handled: true, texts: [DRIVER_PROMPT_TEXT.cancelled] })
    expect(cancelled?.context[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
    expect(departures).toHaveLength(1)
  })
})

describe('entrega de nota de outra parada (RF25, grupo e individual)', () => {
  const OFF: DeliveryProofFieldSettings = {
    ...DEFAULT_DELIVERY_PROOF_SETTINGS,
    cargo: 'off',
    photo: 'off',
    receivedBy: 'off',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'off',
  }
  function setup(actor: WhatsAppDriverActor = ACTOR) {
    const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
    const delivered: WhatsAppDocumentEventInput[] = []
    const removed: string[] = []
    const repository: WhatsAppDeliveryPreparationRepositoryPort = {
      async close({ id, status, version }) {
        const row = rows.get(id)
        if (row === undefined || row.status !== 'open' || row.version !== version) return false
        rows.set(id, { ...row, awaiting: null, status, version: row.version + 1n })
        return true
      },
      async findOpenByDocument({ documentId }) {
        return (
          [...rows.values()].find((r) => r.documentId === documentId && r.status === 'open') ?? null
        )
      },
      async listOpenForDriver({ driverId }) {
        return [...rows.values()].filter((r) => r.driverId === driverId && r.status === 'open')
      },
      async open(input) {
        const row = {
          ...input,
          awaiting: null,
          id: 'P1',
          location: null,
          photos: [],
          receivedBy: null,
          receiverName: null,
          skipped: [],
          status: 'open',
          version: 1n,
        }
        rows.set(row.id, row)
        return row
      },
      async save({ changes, id, version }) {
        const row = rows.get(id)
        if (row === undefined || row.status !== 'open' || row.version !== version) return false
        rows.set(id, { ...row, ...changes, version: row.version + 1n })
        return true
      },
    }
    const ports: Pick<WhatsAppDriverEventPorts, 'reportDelivery'> = {
      reportDelivery: async (input) => {
        delivered.push(input as WhatsAppDocumentEventInput)
        if (input.confirmOutOfOrder !== true) {
          throw new TripStopOutOfOrderError({
            currentSequence: 3,
            currentStopId: 's3',
            nextSequence: 3,
            nextStopId: 's3',
            requestedSequence: 5,
            requestedStopId: 's5',
          })
        }
        return { alreadySettled: false, stopCompleted: true }
      },
    }
    const service = createWhatsAppDeliveryPreparations({
      async attachProof() {},
      deliver: (input) => deliverWhatsAppDriverDocument(ports, input),
      describeResult: async ({
        documentNumber,
        result,
      }: {
        documentNumber: string
        result: WhatsAppDriverEventResult
      }) => `${result.kind}:${documentNumber}`,
      listStops: async () => STOPS,
      media: {
        read: async () => new Uint8Array(),
        remove: async ({ objectKey }) => {
          removed.push(objectKey)
        },
        store: async ({ bytes, preparationId }) => ({
          objectKey: `${preparationId}/0`,
          sha256: 'x',
          sizeBytes: bytes.byteLength,
        }),
      },
      repository,
      resolveSettings: async () => OFF,
    })
    const begin = () =>
      service.begin({
        actor,
        channel: 'group',
        documentId: 'DOC5',
        documentNumber: '17300',
        location: null,
      })
    const answer = (text: string, strict = false) => service.answer({ actor, strict, text })
    return { answer, begin, delivered, removed, rows, service }
  }

  async function reachConfirm(t: ReturnType<typeof setup>) {
    await t.begin()
    await t.answer('pular')
    return t.answer('1')
  }

  test('a API recusou: a preparação segue aberta e a pergunta cita as duas paradas', async () => {
    const t = setup()
    const asked = await reachConfirm(t)
    expect(asked?.awaitingText).toBe(true)
    expect(asked?.finished).toBe(false)
    expect(asked?.texts[0]).toBe(
      [
        '⚠️ *Você iniciou a rota para a parada 3 (NF 17234 — Padaria Sol)*, mas esta nota é da parada 5 (NF 17300 — Mercado Estrela).',
        '*1* - Entreguei a parada 5 mesmo',
        '*2* - Foi engano, descartar',
      ].join('\n'),
    )
    expect(t.rows.get('P1')?.status).toBe('open')
    expect(t.rows.get('P1')?.awaiting).toBe('out_of_order')
  })

  test.each(['1', 'um', 'sim'])(
    '"%s" reenvia a baixa com confirmOutOfOrder: true e fecha a preparação',
    async (answer) => {
      const t = setup()
      await reachConfirm(t)
      const done = await t.answer(answer)
      expect(done).toMatchObject({ finished: true, texts: ['registered:17300'] })
      expect(t.delivered.at(-1)?.confirmOutOfOrder).toBe(true)
      expect(t.delivered.at(-1)?.idempotencyKey).toBe('whatsapp-delivery-preparation:P1')
      expect(t.rows.get('P1')?.status).toBe('completed')
    },
  )

  test.each(['2', 'dois', 'não', 'foi engano'])(
    '"%s" descarta e não grava nada',
    async (answer) => {
      const t = setup()
      await reachConfirm(t)
      const gives = await t.answer(answer)
      expect(gives).toMatchObject({ finished: true, texts: [OUT_OF_ORDER_TEXT.discarded] })
      expect(t.delivered).toHaveLength(1)
      expect(t.rows.get('P1')?.status).toBe('cancelled')
    },
  )

  test('resposta fora do 1/2 repete a pergunta e a preparação continua aberta', async () => {
    const t = setup()
    await reachConfirm(t)
    const again = await t.answer('talvez')
    expect(again?.texts).toEqual([OUT_OF_ORDER_TEXT.notUnderstood])
    expect(t.rows.get('P1')?.status).toBe('open')
  })

  test('o "um" falado também confirma a entrega comum (o "1 - Sim" do resumo)', async () => {
    const t = setup()
    await t.begin()
    await t.answer('pular')
    const asked = await t.answer('um')
    expect(asked?.awaitingText).toBe(true)
    expect(t.delivered).toHaveLength(1)
  })
})
