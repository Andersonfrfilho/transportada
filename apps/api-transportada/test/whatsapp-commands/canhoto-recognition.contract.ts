/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8 (RF23, ADR 0113 §5): a foto sem entrega em preparo é lida pelo OCR local do worker. Exato e único liga
 * ao canhoto da nota (localização opcional, baixa); aproximado, ambíguo ou sem número pergunta; leitor desligado deixa a
 * foto calada; um pedido por vez; o atendente segue o mesmo reconhecimento.
 */
import { describe, expect, test } from 'bun:test'

import {
  createWhatsAppCanhotoRecognition,
  type WhatsAppCanhotoQuestion,
  type WhatsAppCanhotoReaderPort,
} from '../../src/whatsapp-commands/application/whatsapp-canhoto-recognition.service.js'
import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { combineWhatsAppDriverCollections } from '../../src/whatsapp-commands/application/whatsapp-occurrence-draft.service.js'
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverActor,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { CANHOTO_RECOGNITION_SPEECH } from '../../src/whatsapp-commands/domain/whatsapp-canhoto-recognition-speech.constant.js'
import { isCanhotoOcrEnabled } from '../../src/whatsapp-commands/domain/whatsapp-canhoto-ocr-enabled.policy.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

const ACTOR: WhatsAppDriverActor = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }
const SETTINGS: DeliveryProofFieldSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  cargo: 'off',
  photo: 'optional',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}
const NOW = new Date('2026-11-05T15:00:00.000Z')
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const CHOOSE_BOTH = [
  '📸 *De qual nota é este canhoto?*',
  '',
  '*1* - 🧾 NF `17234` · *Mercado Sul*',
  '*2* - 🧾 NF `17300`',
  '*3* - 🗑️ Descartar a foto',
  '',
  '_Responda com o número da opção ou da nota._',
].join('\n')
const PHOTO_KIND = [
  '🤔 *Essa foto não parece um canhoto assinado.*',
  'O que é?',
  '',
  '*1* - 📦 Foto da mercadoria',
  '*2* - 🧾 É o canhoto, sim',
  '*3* - 🗑️ Descartar',
].join('\n')

type Verdict = Awaited<ReturnType<WhatsAppCanhotoReaderPort['read']>>
const exact = (documentId: string): Verdict => ({
  ambiguous: false,
  candidates: [{ documentId, match: 'exact' }],
  markers: 1,
})

