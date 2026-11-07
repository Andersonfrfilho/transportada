/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.11 (RF26): o canhoto repetido não grava duas vezes — a mesma imagem diz de qual nota já era e a que horas;
 * outra foto de nota que já tem canhoto pergunta "1 - Trocar / 2 - Descartar" (também por áudio); nota entregue sem
 * canhoto completa em silêncio.
 */
import { describe, expect, test } from 'bun:test'

import { TripCanhotoAlreadyAttachedError } from '../../src/trips/domain/stop-order.error.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationPorts,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { WhatsAppDriverActor } from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { CANHOTO_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-canhoto.policy.js'

const ACTOR: WhatsAppDriverActor = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }
const ATTACHED_AT = new Date('2026-11-05T14:32:00.000Z')
const SETTINGS: DeliveryProofFieldSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  cargo: 'off',
  photo: 'optional',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}

type Attach = Parameters<WhatsAppDeliveryPreparationPorts['attachProof']>[0]

function setup(options: {
  readonly attach?: (input: Attach) => Promise<unknown>
  readonly duplicateOf?: string | null
}) {
  const { duplicateOf } = options
  const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
  const attached: Attach[] = []
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
  const service = createWhatsAppDeliveryPreparations({
    attachProof: async (input) => {
      attached.push(input)
      return options.attach === undefined ? {} : options.attach(input)
    },
    deliver: async () => ({
      details: { proofPending: false, stopCompleted: false, tripCompleted: false },
      event: 'deliver',
      kind: 'registered',
    }),
    describeResult: async ({ documentNumber }) => `entregue:${documentNumber}`,
    ...(duplicateOf === undefined
      ? {}
      : {
          findCanhotoByHash: async () =>
            duplicateOf === null ? null : { attachedAt: ATTACHED_AT, documentId: duplicateOf },
        }),
    listStops: async () => [
      {
        arrivedAt: null,
        completedAt: null,
        documents: [{ id: 'DOC-A', number: '017234', separationStatus: 'delivered' }],
        enRouteSince: null,
        id: 's1',
        sequence: 1,
      },
    ],
    media: {
      read: async () => new Uint8Array([1]),
      remove: async ({ objectKey }) => {
        removed.push(objectKey)
      },
      store: async ({ bytes, preparationId }) => ({
        objectKey: `${preparationId}/0`,
        sha256: 'abc',
        sizeBytes: bytes.byteLength,
      }),
    },
    repository,
    resolveSettings: async () => SETTINGS,
  })
  const begin = () =>
    service.begin({
      actor: ACTOR,
      channel: 'group',
      documentId: 'DOC-B',
      documentNumber: '17300',
      location: null,
    })
  const photo = (id: string) =>
    service.receivePhoto({
      actor: ACTOR,
      bytes: new Uint8Array([1, 2, 3]),
      caption: null,
      mimeType: 'image/jpeg',
      providerMessageId: id,
    })
  const answer = (text: string) => service.answer({ actor: ACTOR, text })
  return { answer, attached, begin, photo, removed, rows }
}

describe('a mesma imagem já era canhoto (spec 294 RF26)', () => {
  test('diz de qual nota e a que horas, sem guardar a foto', async () => {
    const t = setup({ duplicateOf: 'DOC-A' })
    await t.begin()
    const reply = await t.photo('M1')
    expect(reply?.texts).toEqual(['Esse canhoto já tinha chegado: NF 17234, entregue às 11:32.'])
    expect(t.rows.get('P1')?.photos).toEqual([])
    expect(t.removed).toEqual(['P1/0'])
  })

  test('a própria nota: cita o número dela', async () => {
    const t = setup({ duplicateOf: 'DOC-B' })
    await t.begin()
    const reply = await t.photo('M1')
    expect(reply?.texts[0]).toBe('Esse canhoto já tinha chegado: NF 17300, entregue às 11:32.')
  })

  test('nota que a viagem não conhece: fica sem o número', async () => {
    const t = setup({ duplicateOf: 'DOC-X' })
    await t.begin()
    const reply = await t.photo('M1')
    expect(reply?.texts[0]).toBe('Esse canhoto já tinha chegado, entregue às 11:32.')
  })

  test('imagem nova segue o caminho de sempre', async () => {
    const t = setup({ duplicateOf: null })
    await t.begin()
    const reply = await t.photo('M1')
    expect(reply?.texts[0]).toBe('✅ _Canhoto recebido._')
    expect(t.rows.get('P1')?.photos).toHaveLength(1)
  })
})

