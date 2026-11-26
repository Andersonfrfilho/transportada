/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344: a linha de /pendencias mostra a miniatura da foto e, ao clicar, abre o original.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { CanhotoProofPreview } from '../../src/modules/pending-items/components/CanhotoProofPreview.component'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'

const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

const PROOF: DeliveryProof = {
  canhotoReview: 'pending',
  createdAt: '2026-11-22T10:00:00Z',
  downloadUrl: 'https://storage.test/original/proof-1',
  expiresAt: '2026-11-22T10:05:00Z',
  id: 'proof-1',
  kind: 'photo',
  receiverName: '',
  thumbnailUrl: 'https://storage.test/thumb/proof-1',
}

let root: Root | undefined
let container: HTMLDivElement | undefined

async function render(proofs: readonly DeliveryProof[]): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => {
    root?.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CanhotoProofPreview, {
          documentId: 'doc-1',
          proofId: 'proof-1',
          readProofs: () => Promise.resolve(proofs),
          tripId: 'trip-1',
        }),
      ),
    )
  })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

describe('a miniatura da foto em /pendencias (spec 344)', () => {
  beforeEach(() => {
    window.history.back = () => undefined
    window.history.pushState = () => undefined
  })

  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    window.history.back = originalHistoryBack
    window.history.pushState = originalPushState
    container?.remove()
    root = undefined
    container = undefined
  })

  it('mostra a miniatura e abre o original ao clicar', async () => {
    await render([PROOF])
    const image = document.body.querySelector<HTMLImageElement>(
      '[data-testid="canhoto-preview"] img',
    )
    expect(image?.getAttribute('src')).toBe('https://storage.test/thumb/proof-1')
    const trigger = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="canhoto-preview"] button',
    )
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger?.click()
      await Promise.resolve()
    })
    const dialog = document.body.querySelector('[role="dialog"] img')
    expect(dialog?.getAttribute('src')).toBe('https://storage.test/original/proof-1')
  })

  it('sem a foto na resposta não desenha nada', async () => {
    await render([])
    expect(document.body.querySelector('[data-testid="canhoto-preview"]')).toBeNull()
  })
})