function setup(
  options: {
    readonly duplicateOf?: string
    /** C2: quantas gravações da foto na preparação falham antes de passar. */
    readonly failPreparationStores?: number
    /** C2: o bucket fora de vez (nem a foto da pergunta guarda). */
    readonly failAllStores?: boolean
    /** C2: a foto da pergunta sumiu do bucket. */
    readonly lostQuestionPhoto?: boolean
    readonly now?: () => Date
    readonly read?: (input: Parameters<WhatsAppCanhotoReaderPort['read']>[0]) => Promise<Verdict>
    readonly stops?: boolean
    /** A parada 2 (NF 17300) chegou e falta a baixa: é a parada em andamento. */
    readonly secondStopArrived?: boolean
  } = {},
) {
  const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
  const questionRows = new Map<string, WhatsAppCanhotoQuestion & { status: string }>()
  const delivered: WhatsAppDocumentEventInput[] = []
  const attached: { readonly documentId: string; readonly kind: string }[] = []
  const removed: string[] = []
  let readCalls = 0
  let sequence = 0
  let failPreparationStores = options.failPreparationStores ?? 0

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
  const media = {
    read: async () => {
      if (options.lostQuestionPhoto === true) throw new Error('NoSuchKey')
      return BYTES
    },
    remove: async ({ objectKey }: { readonly objectKey: string }) => {
      removed.push(objectKey)
    },
    store: async ({
      bytes,
      preparationId,
    }: {
      readonly bytes: Uint8Array
      readonly preparationId: string
    }) => {
      if (options.failAllStores === true) throw new Error('bucket fora')
      if (preparationId.startsWith('P') && failPreparationStores > 0) {
        failPreparationStores -= 1
        throw new Error('bucket fora')
      }
      return {
        objectKey: `${preparationId}/photo`,
        sha256: 'abc',
        sizeBytes: bytes.byteLength,
      }
    },
  }
  const listStops = async () =>
    options.stops === false
      ? []
      : [
          {
            arrivedAt: null,
            completedAt: null,
            documents: [
              {
                id: 'DOC-A',
                number: '017234',
                recipientName: 'Mercado Sul',
                separationStatus: 'loaded',
              },
              { id: 'DOC-DONE', number: '1', separationStatus: 'delivered' },
            ],
            enRouteSince: null,
            id: 'S1',
            sequence: 1,
          },
          {
            arrivedAt: options.secondStopArrived === true ? '2026-11-05T14:00:00.000Z' : null,
            completedAt: null,
            documents: [{ id: 'DOC-B', number: '17300', separationStatus: 'loaded' }],
            enRouteSince: null,
            id: 'S2',
            sequence: 2,
          },
        ]
  const preparations = createWhatsAppDeliveryPreparations({
    attachProof: async (input) => {
      attached.push({ documentId: input.documentId, kind: input.upload.kind })
      return {}
    },
    deliver: async (input) => {
      delivered.push(input)
      return {
        details: { proofPending: true, stopCompleted: false, tripCompleted: false },
        event: 'deliver',
        kind: 'registered',
      }
    },
    describeResult: async ({ documentNumber }) => `entregue:${documentNumber}`,
    listStops,
    media,
    repository,
    resolveSettings: async () => SETTINGS,
  })
  const reader: WhatsAppCanhotoReaderPort = {
    read: async (input) => {
      readCalls += 1
      return (options.read ?? (async () => exact('DOC-A')))(input)
    },
  }
  const recognition = createWhatsAppCanhotoRecognition({
    clock: options.now ?? (() => NOW),
    ...(options.duplicateOf === undefined
      ? {}
      : {
          findCanhotoByHash: async () => ({
            attachedAt: new Date('2026-11-05T14:32:00.000Z'),
            documentId: options.duplicateOf as string,
          }),
        }),
    listStops,
    media,
    preparations,
    questions: {
      async close({ id, status }) {
        const row = questionRows.get(id)
        if (row !== undefined) questionRows.set(id, { ...row, status })
      },
      expireOpen: async () => [],
      async findOpen({ driverId }) {
        return (
          [...questionRows.values()].find((q) => q.driverId === driverId && q.status === 'open') ??
          null
        )
      },
      async open(input) {
        if (
          [...questionRows.values()].some(
            (q) => q.driverId === input.driverId && q.status === 'open',
          )
        ) {
          return null
        }
        sequence += 1
        const row = { ...input, id: `Q${sequence}`, openedAt: NOW, status: 'open' }
        questionRows.set(row.id, row)
        return row
      },
      async reframe({ candidates, id, kind }) {
        const row = questionRows.get(id)
        if (row !== undefined) questionRows.set(id, { ...row, candidates, kind })
      },
    },
    reader,
  })
  const facade = combineWhatsAppDriverCollections({
    canhoto: recognition,
    deliveries: preparations,
    occurrences: {
      answer: async () => null,
      awaitingText: async () => false,
      hasOpen: async () => false,
      receiveLocation: async () => null,
      receivePhoto: async () => null,
      wantsPhoto: async () => false,
    } as never,
  })
  const photo = (
    actor: WhatsAppDriverActor = ACTOR,
    id = 'M1',
    bytes = BYTES,
    allowsCanhotoReading?: boolean,
  ) =>
    facade.receivePhoto({
      actor,
      ...(allowsCanhotoReading === undefined ? {} : { allowsCanhotoReading }),
      bytes,
      caption: null,
      channel: 'group',
      mimeType: 'image/jpeg',
      providerMessageId: id,
    })
  const answer = (text: string, actor: WhatsAppDriverActor = ACTOR) =>
    facade.answer({ actor, text })
  return {
    answer,
    attached,
    delivered,
    facade,
    photo,
    questionRows,
    readCalls: () => readCalls,
    removed,
    rows,
  }
}