describe('outra foto de nota que já tem canhoto (spec 294 RF26)', () => {
  const conflictOnce = () => {
    let first = true
    return async (input: Attach) => {
      if (first && input.upload.kind === 'photo' && input.upload.replaceCanhoto !== true) {
        first = false
        throw new TripCanhotoAlreadyAttachedError()
      }
      return {}
    }
  }
  async function reachConfirm(t: ReturnType<typeof setup>) {
    await t.begin()
    await t.photo('M1')
    await t.answer('pular')
    return t.answer('1')
  }

  test('a baixa pergunta a troca e a preparação segue aberta com a foto', async () => {
    const t = setup({ attach: conflictOnce(), duplicateOf: null })
    const asked = await reachConfirm(t)
    expect(asked).toMatchObject({ awaitingText: true, finished: false })
    expect(asked?.texts).toEqual([CANHOTO_TEXT.replaceQuestion('17300')])
    expect(asked?.texts[0]).toContain('*1* - Trocar o canhoto (vai para conferência do escritório)')
    expect(asked?.texts[0]).toContain('*2* - Descartar')
    expect(t.rows.get('P1')?.status).toBe('open')
    expect(t.rows.get('P1')?.awaiting).toBe('replace_canhoto')
  })

  test.each(['1', 'um', 'sim'])('"%s" reenvia com replaceCanhoto: true e fecha', async (answer) => {
    const t = setup({ attach: conflictOnce(), duplicateOf: null })
    await reachConfirm(t)
    const done = await t.answer(answer)
    expect(t.attached.at(-1)?.upload.replaceCanhoto).toBe(true)
    expect(done).toMatchObject({ finished: true })
    expect(done?.texts).toContain(CANHOTO_TEXT.replaced('17300'))
    expect(t.rows.get('P1')?.status).toBe('completed')
  })

  test.each(['2', 'dois', 'descartar', 'não'])(
    '"%s" descarta a foto nova e mantém o canhoto',
    async (answer) => {
      const t = setup({ attach: conflictOnce(), duplicateOf: null })
      await reachConfirm(t)
      const done = await t.answer(answer)
      expect(done?.texts).toEqual([CANHOTO_TEXT.kept('17300')])
      expect(t.attached.filter((call) => call.upload.replaceCanhoto === true)).toHaveLength(0)
      expect(t.rows.get('P1')?.status).toBe('cancelled')
      expect(t.removed).toContain('P1/0')
    },
  )

  test('outra resposta repete a pergunta e a preparação continua aberta', async () => {
    const t = setup({ attach: conflictOnce(), duplicateOf: null })
    await reachConfirm(t)
    const again = await t.answer('talvez')
    expect(again?.texts).toEqual([CANHOTO_TEXT.notUnderstood])
    expect(t.rows.get('P1')?.status).toBe('open')
  })

  test('nota entregue sem canhoto: a foto entra como o canhoto que faltava, em silêncio', async () => {
    const t = setup({ duplicateOf: null })
    const done = await reachConfirm(t)
    expect(done).toMatchObject({ finished: true, texts: ['entregue:17300'] })
    expect(t.attached).toHaveLength(1)
    expect(t.attached[0]?.upload.replaceCanhoto).toBeUndefined()
  })
})

describe('o texto do canhoto repetido', () => {
  test('hora em Brasília, com e sem número da nota', () => {
    expect(CANHOTO_TEXT.duplicate({ attachedAt: ATTACHED_AT, documentNumber: '17234' })).toBe(
      'Esse canhoto já tinha chegado: NF 17234, entregue às 11:32.',
    )
    expect(CANHOTO_TEXT.duplicate({ attachedAt: ATTACHED_AT })).toBe(
      'Esse canhoto já tinha chegado, entregue às 11:32.',
    )
  })
})
