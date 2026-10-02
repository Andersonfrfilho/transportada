/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.8, CA02–CA04: o maço oferece "Conferir N canhotos" só a quem gerencia a viagem e só
 * quando alguma nota marcada tem canhoto aguardando; e diz quantas notas marcadas ficaram de fora.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripStateActions } from '../../src/modules/trip/components/TripStateActions.component'
import type { TripStateActionsProps } from '../../src/modules/trip/components/TripStateActions.component'
import type {
  CanhotoBatchItem,
  CanhotoBatchSelection,
} from '../../src/modules/trip/shared/canhotoBatchSelection.service'

let root: Root | undefined
let container: HTMLDivElement | undefined
let openings = 0

function makeItems(count: number): readonly CanhotoBatchItem[] {
  return Array.from({ length: count }, (_, index) => ({
    documentId: `document-${index}`,
    label: `NF ${index}`,
    proof: {
      canhotoReview: 'pending',
      createdAt: '2026-09-30T10:00:00Z',
      documentId: `document-${index}`,
      downloadUrl: `https://storage.test/original/${index}`,
      expiresAt: '2026-09-30T10:05:00Z',
      id: `proof-${index}`,
      kind: 'photo',
      receiverName: '',
    },
  }))
}

function makeProps(input: {
  readonly canManage: boolean
  readonly canhotoBatch: CanhotoBatchSelection
  readonly markedCount: number
}): TripStateActionsProps {
  const markedIds = Array.from({ length: input.markedCount }, (_, index) => `document-${index}`)
  return {
    canFieldDeliveryBatch: false,
    canFieldOccurrenceBatch: false,
    canManage: input.canManage,
    canSeparateOrLoad: false,
    canhotoBatch: input.canhotoBatch,
    capabilities: {
      canDocument: () => false,
      canStop: () => false,
      canTrip: () => false,
    },
    companyId: undefined,
    isBatchDeliverPending: false,
    isBatchPending: false,
    isBatchReturnPending: false,
    isGeneratingCteBatch: false,
    loadableSelection: [],
    onBatch: () => undefined,
    onBatchDeliver: () => undefined,
    onBatchReturn: () => undefined,
    onGenerateCteSelection: () => undefined,
    onNfseEmitted: () => undefined,
    onOpenCanhotoBatch: () => {
      openings += 1
    },
    onOpenFieldDeliveryBatch: () => undefined,
    onOpenFieldOccurrenceBatch: () => undefined,
    pendingCteSelection: [],
    pendingNfseSelection: [],
    permissions: [],
    selection: {
      clear: () => undefined,
      replace: () => undefined,
      selectedIds: new Set(markedIds),
      toggle: () => undefined,
      toggleMany: () => undefined,
    },
    separableSelection: [],
  }
}

async function render(props: TripStateActionsProps): Promise<void> {
  openings = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TripStateActions, props))
    await Promise.resolve()
  })
}

function reviewButton(): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
    /^Conferir \d+ canhotos?/.test(candidate.textContent ?? ''),
  )
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    await Promise.resolve()
  })
  container?.remove()
  root = undefined
  container = undefined
})

describe('ação de conferir canhotos no maço (spec 222 T2.8)', () => {
  it('CA02: seis marcadas, quatro com canhoto pendente → oferece 4 e avisa das 2 de fora', async () => {
    await render(
      makeProps({
        canManage: true,
        canhotoBatch: { eligible: makeItems(4), excludedCount: 2, overflowCount: 0 },
        markedCount: 6,
      }),
    )

    expect(reviewButton()?.textContent).toContain('Conferir 4 canhotos')
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain(
      '2 notas marcadas não têm canhoto aguardando conferência.',
    )
  })

  it('o botão abre a conferência', async () => {
    await render(
      makeProps({
        canManage: true,
        canhotoBatch: { eligible: makeItems(1), excludedCount: 0, overflowCount: 0 },
        markedCount: 1,
      }),
    )

    expect(reviewButton()?.textContent).toContain('Conferir 1 canhoto')
    await act(async () => {
      reviewButton()?.click()
      await Promise.resolve()
    })

    expect(openings).toBe(1)
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })

  it('CA03: nenhuma nota marcada com canhoto pendente → nenhum botão no DOM', async () => {
    await render(
      makeProps({
        canManage: true,
        canhotoBatch: { eligible: [], excludedCount: 0, overflowCount: 0 },
        markedCount: 3,
      }),
    )

    expect(reviewButton()).toBeUndefined()
    expect(document.body.textContent).not.toContain('canhoto')
  })

  it('CA04: sem trip.manage → nenhum botão no DOM, mesmo com canhoto pendente', async () => {
    await render(
      makeProps({
        canManage: false,
        canhotoBatch: { eligible: makeItems(4), excludedCount: 0, overflowCount: 0 },
        markedCount: 4,
      }),
    )

    expect(reviewButton()).toBeUndefined()
    expect(document.body.textContent).not.toContain('Conferir')
  })
})