describe('foto sem entrega em preparo: o canhoto lido liga à nota (spec 294 RF23)', () => {
  test('número exato e único: abre a nota com o canhoto, pede a localização e baixa', async () => {
    const t = setup()
    const first = await t.photo()
    expect(first?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
    expect(first?.texts.join('\n')).toContain('localização')
    expect(t.rows.get('P1')?.photos.map((p) => p.kind)).toEqual(['photo'])
    expect(t.questionRows.size).toBe(0)

    const done = await t.answer('pular')
    expect(done?.texts.some((text) => text.includes('Confirm') || text.includes('confirm'))).toBe(
      true,
    )
    const finished = await t.answer('sim')
    expect(finished?.texts.join(' ')).toContain('entregue:17234')
    expect(t.delivered).toHaveLength(1)
    expect(t.attached).toEqual([{ documentId: 'DOC-A', kind: 'photo' }])
  })

  test('várias fotos seguidas: cada canhoto lido abre a sua nota', async () => {
    let next = 'DOC-A'
    const t = setup({ read: async () => exact(next) })
    await t.photo(ACTOR, 'M1')
    await t.answer('pular')
    await t.answer('sim')
    next = 'DOC-B'
    const second = await t.photo(ACTOR, 'M2')
    expect(second?.texts[0]).toBe('📸 *Li o canhoto da NF `17300`.*')
    expect(t.rows.get('P2')?.documentId).toBe('DOC-B')
  })

  test('o atendente passa pelo mesmo reconhecimento, com a baixa do escritório', async () => {
    const attendant: WhatsAppDriverActor = { ...ACTOR, attendant: true }
    const t = setup()
    await t.photo(attendant)
    await t.answer('pular', attendant)
    await t.answer('sim', attendant)
    expect(t.delivered[0]?.attendant).toBe(true)
  })

  test('a mesma imagem de antes: diz de qual nota e não lê nem grava', async () => {
    const t = setup({ duplicateOf: 'DOC-A' })
    const reply = await t.photo()
    expect(reply?.texts).toEqual([
      '🔁 *Esse canhoto já tinha chegado.*\nNF `17234`, entregue às 11:32. Nada foi gravado de novo.',
    ])
    expect(t.readCalls()).toBe(0)
    expect(t.rows.size).toBe(0)
  })
})

describe('no grupo, o bot só lê o canhoto quando é marcado na foto', () => {
  test('foto sem marcar o bot: não vai ao leitor, não pergunta nada, não abre nota', async () => {
    const t = setup()
    expect(await t.photo(ACTOR, 'M1', BYTES, false)).toBeNull()
    expect(t.readCalls()).toBe(0)
    expect(t.questionRows.size).toBe(0)
    expect(t.rows.size).toBe(0)
  })

  test('foto marcando o bot: lê como antes', async () => {
    const t = setup()
    const read = await t.photo(ACTOR, 'M1', BYTES, true)
    expect(read?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
  })
})

describe('o que não é exato pergunta, e nunca baixa por palpite', () => {
  test('casamento aproximado pergunta "é da NF X?"; 1 liga, 2 pergunta de qual', async () => {
    const near: Verdict = {
      ambiguous: false,
      candidates: [{ documentId: 'DOC-A', match: 'near' }],
      markers: 0,
    }
    const t = setup({ read: async () => near })
    const asked = await t.photo()
    expect(asked?.texts).toEqual([
      '📸 *Este canhoto é da NF `17234`?*\n> 🏪 Mercado Sul\n\n*1* - ✅ Sim, é dessa nota\n*2* - 🔄 Não, é de outra',
    ])
    expect(asked?.awaitingText).toBe(true)
    expect(t.rows.size).toBe(0)

    const other = await t.answer('2')
    expect(other?.texts[0]).toBe(CHOOSE_BOTH)
    const chosen = await t.answer('17300')
    expect(chosen?.texts[0]).toBe('📸 *Li o canhoto da NF `17300`.*')
    expect(t.rows.get('P2')?.documentId ?? t.rows.get('P3')?.documentId).toBe('DOC-B')
    expect(t.removed.length).toBeGreaterThan(0)
  })

  test('casamento aproximado confirmado com "sim" liga à nota', async () => {
    const near: Verdict = {
      ambiguous: false,
      candidates: [{ documentId: 'DOC-A', match: 'near' }],
      markers: 0,
    }
    const t = setup({ read: async () => near })
    await t.photo()
    const reply = await t.answer('sim')
    expect(reply?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
  })

  test('ambíguo lista só as notas candidatas, por número da opção', async () => {
    const both: Verdict = {
      ambiguous: true,
      candidates: [
        { documentId: 'DOC-A', match: 'exact' },
        { documentId: 'DOC-B', match: 'exact' },
      ],
      markers: 2,
    }
    const t = setup({ read: async () => both })
    const asked = await t.photo()
    expect(asked?.texts).toEqual([
      [
        '📸 *De qual nota é este canhoto?*',
        '',
        '*1* - 🧾 NF `17234` · *Mercado Sul*',
        '*2* - 🧾 NF `17300`',
        '*3* - 🗑️ Descartar a foto',
        '',
        '_Responda com o número da opção ou da nota._',
      ].join('\n'),
    ])
    const chosen = await t.answer('2')
    expect(chosen?.texts[0]).toBe('📸 *Li o canhoto da NF `17300`.*')
  })

  test('duas marcas e nenhum número legível: pergunta de qual nota com todas as abertas', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 3 }) })
    const asked = await t.photo()
    expect(asked?.texts[0]).toBe(CHOOSE_BOTH)
  })

  test('menos de duas marcas e sem número: "mercadoria / é o canhoto / descartar"', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 1 }) })
    const asked = await t.photo()
    expect(asked?.texts[0]).toBe(PHOTO_KIND)
    expect((await t.answer('2'))?.texts[0]).toBe(CHOOSE_BOTH)
    expect((await t.answer('descartar'))?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.discarded])
    expect(t.questionRows.size).toBe(1)
    expect([...t.questionRows.values()][0]?.status).toBe('cancelled')
  })

  test('"1 - mercadoria" anota e descarta a foto; resposta que não entende repete a pergunta', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 0 }) })
    await t.photo()
    expect((await t.answer('talvez'))?.texts).toEqual([
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - 📦 Foto da mercadoria',
        '*2* - 🧾 É o canhoto, sim',
        '*3* - 🗑️ Descartar',
      ].join('\n'),
    ])
    expect((await t.answer('1'))?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.cargoNoted])
    expect(t.rows.size).toBe(0)
  })

  test('na conversa individual, texto que não responde segue para o menu', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 0 }) })
    await t.photo()
    expect(await t.facade.answer({ actor: ACTOR, strict: true, text: 'menu' })).toBeNull()
  })

  test('nota de outro motorista (fora das abertas dele) nunca é candidata', async () => {
    const foreign: Verdict = {
      ambiguous: false,
      candidates: [{ documentId: 'DOC-OTHER', match: 'exact' }],
      markers: 0,
    }
    const t = setup({ read: async () => foreign })
    const asked = await t.photo()
    expect(asked?.texts[0]).toContain('não parece um canhoto')
    expect(t.rows.size).toBe(0)
  })
})

