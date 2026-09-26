/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  drainQueueWithAttachments,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { OfflineQueueStore } from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  recoverQueuedProofPhotos,
  reduceQueuedProofPhoto,
  type ProofPhotoReductions,
} from '@/modules/driver-trip/shared/proofPhotoRecovery.service'
import {
  buildProofPhotoSideSequence,
  fitProofPhotoWithinCap,
  PROOF_PHOTO_MAX_BYTES,
  PROOF_PHOTO_MAX_SIDE,
  PROOF_PHOTO_TARGET_BYTES,
  shouldReduceProofFile,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'

const KIB = 1024
const EVENT_KEY = 'document:document-1'

function emptyQueue(): OfflineQueueStore {
  return { read: () => Promise.resolve([]), update: () => Promise.resolve([]) }
}

function createMemoryAttachments(
  initial: readonly QueuedAttachment[],
): AttachmentStore & { readonly items: () => readonly QueuedAttachment[] } {
  const entries = new Map<string, readonly QueuedAttachment[]>([[EVENT_KEY, initial]])
  return {
    items: () => entries.get(EVENT_KEY) ?? [],
    read: (eventKey) => Promise.resolve(entries.get(eventKey) ?? []),
    readAll: () => Promise.resolve([...entries.entries()]),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: (eventKey) => {
      entries.delete(eventKey)
      return Promise.resolve()
    },
    update: (input) => {
      const next = input.mutate(entries.get(input.eventKey) ?? [])
      if (next.length === 0) entries.delete(input.eventKey)
      else entries.set(input.eventKey, next)
      return Promise.resolve(next)
    },
  }
}

function photo(input: {
  readonly bytes: number
  readonly pendingReduction?: true
  readonly rejectionCause?: string
}): QueuedAttachment {
  return {
    attachmentKey: 'canhoto-1',
    blob: new Blob([new Uint8Array(input.bytes)], { type: 'image/jpeg' }),
    capturedAt: '2026-09-26T12:00:00.000Z',
    documentId: 'document-1',
    fileName: 'IMG_0001.jpg',
    kind: 'photo',
    ...(input.pendingReduction === undefined ? {} : { pendingReduction: input.pendingReduction }),
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
  }
}

function reduceTo(bytes: number) {
  const calls: string[] = []
  return {
    calls,
    reduce: (file: File) => {
      calls.push(file.name)
      return Promise.resolve({
        blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
        fileName: 'IMG_0001.jpg',
      })
    },
  }
}

async function drain(attachmentStore: AttachmentStore, only?: string) {
  const sent: QueuedAttachment[] = []
  await drainQueueWithAttachments({
    attachmentStore,
    ...(only === undefined ? {} : { only }),
    send: () => Promise.resolve({ kind: 'sent' }),
    sendAttachment: (attachment): Promise<AttachmentSendOutcome> => {
      sent.push(attachment)
      return Promise.resolve({ kind: 'sent' })
    },
    store: emptyQueue(),
  })
  return sent
}

function firstItem(attachmentStore: ReturnType<typeof createMemoryAttachments>): QueuedAttachment {
  const [attachment] = attachmentStore.items()
  if (attachment === undefined) throw new Error('ATTACHMENT_MISSING')
  return attachment
}

describe('/minha-viagem: o canhoto cabe no teto do servidor (spec 212)', () => {
  it('a mesma régua da app do motorista: 2000 px, ~900 KiB, teto de 960 KiB', () => {
    expect(PROOF_PHOTO_MAX_SIDE).toBe(2000)
    expect(PROOF_PHOTO_TARGET_BYTES).toBe(900 * KIB)
    expect(PROOF_PHOTO_MAX_BYTES).toBe(960 * KIB)
    expect(buildProofPhotoSideSequence()[0]).toBe(2000)
  })

  it('só a foto reduz — assinatura e PDF ficam como estão', () => {
    const image = new File(['x'], 'canhoto.jpg', { type: 'image/jpeg' })
    const pdf = new File(['x'], 'canhoto.pdf', { type: 'application/pdf' })

    expect(shouldReduceProofFile({ file: image, kind: 'photo' })).toBe(true)
    expect(shouldReduceProofFile({ file: pdf, kind: 'photo' })).toBe(false)
    expect(shouldReduceProofFile({ file: image, kind: 'signature' })).toBe(false)
  })

  it('se a tentativa passa do teto, o lado cai de novo até caber', async () => {
    const encodedSides: number[] = []
    const blob = await fitProofPhotoWithinCap({
      encode: (maxSide) => {
        encodedSides.push(maxSide)
        const bytes = maxSide >= 1600 ? 1200 * KIB : 700 * KIB
        return Promise.resolve(new Blob([new Uint8Array(bytes)]))
      },
    })

    expect(blob.size).toBeLessThanOrEqual(PROOF_PHOTO_MAX_BYTES)
    expect(encodedSides).toEqual([2000, 1600, 1280])
  })
})

describe('/minha-viagem: a drenagem espera a redução (spec 212)', () => {
  it('o item marcado não sobe — nem na drenagem geral, nem no "Enviar"', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, pendingReduction: true }),
    ])

    expect(await drain(attachmentStore)).toEqual([])
    expect(await drain(attachmentStore, EVENT_KEY)).toEqual([])
    expect(attachmentStore.items()).toHaveLength(1)
  })

  it('a redução troca o arquivo, tira a marca e o item volta a ser drenável', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, pendingReduction: true }),
    ])

    await reduceQueuedProofPhoto({
      attachment: firstItem(attachmentStore),
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce: reduceTo(600 * KIB).reduce,
      reductions: new Map(),
    })
    const sent = await drain(attachmentStore)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.blob.size).toBe(600 * KIB)
  })

  it('a redução que falha tira a marca e sobe o original', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 500 * KIB, pendingReduction: true }),
    ])

    await reduceQueuedProofPhoto({
      attachment: firstItem(attachmentStore),
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce: () => Promise.reject(new Error('DECODE_FAILED')),
      reductions: new Map(),
    })

    expect((await drain(attachmentStore))[0]?.blob.size).toBe(500 * KIB)
  })
})

