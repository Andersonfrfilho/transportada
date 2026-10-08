/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'
import { buildDocumentOccurrenceReport } from '../../src/modules/driver-trip/shared/documentOccurrenceReport.service'
import type {
  DriverFieldReport,
  DriverOccurrencePhoto,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationDraft,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import {
  canRegisterOccurrence,
  listMissingOccurrenceFields,
} from '../../src/modules/driver-trip/shared/occurrenceRegistration.service'
import { enqueueReport } from '../../src/modules/driver-trip/shared/offlineQueue.service'

/**
 * Spec 246 (T4.3, CA05, RF7): "Registrar" fica desabilitado enquanto faltar campo obrigatório e
 * habilita assim que o último é capturado — **sem rede**: a conferência lê o tipo que o snapshot já
 * trouxe e o que está no aparelho. Sem rede o registro entra na fila com todos os campos exigidos; e
 * sem um campo `required`, nada entra.
 */
const DOCUMENT_ID = 'document-1'
const STOP_ID = 'stop-1'

function photo(name: string): DriverOccurrencePhoto {
  return { blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), fileName: name }
}
const SIGNATURE = {
  blob: new Blob([new Uint8Array(4)], { type: 'image/png' }),
  fileName: 'assinatura.png',
}

/** Todos os campos exigidos, o mínimo de fotos em 2: o caso em que mais coisa pode faltar. */
const DEMANDING_TYPE: DriverOccurrenceType = {
  flow: 'document',
  id: 'type-1',
  itemsMinimumCount: null,
  itemsMode: 'required',
  name: 'Recusa total',
  noteMode: 'required',
  photoMinimumCount: 2,
  photoMode: 'required',
  signatureMode: 'required',
}

const originalFetch = globalThis.fetch
let networkCalls = 0