describe('C2: a resposta só fecha a pergunta depois de a foto ir para a nota', () => {
  const near: Verdict = {
    ambiguous: false,
    candidates: [{ documentId: 'DOC-A', match: 'near' }],
    markers: 0,
  }

  test('falha ao guardar: a pergunta segue aberta com a foto, e a resposta seguinte liga à nota', async () => {
    const t = setup({ failPreparationStores: 1, read: async () => near })
    await t.photo()
    const failed = await t.answer('sim')
    expect(failed?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.storeFailed])
    expect(failed?.awaitingText).toBe(true)
    expect([...t.questionRows.values()][0]?.status).toBe('open')
    expect(t.removed).toEqual([])

    const retried = await t.answer('sim')
    expect(retried?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
    expect([...t.questionRows.values()][0]?.status).toBe('completed')
    expect(t.removed).toHaveLength(1)
  })

  test('a foto da pergunta sumiu do bucket: fecha e pede a foto de novo, nunca calado', async () => {
    const t = setup({ lostQuestionPhoto: true, read: async () => near })
    await t.photo()
    const reply = await t.answer('sim')
    expect(reply?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.photoLost])
    expect([...t.questionRows.values()][0]?.status).toBe('cancelled')
  })
})

describe('C2: canhoto lido direto que não consegue ir para a nota', () => {
  test('falha ao guardar: a foto fica numa pergunta "é da NF X?", e o "sim" liga à nota', async () => {
    const t = setup({ failPreparationStores: 1 })
    const asked = await t.photo()
    expect(asked?.texts).toEqual([
      [
        '⚠️ *Não consegui guardar a foto na nota agora.* Ela ficou guardada.',
        '',
        '📸 *Este canhoto é da NF `17234`?*',
        '> 🏪 Mercado Sul',
        '',
        '*1* - ✅ Sim, é dessa nota',
        '*2* - 🔄 Não, é de outra',
      ].join('\n'),
    ])
    expect(asked?.awaitingText).toBe(true)
    expect([...t.questionRows.values()][0]?.status).toBe('open')

    expect((await t.answer('sim'))?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
    expect([...t.questionRows.values()][0]?.status).toBe('completed')
  })

  test('bucket fora de vez: pede a foto de novo, nunca calado e sem pergunta órfã', async () => {
    const t = setup({ failAllStores: true })
    const reply = await t.photo()
    expect(reply?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.storeFailedResend])
    expect(t.questionRows.size).toBe(0)
  })
})

