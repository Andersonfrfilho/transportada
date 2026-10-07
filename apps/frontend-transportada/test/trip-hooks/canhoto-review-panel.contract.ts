/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.8: o veredito do canhoto vira selo no item da nota. A tradução veredito -> texto é da
 * `presentCanhotoReview` (T7.6, contrato puro); aqui se prova só o que ela não alcança: que cada
 * chave vira o texto e o selo certos no DOM, que sem veredito não sobra nada, e que o selo
 * Experimental e a nota livre aparecem apenas onde a spec manda.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { ProofReview } from '../../src/modules/trip/components/ProofReview.component'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'

const EXPERIMENTAL_LABEL = 'Experimental'
const SYNTHETIC_NOTE = 'Canhoto molhado e rasgado na dobra'
const REVIEWER_NAME = 'Revisora Sintética'

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeProof(overrides: Partial<DeliveryProof>): DeliveryProof {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: 'https://storage.test/original/proof-1',
    expiresAt: '2026-09-30T10:05:00Z',
    id: 'proof-1',
    kind: 'photo',
    receiverName: '',
    ...overrides,
  }
}

async function renderReview(proof: DeliveryProof): Promise<string> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProofReview, { proof }))
    await Promise.resolve()
  })
  return container.textContent ?? ''
}

function badgeTexts(): string[] {
  return Array.from(container?.querySelectorAll('.ui-badge') ?? []).map(
    (badge) => badge.textContent ?? '',
  )
}

describe('o veredito do canhoto aparece no item da nota (spec 220 T7.8)', () => {
  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    container?.remove()
    root = undefined
    container = undefined
  })

  it('approvedAutomatic: conferido automaticamente, sem selo Experimental', async () => {
    const text = await renderReview(
      makeProof({ canhotoReview: 'approved', canhotoReviewOrigin: 'automatic' }),
    )

    expect(text).toContain('Conferido automaticamente')
    expect(badgeTexts()).not.toContain(EXPERIMENTAL_LABEL)
  })

  it('approvedManual: diz quem aprovou', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReview: 'approved',
        canhotoReviewAt: '2026-09-30T12:00:00Z',
        canhotoReviewByName: REVIEWER_NAME,
        canhotoReviewOrigin: 'manual',
      }),
    )

    expect(text).toContain(`Aprovado por ${REVIEWER_NAME}`)
  })

  it('approvedManualUnknown: sem o nome, a frase não deixa buraco', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReview: 'approved',
        canhotoReviewAt: '2026-09-30T12:00:00Z',
        canhotoReviewOrigin: 'manual',
      }),
    )

    expect(text).toContain('Aprovado manualmente em ')
    expect(text).not.toContain('Aprovado por')
    expect(text).not.toMatch(/ {2}/)
  })

  it('pendingBarcode: mostra a nota que o código de barras aponta, sem Experimental', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReadNumber: '000123456',
        canhotoReadSeries: '001',
        canhotoReadSource: 'barcode',
        canhotoReview: 'pending',
      }),
    )

    expect(text).toContain('o código de barras aponta a nota 123456/1')
    expect(badgeTexts()).not.toContain(EXPERIMENTAL_LABEL)
  })

  it('pendingOcr: mostra o número lido e é o único veredito com selo Experimental', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReadNumber: '000123456',
        canhotoReadSource: 'ocr',
        canhotoReview: 'pending',
      }),
    )

    expect(text).toContain('número lido 123456')
    expect(badgeTexts()).toContain(EXPERIMENTAL_LABEL)
  })

  /** O selo do cabeçalho da nota já diz "Aguardando conferência": repetir a frase era ruído (revisão da 233). */
  it('pendingUnread: a frase não repete o selo, e sem número nem Experimental nada sobra', async () => {
    const text = await renderReview(makeProof({ canhotoReview: 'pending' }))

    expect(text).toBe('')
    expect(text).not.toContain('número lido')
    expect(badgeTexts()).not.toContain(EXPERIMENTAL_LABEL)
  })

  it('rejected: mostra o motivo, e a nota livre só com "outro motivo"', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReview: 'rejected',
        canhotoReviewNote: SYNTHETIC_NOTE,
        canhotoReviewReason: 'illegible',
      }),
    )

    expect(text).not.toContain('Canhoto recusado')
    expect(text).toContain('Ilegível')
    expect(text).not.toContain(SYNTHETIC_NOTE)
  })

  it('rejected com outro motivo: a nota aparece', async () => {
    const text = await renderReview(
      makeProof({
        canhotoReview: 'rejected',
        canhotoReviewNote: SYNTHETIC_NOTE,
        canhotoReviewReason: 'other',
      }),
    )

    expect(text).toContain('Outro motivo')
    expect(text).toContain(SYNTHETIC_NOTE)
  })

  it('sem veredito (assinatura, mercadoria, comprovante antigo) não renderiza nada', async () => {
    const text = await renderReview(makeProof({ kind: 'signature' }))

    expect(text).toBe('')
    expect(container?.children[0]).toBeUndefined()
  })
})