beforeEach(() => {
  networkCalls = 0
  globalThis.fetch = (() => {
    networkCalls += 1
    return Promise.reject(new TypeError('Failed to fetch'))
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function captureHandlers(queued: DriverFieldReport[]): OccurrenceRegistrationHandlers {
  return {
    enqueueDocumentOccurrence: (occurrence) =>
      queued.push(buildDocumentOccurrenceReport({ idempotencyKey: 'chave-1', occurrence })),
    reportStopOccurrence: () => undefined,
  }
}

function dispatch(input: {
  readonly draft: OccurrenceRegistrationDraft
  readonly handlers: OccurrenceRegistrationHandlers
}) {
  return dispatchOccurrenceRegistration({
    documentId: DOCUMENT_ID,
    draft: input.draft,
    handlers: input.handlers,
    stopId: STOP_ID,
    type: DEMANDING_TYPE,
  })
}

describe('o botão habilita ao capturar o último campo, sem rede (CA05)', () => {
  it('cada captura tira um motivo da lista, e o último libera o botão', () => {
    const facts = {
      hasNote: false,
      hasPhoto: false,
      hasProducts: false,
      hasSignature: false,
      photoCount: 0,
    }
    const steps = [
      { expected: ['products', 'note', 'photo', 'signature'], facts },
      { expected: ['products', 'photo', 'signature'], facts: { ...facts, hasNote: true } },
      {
        expected: ['photo', 'signature'],
        facts: { ...facts, hasNote: true, hasProducts: true },
      },
      {
        expected: ['photoMinimum', 'signature'],
        facts: { ...facts, hasNote: true, hasPhoto: true, hasProducts: true, photoCount: 1 },
      },
      {
        expected: ['signature'],
        facts: { ...facts, hasNote: true, hasPhoto: true, hasProducts: true, photoCount: 2 },
      },
      {
        expected: [],
        facts: {
          hasNote: true,
          hasPhoto: true,
          hasProducts: true,
          hasSignature: true,
          photoCount: 2,
        },
      },
    ] as const

    for (const step of steps) {
      expect(listMissingOccurrenceFields({ ...step.facts, type: DEMANDING_TYPE })).toEqual(
        step.expected,
      )
      expect(
        canRegisterOccurrence({ ...step.facts, isPhotoReading: false, type: DEMANDING_TYPE }),
      ).toBe(step.expected.length === 0)
    }
    expect(networkCalls).toBe(0)
  })

  it('a foto ainda sendo reduzida segura o botão mesmo com tudo capturado', () => {
    expect(
      canRegisterOccurrence({
        hasNote: true,
        hasPhoto: true,
        hasProducts: true,
        hasSignature: true,
        isPhotoReading: true,
        photoCount: 2,
        type: DEMANDING_TYPE,
      }),
    ).toBe(false)
  })
})

describe('sem rede: o registro completo entra na fila, o incompleto não entra (CA05)', () => {
  it('tudo exigido capturado: um item na fila, com a observação, as duas fotos e a assinatura', async () => {
    const built: DriverFieldReport[] = []
    const route = dispatch({
      draft: {
        description: 'Cliente recusou todos os volumes',
        extraPhotos: [photo('dois.jpg')],
        hasProducts: true,
        photo: photo('um.jpg'),
        signature: SIGNATURE,
      },
      handlers: captureHandlers(built),
    })
    const queue = createMemoryQueue()
    const [report] = built
    if (report === undefined) throw new Error('a ocorrência não chegou ao handler')
    const result = await enqueueReport({
      now: new Date('2026-10-06T10:00:00Z'),
      report,
      store: queue,
    })

    expect(route).toBe('document-queued')
    expect(result.accepted).toBe(true)
    expect(queue.items()).toHaveLength(1)
    expect(queue.items()[0]?.report).toMatchObject({
      kind: 'documentOccurrence',
      note: 'Cliente recusou todos os volumes',
      productCode: '',
      signature: SIGNATURE,
    })
    const stored = queue.items()[0]?.report
    expect(stored?.kind === 'documentOccurrence' ? stored.extraPhotos : undefined).toHaveLength(1)
    expect(networkCalls).toBe(0)
  })

  it('falta a assinatura: o despacho recusa, nada vai ao handler e a fila segue vazia', () => {
    const built: DriverFieldReport[] = []
    const queue = createMemoryQueue()

    const route = dispatch({
      draft: {
        description: 'Cliente recusou',
        extraPhotos: [photo('dois.jpg')],
        hasProducts: true,
        photo: photo('um.jpg'),
      },
      handlers: captureHandlers(built),
    })

    expect(route).toBe('blocked')
    expect(built).toHaveLength(0)
    expect(queue.items()).toHaveLength(0)
    expect(networkCalls).toBe(0)
  })

  it('cada campo obrigatório, tirado sozinho, bloqueia', () => {
    const complete: OccurrenceRegistrationDraft = {
      description: 'Cliente recusou',
      extraPhotos: [photo('dois.jpg')],
      hasProducts: true,
      photo: photo('um.jpg'),
      signature: SIGNATURE,
    }
    const withoutField: readonly OccurrenceRegistrationDraft[] = [
      { ...complete, description: '' },
      { ...complete, hasProducts: false },
      { ...complete, photo: undefined },
      { ...complete, extraPhotos: [] },
      { ...complete, signature: undefined },
    ]

    for (const draft of withoutField) {
      const built: DriverFieldReport[] = []
      expect(dispatch({ draft, handlers: captureHandlers(built) })).toBe('blocked')
      expect(built).toHaveLength(0)
    }
    const accepted: DriverFieldReport[] = []
    expect(dispatch({ draft: complete, handlers: captureHandlers(accepted) })).toBe(
      'document-queued',
    )
    expect(accepted).toHaveLength(1)
  })

  it('o botão é desabilitado pelo gate, e quem chama só fecha o formulário quando registrou', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (path: string) =>
      readFileSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url), 'utf8')

    expect(read('components/OccurrenceRegisterAction.component.tsx')).toInclude(
      'disabled={!canRegister}',
    )
    expect(read('components/DriverOccurrenceRegistrationForm.component.tsx')).toInclude(
      'if (form.handleRegister()) onClose()',
    )
  })
})