describe('/minha-viagem: a foto presa volta a subir sozinha (spec 212)', () => {
  it('causa 413 e arquivo grande: reduz, limpa a causa e a drenagem automática leva', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, rejectionCause: '413 PAYLOAD_TOO_LARGE' }),
    ])
    expect(await drain(attachmentStore)).toEqual([])

    await recoverQueuedProofPhotos({
      attachmentStore,
      reduce: reduceTo(700 * KIB).reduce,
      reductions: new Map(),
    })
    const sent = await drain(attachmentStore)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.blob.size).toBeLessThanOrEqual(PROOF_PHOTO_MAX_BYTES)
    expect(sent[0]?.rejectionCause).toBeUndefined()
  })

  it('recusado com arquivo pequeno não é tocado', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 300 * KIB, rejectionCause: '404 NOT_FOUND' }),
    ])
    const { calls, reduce } = reduceTo(100 * KIB)

    await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions: new Map() })

    expect(calls).toEqual([])
    expect(attachmentStore.items()[0]?.rejectionCause).toBe('404 NOT_FOUND')
  })

  it('a redução em voo não começa outra', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, pendingReduction: true }),
    ])
    const reductions: ProofPhotoReductions = new Map()
    const { calls, reduce } = reduceTo(500 * KIB)

    const running = reduceQueuedProofPhoto({
      attachment: firstItem(attachmentStore),
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce,
      reductions,
    })
    await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions })
    await running

    expect(calls).toHaveLength(1)
  })
})

describe('/minha-viagem: o hook liga a trava e a recuperação (spec 212)', () => {
  const hook = readFileSync(
    new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url),
    'utf8',
  )

  it('a foto nasce marcada e reduz antes de pedir a drenagem', () => {
    expect(hook).toInclude('pendingReduction: true')
    expect(hook).toInclude('reduce: reduceProofPhotoToJpeg')
    expect(hook).toInclude('void reduction.finally(() => requestDrain(undefined))')
  })

  it('a recuperação roda antes de cada drenagem e no boot', () => {
    const mutationAt = hook.indexOf('mutationFn: async (only?: string) => {')
    const recoverAt = hook.indexOf('await recoverProofPhotos()', mutationAt)
    const drainAt = hook.indexOf('return drainQueueWithAttachments(', mutationAt)

    expect(mutationAt).toBeGreaterThan(-1)
    expect(recoverAt).toBeGreaterThan(mutationAt)
    expect(drainAt).toBeGreaterThan(recoverAt)
    expect(hook).toInclude('.then(() => recoverProofPhotos())')
  })
})