describe('leitor indisponível, um pedido por vez e prazo (RNF1)', () => {
  test('rota ausente ou OCR desligado no worker: a foto segue calada', async () => {
    const t = setup({
      read: async () => {
        throw Object.assign(new Error('unreachable'), { reason: 'unreachable' })
      },
    })
    expect(await t.photo()).toBeNull()
    expect(t.questionRows.size).toBe(0)
  })

  test('S7: leitor ocupado (fila cheia ou carregando) pergunta de qual nota, sem baixar', async () => {
    const t = setup({
      read: async () => {
        throw Object.assign(new Error('busy'), { reason: 'busy' })
      },
    })
    const asked = await t.photo()
    expect(asked?.texts[0]).toBe(CHOOSE_BOTH)
    expect(asked?.awaitingText).toBe(true)
    expect(t.rows.size).toBe(0)
    expect((await t.answer('17234'))?.texts[0]).toBe('📸 *Li o canhoto da NF `17234`.*')
  })

  test('C1: falha do motor, prazo estourado ou rede: avisa e cai na pergunta 1/2/3, nunca calado', async () => {
    for (const reason of ['failed', 'timeout']) {
      const t = setup({
        read: async () => {
          throw Object.assign(new Error(reason), { reason })
        },
      })
      const asked = await t.photo()
      expect(asked?.texts[0]).toBe(`⚠️ *Não consegui ler a foto agora.*\n\n${PHOTO_KIND}`)
      expect(t.rows.size).toBe(0)
    }
  })

  test('S7: o leitor recebe a empresa como chave da fila', async () => {
    const keys: (string | undefined)[] = []
    const t = setup({
      read: async (input) => {
        keys.push(input.queueKey)
        return exact('DOC-A')
      },
    })
    await t.photo()
    expect(keys).toEqual(['C1'])
  })

  test('S6: o que não é JPEG, PNG ou WebP pelos bytes nem vai ao leitor e cai na pergunta', async () => {
    const t = setup()
    const asked = await t.photo(ACTOR, 'M1', new Uint8Array([0x25, 0x50, 0x44, 0x46]))
    expect(t.readCalls()).toBe(0)
    expect(asked?.texts[0]).toContain(CANHOTO_RECOGNITION_SPEECH.readerUnavailable)
  })

  test('com pergunta aberta, outra foto não abre outra: pede a resposta antes', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 0 }) })
    await t.photo(ACTOR, 'M1')
    const second = await t.photo(ACTOR, 'M2')
    expect(second?.texts).toEqual([CANHOTO_RECOGNITION_SPEECH.busy])
    expect(t.questionRows.size).toBe(1)
    expect(t.readCalls()).toBe(1)
  })

  test('a pergunta aberta conta como pedido aberto para os canais e responde ao texto', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 0 }) })
    expect(await t.facade.acceptsUnsolicitedPhoto?.(ACTOR)).toBe(true)
    await t.photo()
    expect(await t.facade.hasOpen(ACTOR)).toBe(true)
    expect(await t.facade.awaitingText(ACTOR)).toBe(true)
  })

  test('sem nota aberta do motorista a foto segue calada e nem chega ao leitor', async () => {
    const t = setup({ stops: false })
    expect(await t.facade.acceptsUnsolicitedPhoto?.(ACTOR)).toBe(false)
    expect(await t.photo()).toBeNull()
    expect(t.readCalls()).toBe(0)
  })

  test('pergunta sem resposta por mais de 30 minutos vence e a foto é apagada', async () => {
    let now = NOW
    const t = setup({
      now: () => now,
      read: async () => ({ ambiguous: false, candidates: [], markers: 0 }),
    })
    await t.photo()
    now = new Date(NOW.getTime() + 31 * 60 * 1000)
    expect(await t.facade.hasOpen(ACTOR)).toBe(false)
    expect(t.removed).toHaveLength(1)
    expect(await t.answer('1')).toBeNull()
  })
})

