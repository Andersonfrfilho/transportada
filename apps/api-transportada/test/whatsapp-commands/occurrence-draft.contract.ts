/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a ocorrência em coleta pelo WhatsApp. O tipo que pede foto, número do documento do
 * cliente ou valor pago não é mais recusado: o bot pede só o que a exigência efetiva pede, e registra
 * pela mesma função do app quando chega tudo. Assinatura e produtos seguem só no app.
 */
import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'

import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type {
  WhatsAppDriverEventResult,
  WhatsAppOccurrenceEventInput,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import {
  combineWhatsAppDriverCollections,
  createWhatsAppOccurrenceDrafts,
  WhatsAppOccurrencePhotoRejectedError,
  type WhatsAppOccurrenceDraft,
  type WhatsAppOccurrenceDraftRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-occurrence-draft.service.js'
import { resolveOccurrenceDraftChecklist } from '../../src/whatsapp-commands/domain/whatsapp-occurrence-draft-checklist.policy.js'
import {
  parseOccurrenceDeclaredAmount,
  parseOccurrenceReferenceNumber,
} from '../../src/whatsapp-commands/domain/whatsapp-occurrence-draft-speech.constant.js'
import { OCCURRENCE_PHOTO_MAX_BYTES } from '../../src/trips/domain/occurrence-attachment.policy.js'
import type { OccurrenceRequirements } from '../../src/trips/domain/occurrence-requirements.policy.js'
import { fitOccurrencePhoto } from '../../src/whatsapp-commands/infrastructure/whatsapp-occurrence-photo.adapter.js'

const ACTOR = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }

/** Tudo desligado, menos o que o teste liga. */
const OFF: OccurrenceRequirements = {
  declaredAmountLabel: 'Valor pago',
  declaredAmountMode: 'off',
  declaredAmountScope: 'occurrence',
  itemsMinimumCount: null,
  itemsMode: 'off',
  noteMode: 'off',
  photoMinimumCount: 1,
  photoMode: 'off',
  referenceNumberLabel: 'Número do documento do cliente',
  referenceNumberMode: 'off',
  signatureMode: 'off',
}

const require = (overrides: Partial<OccurrenceRequirements>): OccurrenceRequirements => ({
  ...OFF,
  ...overrides,
})

const REGISTERED: WhatsAppDriverEventResult = { event: 'occurrence', kind: 'registered' }

function setup(
  requirements: OccurrenceRequirements | null,
  options: { registerResult?: () => Promise<WhatsAppDriverEventResult> } = {},
) {
  const rows = new Map<string, WhatsAppOccurrenceDraft & { status: string }>()
  const registered: WhatsAppOccurrenceEventInput[] = []
  let sequence = 0
  let uploads = 0
  let rejectNext = false

  const repository: WhatsAppOccurrenceDraftRepositoryPort = {
    async close({ id, status, version }) {
      const row = rows.get(id)
      if (row === undefined || row.status !== 'open' || row.version !== version) return false
      rows.set(id, { ...row, awaiting: null, status, version: row.version + 1n })
      return true
    },
    async findOpenForDriver({ driverId }) {
      return (
        [...rows.values()].find((row) => row.driverId === driverId && row.status === 'open') ?? null
      )
    },
    async open(input) {
      if (
        [...rows.values()].some((row) => row.driverId === input.driverId && row.status === 'open')
      )
        return null
      sequence += 1
      const row = {
        ...input,
        awaiting: null,
        declaredAmount: null,
        id: `O${sequence}`,
        photos: [],
        referenceNumber: null,
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

  const service = createWhatsAppOccurrenceDrafts({
    describeResult: async ({ documentNumber, result }) => `${result.kind}:${documentNumber}`,
    async register(input) {
      registered.push(input)
      return options.registerResult === undefined ? REGISTERED : options.registerResult()
    },
    repository,
    resolveRequirements: async () =>
      requirements === null
        ? null
        : {
            declaredAmountLabel: requirements.declaredAmountLabel,
            referenceNumberLabel: requirements.referenceNumberLabel,
            requirements,
          },
    async storePhoto() {
      if (rejectNext) {
        rejectNext = false
        throw new WhatsAppOccurrencePhotoRejectedError()
      }
      uploads += 1
      return { uploadId: `UP${uploads}` }
    },
  })

  const begin = () =>
    service.begin({
      actor: ACTOR,
      channel: 'group',
      documentId: 'DOC1',
      documentNumber: '17234',
      location: null,
      note: 'cliente devolveu',
      occurrenceTypeId: 'T1',
    })
  const photo = (id: string) =>
    service.receivePhoto({
      actor: ACTOR,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      providerMessageId: id,
    })
  const answer = (text: string, strict = false) => service.answer({ actor: ACTOR, strict, text })
  return {
    answer,
    begin,
    photo,
    registered,
    rejectNextPhoto: () => {
      rejectNext = true
    },
    rows,
    service,
  }
}

describe('ocorrência em coleta: o que falta (spec 293 T15)', () => {
  test('off nunca é pedido; tudo desligado não abre coleta', () => {
    const checklist = resolveOccurrenceDraftChecklist({
      collected: {
        hasDeclaredAmount: false,
        hasReferenceNumber: false,
        photoCount: 0,
        skipped: new Set(),
      },
      requirements: OFF,
    })
    expect(checklist).toMatchObject({ appOnly: [], asks: [], next: null, ready: true })
  })

  test('foto obrigatória com mínimo, depois número e valor, na ordem', () => {
    const checklist = resolveOccurrenceDraftChecklist({
      collected: {
        hasDeclaredAmount: false,
        hasReferenceNumber: false,
        photoCount: 1,
        skipped: new Set(),
      },
      requirements: require({
        declaredAmountMode: 'required',
        photoMinimumCount: 3,
        photoMode: 'required',
        referenceNumberMode: 'optional',
      }),
    })
    expect(checklist.next).toEqual({ item: 'photo', optional: false, remaining: 2 })
    expect(checklist.missing.map((item) => item.item)).toEqual(['photo', 'declared_amount'])
  })

  test('assinatura, produtos e valor por item obrigatórios são só do app', () => {
    const checklist = resolveOccurrenceDraftChecklist({
      collected: {
        hasDeclaredAmount: false,
        hasReferenceNumber: false,
        photoCount: 0,
        skipped: new Set(),
      },
      requirements: require({
        declaredAmountMode: 'required',
        declaredAmountScope: 'item',
        itemsMode: 'required',
        photoMode: 'required',
        signatureMode: 'required',
      }),
    })
    expect(checklist.appOnly).toEqual(['signature', 'items', 'declared_amount'])
    expect(checklist.asks).toEqual(['photo'])
    expect(checklist.ready).toBe(false)
  })

  test('o valor digitado vira o texto do numeric; o número segue o padrão do app', () => {
    expect(parseOccurrenceDeclaredAmount('R$ 1.234,56')).toBe('1234.56')
    expect(parseOccurrenceDeclaredAmount('125,9')).toBe('125.9')
    expect(parseOccurrenceDeclaredAmount('125.90')).toBe('125.90')
    expect(parseOccurrenceDeclaredAmount('80')).toBe('80')
    expect(parseOccurrenceDeclaredAmount('1.500')).toBe('1500')
    expect(parseOccurrenceDeclaredAmount('0')).toBe('0')
    expect(parseOccurrenceDeclaredAmount('dez reais')).toBeNull()
    expect(parseOccurrenceDeclaredAmount('12,345')).toBeNull()
    expect(parseOccurrenceDeclaredAmount('-5')).toBeNull()
    expect(parseOccurrenceReferenceNumber('  DEV 123/4 ')).toBe('DEV 123/4')
    expect(parseOccurrenceReferenceNumber('número #1')).toBeNull()
  })
})

describe('ocorrência em coleta: o fluxo (spec 293 T15)', () => {
  test('sem nada a colher, ou com o que só o app colhe, não abre coleta: o canal segue como antes', async () => {
    expect(await setup(OFF).begin()).toBeNull()
    expect(
      await setup(require({ photoMode: 'required', signatureMode: 'required' })).begin(),
    ).toBeNull()
    expect(await setup(null).begin()).toBeNull()
  })

  test('foto obrigatória: pede, guarda como upload e registra com as fotos, o número e a observação', async () => {
    const flow = setup(
      require({ photoMinimumCount: 2, photoMode: 'required', referenceNumberMode: 'required' }),
    )
    expect(await flow.begin()).toEqual({
      awaitingText: true,
      documentNumber: '17234',
      finished: false,
      texts: [
        '⚠️ *A ocorrência da NF 17234 ainda não foi registrada.*\nFalta: 2 fotos, "Número do documento do cliente".',
        '📸 *Ocorrência da NF 17234*\nMande 2 fotos.',
      ],
    })
    // Texto que não é "pular" nem "cancelar" com foto em aberto não é da coleta.
    expect(await flow.answer('oi')).toBeNull()
    expect((await flow.photo('M1'))?.texts).toEqual([
      '✅ _Foto da ocorrência recebida._',
      '⚠️ *A ocorrência da NF 17234 ainda não foi registrada.*\nFalta: 1 foto, "Número do documento do cliente".',
      '📸 *Ocorrência da NF 17234*\nMande 1 foto.',
    ])
    expect((await flow.photo('M1'))?.texts).toEqual(['🔁 _Essa foto já tinha chegado._'])
    expect((await flow.photo('M2'))?.texts).toEqual([
      '✅ _Foto da ocorrência recebida._',
      '🔢 *Ocorrência da NF 17234*\nDigite "Número do documento do cliente".',
    ])
    expect((await flow.answer('número #1'))?.texts).toEqual([
      '🤔 *Não entendi.* Digite só o número (letras, números, ponto, barra ou traço, até 30), ou _pular_, se não for obrigatório.',
    ])
    expect((await flow.answer('pular'))?.texts).toEqual([
      '⚠️ _Esse item é obrigatório para registrar a ocorrência._',
      '🔢 *Ocorrência da NF 17234*\nDigite "Número do documento do cliente".',
    ])
    expect(await flow.answer('DEV-77')).toEqual({
      awaitingText: false,
      documentNumber: '17234',
      finished: true,
      texts: ['✅ _Número anotado._', 'registered:17234'],
    })
    expect(flow.registered).toEqual([
      {
        ...ACTOR,
        attachmentObjectIds: ['UP1', 'UP2'],
        documentId: 'DOC1',
        idempotencyKey: 'whatsapp-occurrence-draft:O1',
        location: null,
        note: 'cliente devolveu',
        occurrenceTypeId: 'T1',
        referenceNumber: 'DEV-77',
      },
    ])
    expect([...flow.rows.values()][0]?.status).toBe('completed')
  })

  test('opcional é oferecido uma vez e aceita "pular"; o valor pago vai junto', async () => {
    const flow = setup(require({ declaredAmountMode: 'required', photoMode: 'optional' }))
    expect((await flow.begin())?.texts).toEqual([
      '⚠️ *A ocorrência da NF 17234 ainda não foi registrada.*\nFalta: "Valor pago".',
      '📸 *Ocorrência da NF 17234*\nSe puder, mande uma foto.\n_Se não tiver, responda pular._',
    ])
    expect((await flow.answer('pular'))?.texts).toEqual([
      '👍 _Ok, sem esse item._',
      '💰 *Ocorrência da NF 17234*\nDigite "Valor pago" (só o valor, ex.: 125,90).',
    ])
    expect((await flow.answer('cento e vinte'))?.texts).toEqual([
      '🤔 *Não entendi.* Digite só o valor, por exemplo 125,90, ou _pular_, se não for obrigatório.',
    ])
    expect(await flow.answer('cento e vinte', true)).toBeNull()
    expect((await flow.answer('R$ 120,50'))?.finished).toBe(true)
    expect(flow.registered[0]).toMatchObject({ declaredAmount: '120.50' })
    expect(flow.registered[0]).not.toHaveProperty('attachmentObjectIds')
  })

  test('"cancelar" fecha sem registrar; a foto recusada pela conferência pede outra', async () => {
    const flow = setup(require({ photoMode: 'required' }))
    await flow.begin()
    flow.rejectNextPhoto()
    expect((await flow.photo('M1'))?.texts).toEqual([
      '⚠️ *Essa foto não pôde ser usada.* Mande outra, por favor.',
    ])
    expect((await flow.answer('Cancelar'))?.texts).toEqual([
      '↩️ *Ocorrência da NF 17234 cancelada.* Nada foi registrado.',
    ])
    expect(flow.registered).toEqual([])
    expect(await flow.service.hasOpen(ACTOR)).toBe(false)
  })

  test('o servidor recusa no fim: a coleta fecha e o motorista lê a recusa', async () => {
    const flow = setup(require({ photoMode: 'required' }), {
      registerResult: async () => ({
        event: 'occurrence',
        kind: 'refused',
        refusal: { code: 'document_not_reachable' },
      }),
    })
    await flow.begin()
    expect((await flow.photo('M1'))?.texts).toEqual([
      '✅ _Foto da ocorrência recebida._',
      'refused:17234',
    ])
    expect([...flow.rows.values()][0]?.status).toBe('superseded')
  })

  test('erro que não é de negócio deixa a coleta aberta; qualquer texto tenta de novo com a mesma chave', async () => {
    let fail = true
    const flow = setup(require({ photoMode: 'required' }), {
      registerResult: async () => {
        if (fail) {
          fail = false
          throw new Error('boom')
        }
        return REGISTERED
      },
    })
    await flow.begin()
    expect((await flow.photo('M1'))?.texts).toEqual([
      '✅ _Foto da ocorrência recebida._',
      '⚠️ *Não consegui registrar a ocorrência agora.* Responda qualquer coisa para tentar de novo, ou _cancelar_.',
    ])
    expect((await flow.answer('de novo'))?.texts).toEqual(['registered:17234'])
    expect(flow.registered.map((input) => input.idempotencyKey)).toEqual([
      'whatsapp-occurrence-draft:O1',
      'whatsapp-occurrence-draft:O1',
    ])
  })

  test('uma por motorista: escolher outra ocorrência substitui a que ficou para trás', async () => {
    const flow = setup(require({ photoMode: 'required' }))
    await flow.begin()
    await flow.begin()
    expect([...flow.rows.values()].map((row) => row.status)).toEqual(['superseded', 'open'])
  })
})

describe('a fachada das coletas (spec 293 T15)', () => {
  test('a foto vai para a ocorrência que pede foto; senão para a entrega em preparo', async () => {
    const occurrence = setup(require({ photoMode: 'required' }))
    const deliveries = createWhatsAppDeliveryPreparations({
      attachProof: async () => undefined,
      deliver: async () => ({ event: 'deliver', kind: 'registered' }),
      describeResult: async () => 'ok',
      media: {
        read: async () => new Uint8Array(),
        remove: async () => undefined,
        store: async () => ({ objectKey: 'k', sha256: 'x', sizeBytes: 1 }),
      },
      repository: {
        close: async () => true,
        findOpenByDocument: async () => null,
        listOpenForDriver: async () => [] as readonly WhatsAppDeliveryPreparation[],
        open: async () => null,
        save: async () => true,
      },
      resolveSettings: async () => {
        throw new Error('sem entrega em preparo')
      },
    })
    const collections = combineWhatsAppDriverCollections({
      deliveries,
      occurrences: occurrence.service,
    })
    const receive = () =>
      collections.receivePhoto({
        actor: ACTOR,
        bytes: new Uint8Array([1]),
        caption: null,
        mimeType: 'image/jpeg',
        providerMessageId: 'M1',
      })

    expect(await receive()).toBeNull()
    await occurrence.begin()
    expect(await collections.hasOpen(ACTOR)).toBe(true)
    expect(await collections.awaitingText(ACTOR)).toBe(true)
    expect((await receive())?.finished).toBe(true)
    expect(occurrence.registered).toHaveLength(1)
  })
})

describe('a foto do WhatsApp cabe no upload de ocorrência (spec 293 T15)', () => {
  test('a pequena passa como está; a grande vira JPEG dentro do teto; o que não é imagem é recusado', async () => {
    const small = new Uint8Array(
      await sharp({ create: { background: '#fff', channels: 3, height: 10, width: 10 } })
        .jpeg()
        .toBuffer(),
    )
    expect(await fitOccurrencePhoto({ bytes: small, mimeType: 'image/jpeg' })).toEqual({
      bytes: small,
      mimeType: 'image/jpeg',
    })

    // Ruído de verdade não comprime: a foto passa do teto como a de um celular passa.
    const noise = new Uint8Array(2400 * 1800 * 3)
    for (let offset = 0; offset < noise.length; offset += 65_536) {
      crypto.getRandomValues(noise.subarray(offset, offset + 65_536))
    }
    const large = new Uint8Array(
      await sharp(noise, { raw: { channels: 3, height: 1800, width: 2400 } })
        .png()
        .toBuffer(),
    )
    expect(large.byteLength).toBeGreaterThan(OCCURRENCE_PHOTO_MAX_BYTES)
    const fitted = await fitOccurrencePhoto({ bytes: large, mimeType: 'image/png' })
    expect(fitted.mimeType).toBe('image/jpeg')
    expect(fitted.bytes.byteLength).toBeLessThanOrEqual(OCCURRENCE_PHOTO_MAX_BYTES)

    await expect(
      fitOccurrencePhoto({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' }),
    ).rejects.toBeInstanceOf(WhatsAppOccurrencePhotoRejectedError)
  })
})
