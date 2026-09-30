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
import {
  ProofReview,
  type ProofReviewProps,
} from '../../src/modules/trip/components/ProofReview.component'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'

const EXPERIMENTAL_LABEL = 'Experimental'
const SYNTHETIC_NOTE = 'Canhoto molhado e rasgado na dobra'
const REVIEWER_NAME = 'Revisora Sintética'

const onApprove = (): void => undefined
const onReject = (): void => undefined

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

async function renderReview(
  proof: DeliveryProof,
  review: Partial<ProofReviewProps> = {},
): Promise<string> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(ProofReview, { canReview: false, onApprove, onReject, proof, ...review }),
    )
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

  it('pendingUnread: aguardando conferência, sem número e sem Experimental', async () => {
    const text = await renderReview(makeProof({ canhotoReview: 'pending' }))

    expect(text).toContain('Aguardando conferência')
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

    expect(text).toContain('Canhoto recusado')
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

  it('com trip.manage os dois botões existem; sem ele, nenhum está no DOM (T7.9)', async () => {
    const pending = makeProof({ canhotoReview: 'pending' })

    await renderReview(pending, { canReview: true })
    const labels = Array.from(container?.querySelectorAll('button') ?? []).map(
      (button) => button.textContent,
    )
    expect(labels).toEqual(['Aprovar canhoto', 'Recusar canhoto'])

    act(() => root?.unmount())
    container?.remove()
    await renderReview(pending, { canReview: false })
    expect(container?.querySelector('button')).toBeNull()
  })

  it('os botões chamam os callbacks recebidos por prop (T7.9)', async () => {
    const calls: string[] = []
    await renderReview(makeProof({ canhotoReview: 'pending' }), {
      canReview: true,
      onApprove: () => calls.push('approve'),
      onReject: () => calls.push('reject'),
    })

    for (const button of Array.from(container?.querySelectorAll('button') ?? [])) {
      act(() => button.click())
    }

    expect(calls).toEqual(['approve', 'reject'])
  })

  it('veredito já resolvido não oferece botão, mesmo com trip.manage (T7.9)', async () => {
    const approved = makeProof({
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-30T12:00:00Z',
      canhotoReviewOrigin: 'manual',
    })

    await renderReview(approved, { canReview: true })

    expect(container?.querySelector('button')).toBeNull()
  })
})
