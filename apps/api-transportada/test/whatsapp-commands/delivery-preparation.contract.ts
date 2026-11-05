/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a entrega em preparo pelo WhatsApp — o bot só exige o que a configuração exige, a nota
 * não fecha sem a prova obrigatória, e as provas viram comprovante depois da baixa.
 */
import { describe, expect, test } from 'bun:test'

import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverActor,
  WhatsAppDriverEventResult,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { resolveDeliveryProofChecklist } from '../../src/whatsapp-commands/domain/whatsapp-delivery-proof-checklist.policy.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

const ACTOR: WhatsAppDriverActor = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }
/** Spec 294 RF18: o atendente (usuário U9) dá a baixa em nome do motorista D1 pelo escritório. */
const ATTENDANT: WhatsAppDriverActor = { ...ACTOR, actorUserId: 'U9', attendant: true }

const settingsOf = (
  overrides: Partial<DeliveryProofFieldSettings>,
): DeliveryProofFieldSettings => ({
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  ...overrides,
})

/** Tudo desligado, menos o que o teste liga: o fluxo só pergunta o que a configuração pede. */
const OFF: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'off',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}

function setup(
  settings: DeliveryProofFieldSettings,
  deliverResult?: WhatsAppDriverEventResult,
  actor: WhatsAppDriverActor = ACTOR,
) {
  const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
  const objects = new Map<string, Uint8Array>()
  const delivered: WhatsAppDocumentEventInput[] = []
  const attached: { kind: string; receiverName: string; receivedBy: null | string }[] = []
  let sequence = 0

  const repository: WhatsAppDeliveryPreparationRepositoryPort = {
    async close({ id, status, version }) {
      const row = rows.get(id)
      if (row === undefined || row.status !== 'open' || row.version !== version) return false
      rows.set(id, { ...row, awaiting: null, status, version: row.version + 1n })
      return true
    },
    async findOpenByDocument({ documentId }) {
      return (
        [...rows.values()].find((row) => row.documentId === documentId && row.status === 'open') ??
        null
      )
    },
    async listOpenForDriver({ driverId }) {
      return [...rows.values()]
        .filter((row) => row.driverId === driverId && row.status === 'open')
        .reverse()
    },
    async open(input) {
      if (
        [...rows.values()].some(
          (row) => row.documentId === input.documentId && row.status === 'open',
        )
      ) {
        return null
      }
      sequence += 1
      const row = {
        ...input,
        awaiting: null,
        id: `P${sequence}`,
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
    async attachProof({ upload }) {
      attached.push({
        kind: upload.kind,
        receivedBy: upload.receivedBy,
        receiverName: upload.receiverName,
      })
    },
    async deliver(input) {
      delivered.push(input)
      return (
        deliverResult ?? {
          details: { proofPending: false, stopCompleted: false, tripCompleted: false },
          event: 'deliver',
          kind: 'registered',
        }
      )
    },
    describeResult: async ({ documentNumber, result }) => `${result.kind}:${documentNumber}`,
    media: {
      async read({ objectKey }) {
        return objects.get(objectKey) ?? new Uint8Array()
      },
      async remove({ objectKey }) {
        objects.delete(objectKey)
      },
      async store({ bytes, preparationId }) {
        const objectKey = `${preparationId}/${objects.size}`
        objects.set(objectKey, bytes)
        return { objectKey, sha256: 'x', sizeBytes: bytes.byteLength }
      },
    },
    repository,
    resolveSettings: async () => settings,
  })

  const photo = (id: string, caption: null | string = null) =>
    service.receivePhoto({
      actor,
      bytes: new Uint8Array([1, 2, 3]),
      caption,
      mimeType: 'image/jpeg',
      providerMessageId: id,
    })
  const begin = (documentId = 'DOC1', documentNumber = '17234') =>
    service.begin({ actor, channel: 'group', documentId, documentNumber, location: null })
  const answer = (text: string, strict = false) => service.answer({ actor, strict, text })
  const status = () => [...rows.values()].map((row) => row.status)

  return { answer, attached, begin, delivered, objects, photo, rows, service, status }
}

describe('o que falta para a entrega fechar (configuração da nota)', () => {
  const empty = {
    cargoCount: 0,
    hasLocation: false,
    hasReceivedBy: false,
    hasReceiverName: false,
    photoCount: 0,
    skipped: new Set<string>(),
  }

  test('desligado nunca é pedido: só a localização é oferecida', () => {
    const checklist = resolveDeliveryProofChecklist({ collected: empty, settings: OFF })
    expect(checklist.next).toEqual({ item: 'location', optional: true, remaining: 0 })
    expect(checklist.missing).toEqual([])
  })

  test('obrigatório entra no que falta; mínimo de fotos da carga conta o que já chegou', () => {
    const checklist = resolveDeliveryProofChecklist({
      collected: { ...empty, cargoCount: 1, hasLocation: true },
      settings: settingsOf({ ...OFF, cargo: 'required', cargoMinimumCount: 3, photo: 'required' }),
    })
    expect(checklist.missing).toEqual([
      { item: 'photo', remaining: 0 },
      { item: 'cargo', remaining: 2 },
    ])
    expect(checklist.ready).toBe(false)
  })

  test('obrigatório não se pula', () => {
    const checklist = resolveDeliveryProofChecklist({
      collected: { ...empty, hasLocation: true, skipped: new Set(['photo']) },
      settings: { ...OFF, photo: 'required' },
    })
    expect(checklist.next).toEqual({ item: 'photo', optional: false, remaining: 0 })
  })

  test('sem canhoto, quem recebeu e o nome não são pedidos (não há onde gravar)', () => {
    const checklist = resolveDeliveryProofChecklist({
      collected: { ...empty, hasLocation: true, skipped: new Set(['photo']) },
      settings: { ...OFF, photo: 'optional', receivedBy: 'required', receiverName: 'required' },
    })
    expect(checklist.next).toBeNull()
    expect(checklist.ready).toBe(true)
  })

  test('assinatura obrigatória só se completa no app', () => {
    const checklist = resolveDeliveryProofChecklist({
      collected: { ...empty, hasLocation: true },
      settings: { ...OFF, signature: 'required' },
    })
    expect(checklist.appOnly).toEqual(['signature'])
    expect(checklist.ready).toBe(false)
  })
})

describe('entrega em preparo pelo WhatsApp', () => {
  test('sem nada exigido: oferece a localização, aceita "pular" e confirma; a baixa usa a chave da preparação', async () => {
    const t = setup(OFF)
    const opened = await t.begin()
    expect(opened.texts.join('\n')).toContain('compartilhe a localização')
    expect(opened.awaitingText).toBe(false)
    const skipped = await t.answer('pular')
    expect(skipped?.texts.join('\n')).toContain('Confirma a entrega?')
    expect(skipped?.awaitingText).toBe(true)
    const done = await t.answer('1')
    expect(done).toMatchObject({ finished: true, texts: ['registered:17234'] })
    expect(t.delivered).toHaveLength(1)
    expect(t.delivered[0]?.idempotencyKey).toBe('whatsapp-delivery-preparation:P1')
    expect(t.status()).toEqual(['completed'])
  })

  test('faltou o canhoto obrigatório: não fecha e diz o que falta; a foto completa e vira comprovante', async () => {
    const t = setup({ ...OFF, photo: 'required', receiverName: 'required' })
    await t.begin()
    const afterSkip = await t.answer('pular')
    expect(afterSkip?.texts.join('\n')).toContain(
      'NF 17234 ainda não fechou. Falta: foto do canhoto, nome de quem recebeu.',
    )
    // "pular" no canhoto obrigatório não pula.
    const refused = await t.answer('pular')
    expect(refused?.texts.join('\n')).toContain('obrigatório')
    expect(t.delivered).toEqual([])

    const afterPhoto = await t.photo('M1')
    expect(afterPhoto?.texts[0]).toBe('Foto do canhoto recebida.')
    expect(afterPhoto?.texts.join('\n')).toContain('qual o nome de quem recebeu?')
    expect(afterPhoto?.awaitingText).toBe(true)
    const afterName = await t.answer('Maria Souza')
    expect(afterName?.texts.join('\n')).not.toContain('Maria')
    expect(afterName?.texts.join('\n')).toContain('Confirma a entrega?')
    await t.answer('sim')
    expect(t.delivered).toHaveLength(1)
    expect(t.attached).toEqual([{ kind: 'photo', receivedBy: null, receiverName: 'Maria Souza' }])
    expect(t.objects.size).toBe(0)
  })

  test('quem recebeu pela lista numerada; resposta fora da lista pede de novo', async () => {
    const t = setup({ ...OFF, photo: 'required', receivedBy: 'required' })
    await t.begin()
    await t.answer('pular')
    await t.photo('M1')
    expect((await t.answer('talvez'))?.texts).toEqual([
      'Responda com o número da lista de quem recebeu.',
    ])
    expect(await t.answer('talvez', true)).toBeNull()
    await t.answer('8')
    await t.answer('1')
    expect(t.attached[0]?.receivedBy).toBe('doorman')
  })

  test('fotos da mercadoria até o mínimo; a mesma mensagem não conta duas vezes', async () => {
    const t = setup({ ...OFF, cargo: 'required', cargoMinimumCount: 2 })
    await t.begin()
    await t.answer('pular')
    const first = await t.photo('M1')
    expect(first?.texts.join('\n')).toContain('mande 1 foto da mercadoria')
    expect((await t.photo('M1'))?.texts).toEqual(['Essa foto já tinha chegado.'])
    const second = await t.photo('M2')
    expect(second?.texts.join('\n')).toContain('Confirma a entrega?')
    await t.answer('1')
    expect(t.attached.map((item) => item.kind)).toEqual(['cargo', 'cargo'])
  })

  test('as provas valem para a nota, não para o canal: retomar a mesma nota não abre outra', async () => {
    const t = setup({ ...OFF, photo: 'required' })
    await t.begin()
    await t.photo('M1')
    const resumed = await t.service.begin({
      actor: ACTOR,
      channel: 'individual',
      documentId: 'DOC1',
      documentNumber: '17234',
      location: null,
    })
    expect(t.rows.size).toBe(1)
    expect(resumed.texts.join('\n')).toContain('compartilhe a localização')
  })

  test('a legenda com o número da nota leva a foto para ela', async () => {
    const t = setup({ ...OFF, photo: 'required' })
    await t.begin('DOC1', '17234')
    await t.begin('DOC2', '900')
    await t.photo('M1', 'canhoto da 17234')
    const row = [...t.rows.values()].find((item) => item.documentId === 'DOC1')
    expect(row?.photos).toHaveLength(1)
  })

  test('a localização compartilhada completa a preparação e entra na baixa', async () => {
    const t = setup(OFF)
    await t.begin()
    const reply = await t.service.receiveLocation({
      actor: ACTOR,
      location: {
        accuracyMeters: null,
        capturedAt: '2026-11-04T12:00:00.000Z',
        latitude: '-21.1',
        longitude: '-47.8',
      },
    })
    expect(reply?.texts[0]).toBe('Localização recebida.')
    await t.answer('1')
    expect(t.delivered[0]?.location?.latitude).toBe('-21.1')
  })

  test('assinatura obrigatória: avisa que só no app e não oferece confirmar', async () => {
    const t = setup({ ...OFF, signature: 'required' })
    await t.begin()
    const reply = await t.answer('pular')
    expect(reply?.texts.join('\n')).toContain('só pode ser feita no aplicativo')
    expect(await t.answer('1')).toBeNull()
    expect(t.delivered).toEqual([])
  })

  test('"2" na confirmação cancela e a nota continua aberta', async () => {
    const t = setup(OFF)
    await t.begin()
    await t.answer('pular')
    expect((await t.answer('2'))?.texts).toEqual([
      'Entrega da NF 17234 cancelada. A nota continua aberta na viagem.',
    ])
    expect(t.delivered).toEqual([])
    expect(t.status()).toEqual(['cancelled'])
  })

  test('a baixa recusada (nota já fechada por outro canal) encerra a preparação sem anexar', async () => {
    const t = setup(
      { ...OFF, photo: 'optional' },
      { event: 'deliver', kind: 'refused', refusal: { code: 'document_not_reachable' } },
    )
    await t.begin()
    await t.answer('pular')
    await t.photo('M1')
    const reply = await t.answer('1')
    expect(reply).toMatchObject({ finished: true, texts: ['refused:17234'] })
    expect(t.attached).toEqual([])
    expect(t.status()).toEqual(['superseded'])
  })

  test('foto sem entrega em preparo não é dela', async () => {
    const t = setup(OFF)
    expect(await t.photo('M1')).toBeNull()
    expect(await t.answer('1')).toBeNull()
  })
})

describe('spec 294 RF19: baixa do atendente, comprovantes opcionais', () => {
  const STRICT = {
    ...OFF,
    photo: 'required',
    receivedBy: 'required',
    receiverName: 'required',
  } as const

  test('a tripulação não pula o canhoto obrigatório', async () => {
    const t = setup(STRICT)
    await t.begin()
    await t.answer('pular')
    const refused = await t.answer('pular')
    expect(refused?.texts.join('\n')).toContain('obrigatório')
    expect(t.delivered).toHaveLength(0)
  })

  test('o atendente pula tudo, o bot oferece e a baixa sai pelo escritório com o usuário dele', async () => {
    const t = setup(STRICT, undefined, ATTENDANT)
    const opened = await t.begin()
    expect(opened.texts.join('\n')).toContain('compartilhe a localização')
    const afterLocation = await t.answer('pular')
    expect(afterLocation?.texts.join('\n')).toContain('canhoto')
    const afterPhoto = await t.answer('pular')
    expect(afterPhoto?.texts.join('\n')).toContain('Confirma a entrega?')
    const done = await t.answer('1')
    expect(done).toMatchObject({ finished: true, texts: ['registered:17234'] })
    expect(t.delivered).toHaveLength(1)
    expect(t.delivered[0]).toMatchObject({
      actorUserId: 'U9',
      attendant: true,
      documentId: 'DOC1',
      driverId: 'D1',
    })
    expect(t.attached).toEqual([])
  })

  test('assinatura obrigatória não segura o atendente (no escritório não há assinatura)', async () => {
    const t = setup({ ...OFF, signature: 'required' }, undefined, ATTENDANT)
    await t.begin()
    const confirm = await t.answer('pular')
    expect(confirm?.texts.join('\n')).toContain('Confirma a entrega?')
  })

  test('o atendente que manda o canhoto o vê anexado como atendente', async () => {
    const t = setup(STRICT, undefined, ATTENDANT)
    await t.begin()
    await t.answer('pular')
    await t.photo('M1')
    await t.answer('1')
    await t.answer('Maria')
    await t.answer('1')
    expect(t.delivered[0]).toMatchObject({ attendant: true })
    expect(t.attached).toHaveLength(1)
  })
})