describe('o OCR liga por ambiente (spec 294 T4.8)', () => {
  test('ligado fora de produção, desligado em produção, e a variável manda', () => {
    expect(isCanhotoOcrEnabled({ APP_ENV: 'staging' })).toBe(true)
    expect(isCanhotoOcrEnabled({})).toBe(true)
    expect(isCanhotoOcrEnabled({ APP_ENV: 'production' })).toBe(false)
    expect(isCanhotoOcrEnabled({ APP_ENV: 'production', CANHOTO_OCR_ENABLED: 'true' })).toBe(true)
    expect(isCanhotoOcrEnabled({ APP_ENV: 'staging', CANHOTO_OCR_ENABLED: 'false' })).toBe(false)
  })
})

describe('foto sem pergunta aberta: a parada em andamento vem primeiro (nunca baixa por palpite)', () => {
  const CONFIRM_17300 =
    '📸 *Este canhoto é da NF `17300`?*\n\n*1* - ✅ Sim, é dessa nota\n*2* - 🔄 Não, é de outra'

  test('canhoto sem número legível: pergunta pela nota da parada que chegou, não pela lista da viagem', async () => {
    const t = setup({
      read: async () => ({ ambiguous: false, candidates: [], markers: 3 }),
      secondStopArrived: true,
    })
    expect((await t.photo())?.texts).toEqual([CONFIRM_17300])
    expect(t.attached).toEqual([])
    const confirmed = await t.answer('1')
    expect(confirmed?.texts[0]).toBe('📸 *Li o canhoto da NF `17300`.*')
    expect([...t.rows.values()].map((row) => row.documentId)).toEqual(['DOC-B'])
  })

  test('leitor ocupado: pergunta pela nota da parada em andamento', async () => {
    const t = setup({
      read: async () => {
        throw Object.assign(new Error('busy'), { reason: 'busy' })
      },
      secondStopArrived: true,
    })
    expect((await t.photo())?.texts).toEqual([CONFIRM_17300])
  })

  test('leitura ambígua entre notas: a da parada em andamento é a perguntada', async () => {
    const t = setup({
      read: async () => ({
        ambiguous: true,
        candidates: [
          { documentId: 'DOC-A', match: 'near' },
          { documentId: 'DOC-B', match: 'near' },
        ],
        markers: 2,
      }),
      secondStopArrived: true,
    })
    expect((await t.photo())?.texts).toEqual([CONFIRM_17300])
  })

  test('"é o canhoto" depois de "não parece canhoto": pergunta pela nota da parada em andamento', async () => {
    const t = setup({
      read: async () => ({ ambiguous: false, candidates: [], markers: 0 }),
      secondStopArrived: true,
    })
    await t.photo()
    expect((await t.answer('2'))?.texts).toEqual([CONFIRM_17300])
  })

  test('"não, é de outra" abre a lista inteira da viagem', async () => {
    const t = setup({
      read: async () => ({ ambiguous: false, candidates: [], markers: 3 }),
      secondStopArrived: true,
    })
    await t.photo()
    expect((await t.answer('2'))?.texts[0]).toBe(CHOOSE_BOTH)
  })

  test('sem parada em andamento, a lista da viagem como antes', async () => {
    const t = setup({ read: async () => ({ ambiguous: false, candidates: [], markers: 3 }) })
    expect((await t.photo())?.texts[0]).toBe(CHOOSE_BOTH)
  })
})
