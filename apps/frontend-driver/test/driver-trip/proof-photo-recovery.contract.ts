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
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'
import { resolveRejectionCauseLabelKey } from '@/modules/driver-trip/shared/rejectionCauseLabel.service'

const HOOK = 'src/modules/driver-trip/hooks/useDriverTrip.hook.ts'
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

describe('o canhoto cabe no teto do servidor (spec 212)', () => {
  it('lado de 2000 px, alvo de ~900 KiB e teto duro de 960 KiB — o do escritório', () => {
    expect(PROOF_PHOTO_MAX_SIDE).toBe(2000)
    expect(PROOF_PHOTO_TARGET_BYTES).toBe(900 * KIB)
    expect(PROOF_PHOTO_MAX_BYTES).toBe(960 * KIB)
    const sides = buildProofPhotoSideSequence()
    expect(sides[0]).toBe(2000)
    expect([...sides].sort((a, b) => b - a)).toEqual([...sides])
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

  it('a primeira tentativa que cabe encerra — nada de reduzir à toa', async () => {
    const encodedSides: number[] = []
    await fitProofPhotoWithinCap({
      encode: (maxSide) => {
        encodedSides.push(maxSide)
        return Promise.resolve(new Blob([new Uint8Array(850 * KIB)]))
      },
    })
    expect(encodedSides).toEqual([2000])
  })
})

describe('a drenagem espera a redução (spec 212)', () => {
  it('o item marcado não sobe — nem na drenagem geral, nem no "Enviar agora"', async () => {
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
    const [attachment] = attachmentStore.items()
    if (attachment === undefined) throw new Error('ATTACHMENT_MISSING')

    await reduceQueuedProofPhoto({
      attachment,
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce: reduceTo(600 * KIB).reduce,
      reductions: new Map(),
    })
    const sent = await drain(attachmentStore)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.blob.size).toBe(600 * KIB)
    expect(sent[0]?.pendingReduction).toBeUndefined()
  })

  it('a redução que falha tira a marca e sobe o original — a foto nunca se perde', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 500 * KIB, pendingReduction: true }),
    ])
    const [attachment] = attachmentStore.items()
    if (attachment === undefined) throw new Error('ATTACHMENT_MISSING')

    await reduceQueuedProofPhoto({
      attachment,
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce: () => Promise.reject(new Error('DECODE_FAILED')),
      reductions: new Map(),
    })

    expect(attachmentStore.items()[0]?.pendingReduction).toBeUndefined()
    expect((await drain(attachmentStore))[0]?.blob.size).toBe(500 * KIB)
  })
})

describe('a foto presa volta a subir sozinha (spec 212)', () => {
  it('causa 413 e arquivo grande: reduz, limpa a causa e a drenagem automática leva', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, rejectionCause: '413 PAYLOAD_TOO_LARGE' }),
    ])
    expect(await drain(attachmentStore)).toEqual([])

    const recovered = await recoverQueuedProofPhotos({
      attachmentStore,
      reduce: reduceTo(700 * KIB).reduce,
      reductions: new Map(),
    })
    const sent = await drain(attachmentStore)

    expect(recovered).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.blob.size).toBeLessThanOrEqual(PROOF_PHOTO_MAX_BYTES)
    expect(sent[0]?.rejectionCause).toBeUndefined()
  })

  it('marca que ficou do app fechado no meio da redução: reduz de novo no boot', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 800 * KIB, pendingReduction: true }),
    ])
    const { calls, reduce } = reduceTo(400 * KIB)

    await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions: new Map() })

    expect(calls).toHaveLength(1)
    expect(attachmentStore.items()[0]?.pendingReduction).toBeUndefined()
    expect(attachmentStore.items()[0]?.blob.size).toBe(400 * KIB)
  })

  it('recusado com arquivo pequeno não é tocado — a causa é outra', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 300 * KIB, rejectionCause: '404 TRIP_DELIVERY_PROOF_EVENT_NOT_FOUND' }),
    ])
    const { calls, reduce } = reduceTo(100 * KIB)

    expect(await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions: new Map() })).toBe(
      0,
    )
    expect(calls).toEqual([])
    expect(attachmentStore.items()[0]?.rejectionCause).toBe(
      '404 TRIP_DELIVERY_PROOF_EVENT_NOT_FOUND',
    )
  })

  it('a redução em voo não começa outra: a varredura espera a que já roda', async () => {
    const attachmentStore = createMemoryAttachments([
      photo({ bytes: 3000 * KIB, pendingReduction: true }),
    ])
    const reductions: ProofPhotoReductions = new Map()
    const { calls, reduce } = reduceTo(500 * KIB)
    const [attachment] = attachmentStore.items()
    if (attachment === undefined) throw new Error('ATTACHMENT_MISSING')

    const running = reduceQueuedProofPhoto({
      attachment,
      attachmentStore,
      eventKey: EVENT_KEY,
      reduce,
      reductions,
    })
    await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions })
    await running

    expect(calls).toHaveLength(1)
    expect(attachmentStore.items()[0]?.blob.size).toBe(500 * KIB)
  })

  it('a assinatura não passa pela recuperação', async () => {
    const attachmentStore = createMemoryAttachments([
      { ...photo({ bytes: 1500 * KIB }), kind: 'signature' },
    ])
    const { calls, reduce } = reduceTo(100 * KIB)

    await recoverQueuedProofPhotos({ attachmentStore, reduce, reductions: new Map() })

    expect(calls).toEqual([])
  })
})

describe('o hook liga a trava e a recuperação (spec 212)', () => {
  const hook = readFileSync(HOOK, 'utf8')

  it('a foto nasce marcada e a redução é a do canhoto, não a da ocorrência', () => {
    expect(hook).toInclude('pendingReduction: true')
    expect(hook).toInclude('reduce: reduceProofPhotoToJpeg')
    expect(hook).not.toInclude('reduceOccurrencePhotoToJpeg')
  })

  it('a recuperação roda antes de cada drenagem e no boot', () => {
    const mutationAt = hook.indexOf('mutationFn: async (only?: string) => {')
    const recoverAt = hook.indexOf('await recoverProofPhotos()', mutationAt)
    const drainAt = hook.indexOf('await drainQueueWithAttachments(', mutationAt)

    expect(recoverAt).toBeGreaterThan(mutationAt)
    expect(drainAt).toBeGreaterThan(recoverAt)
    expect(hook).toInclude('.then(() => recoverProofPhotos())')
  })
})

describe('a /fila explica a foto grande (spec 212)', () => {
  it('413 e TOO_LARGE ganham texto humano; o resto segue cru', () => {
    expect(resolveRejectionCauseLabelKey('413 PAYLOAD_TOO_LARGE')).toBe('eventQueue.cause.tooLarge')
    expect(resolveRejectionCauseLabelKey('422 TRIP_DELIVERY_PROOF_TOO_LARGE')).toBe(
      'eventQueue.cause.tooLarge',
    )
    expect(resolveRejectionCauseLabelKey('404 NOT_FOUND')).toBeUndefined()
  })
})
