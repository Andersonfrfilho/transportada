/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.13: quando `useCanhotoReview` lê e quando não lê. O leitor e o prazo entram pelo
 * parâmetro, então o contrato não usa rede nem relógio falso: o estouro é observado com prazo de
 * milissegundos e um leitor que nunca resolve.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import {
  useCanhotoReview,
  type UseCanhotoReviewParams,
  type UseCanhotoReviewResult,
} from '../../src/modules/trip/hooks/useCanhotoReview.hook'
import type { CanhotoReviewOutcome } from '../../src/modules/trip/shared/canhotoReview.service'

const ACCESS_KEY = '35260112345678000190550010000001231000001234'
const SHORT_DEADLINE_MS = 10
const OUTCOME: CanhotoReviewOutcome = {
  readDocumentId: 'document-1',
  readNumber: '123',
  readSeries: '1',
  readSource: 'barcode',
  review: 'approved',
}

type ReaderCall = Parameters<UseCanhotoReviewParams['readCanhoto']>[0]
type ProofInput = UseCanhotoReviewParams['proof']

const PENDING_PHOTO: ProofInput = {
  canhotoReview: 'pending',
  id: 'proof-receipt',
  kind: 'photo',
}

let root: Root | undefined
let container: HTMLDivElement | undefined
let readerCalls: ReaderCall[] = []
let outcomes: CanhotoReviewOutcome[] = []
let latest: UseCanhotoReviewResult | undefined

function Probe(params: UseCanhotoReviewParams): null {
  latest = useCanhotoReview(params)
  return null
}

function buildParams(overrides: Partial<UseCanhotoReviewParams> = {}): UseCanhotoReviewParams {
  return {
    accessKey: ACCESS_KEY,
    deadlineMs: 1_000,
    onRead: (outcome) => outcomes.push(outcome),
    proof: PENDING_PHOTO,
    readCanhoto: (call) => {
      readerCalls.push(call)
      return Promise.resolve(OUTCOME)
    },
    ...overrides,
  }
}

async function render(params: UseCanhotoReviewParams): Promise<void> {
  await act(async () => {
    root?.render(createElement(Probe, params))
    await Promise.resolve()
  })
}

async function wait(milliseconds: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })
}

describe('o disparo da conferência automática do canhoto (spec 220 T7.13)', () => {
  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    container?.remove()
    root = undefined
    container = undefined
    latest = undefined
  })

  async function mount(params: UseCanhotoReviewParams): Promise<void> {
    readerCalls = []
    outcomes = []
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await render(params)
  }

  it('dispara uma vez por comprovante e entrega o veredito', async () => {
    await mount(buildParams())

    expect(readerCalls).toHaveLength(1)
    expect(readerCalls[0]).toEqual({ accessKey: ACCESS_KEY, proofId: 'proof-receipt' })
    expect(outcomes).toEqual([OUTCOME])
  })

  it('não redispara quando o mesmo comprovante renderiza de novo', async () => {
    await mount(buildParams())
    await render(buildParams({ onRead: () => undefined }))
    await render(buildParams({ deadlineMs: 2_000 }))

    expect(readerCalls).toHaveLength(1)
  })

  it('dispara de novo para outro comprovante', async () => {
    await mount(buildParams())
    await render(buildParams({ proof: { ...PENDING_PHOTO, id: 'proof-other' } }))

    expect(readerCalls.map((call) => call.proofId)).toEqual(['proof-receipt', 'proof-other'])
  })

  it('não dispara quando o comprovante já tem leitura', async () => {
    await mount(buildParams({ proof: { ...PENDING_PHOTO, canhotoReadSource: 'ocr' } }))

    expect(readerCalls).toHaveLength(0)
  })

  it('não dispara quando o comprovante não é foto ou já foi conferido', async () => {
    await mount(buildParams({ proof: { ...PENDING_PHOTO, kind: 'signature' } }))
    await render(buildParams({ proof: { ...PENDING_PHOTO, canhotoReview: 'approved' } }))

    expect(readerCalls).toHaveLength(0)
  })

  it('espera a chave de acesso e dispara uma vez quando ela chega', async () => {
    await mount(buildParams({ accessKey: undefined }))
    expect(readerCalls).toHaveLength(0)

    await render(buildParams())
    await render(buildParams())

    expect(readerCalls).toHaveLength(1)
  })

  it('estourado o prazo, fica pendente e sinaliza que não conferiu', async () => {
    await mount(
      buildParams({
        deadlineMs: SHORT_DEADLINE_MS,
        readCanhoto: (call) => {
          readerCalls.push(call)
          return new Promise<CanhotoReviewOutcome>(() => undefined)
        },
      }),
    )
    expect(latest?.isAutomaticReviewUnavailable).toBe(false)

    await wait(SHORT_DEADLINE_MS * 5)

    expect(latest?.isAutomaticReviewUnavailable).toBe(true)
    expect(outcomes).toEqual([])
  })

  it('leitor que rejeita não derruba a tela e sinaliza que não conferiu', async () => {
    await mount(buildParams({ readCanhoto: () => Promise.reject(new Error('NETWORK_DOWN')) }))
    await wait(0)

    expect(latest?.isAutomaticReviewUnavailable).toBe(true)
    expect(outcomes).toEqual([])
  })

  it('leitura dentro do prazo não sinaliza indisponibilidade', async () => {
    await mount(buildParams())
    await wait(0)

    expect(latest?.isAutomaticReviewUnavailable).toBe(false)
  })
})
