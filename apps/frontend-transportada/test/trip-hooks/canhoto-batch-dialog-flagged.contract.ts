/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5 (D8.2, CA05): no maço, a prova sinalizada ("parece ser da NF X") fica fora do "aprovar
 * todos" e só é aprovada por clique próprio, com a foto à vista e o alerta na tela.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripCanhotoBatchDialog } from '../../src/modules/trip/components/TripCanhotoBatchDialog.component'
import type { CanhotoBatchItem } from '../../src/modules/trip/shared/canhotoBatchSelection.service'

const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

let root: Root | undefined
let container: HTMLDivElement | undefined
let confirmations: { ids: readonly string[]; keepOpen: boolean | undefined }[] = []

function makeItem(documentId: string, label: string, isFlagged: boolean): CanhotoBatchItem {
  return {
    documentId,
    label,
    proof: {
      canhotoReadNumber: '172195',
      canhotoReadSeries: '1',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
      createdAt: '2026-11-22T10:00:00Z',
      documentId,
      downloadUrl: `https://storage.test/original/${documentId}`,
      expiresAt: '2026-11-22T10:05:00Z',
      id: `proof-${documentId}`,
      kind: 'photo',
      receiverName: '',
      ...(isFlagged
        ? {
            canhotoMismatch: {
              kind: 'other_document' as const,
              matchedDocument: null,
              readNumber: '172195',
              readSeries: '1',
            },
          }
        : {}),
    },
  }
}

const ITEMS = [
  makeItem('doc-1', '101/1', false),
  makeItem('doc-2', '931988/1', true),
  makeItem('doc-3', '103/1', false),
]

async function renderDialog(): Promise<void> {
  confirmations = []
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripCanhotoBatchDialog, {
        items: ITEMS,
        onClose: () => undefined,
        onConfirm: (ids: readonly string[], options?: Readonly<{ keepOpen: boolean }>) => {
          confirmations.push({ ids, keepOpen: options?.keepOpen })
        },
        overflowCount: 0,
        status: 'ready',
      }),
    )
    await Promise.resolve()
  })
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
}

function findButton(pattern: RegExp): HTMLButtonElement {
  const button = buttons().find((candidate) => pattern.test(candidate.textContent ?? ''))
  if (button === undefined) throw new Error(`BUTTON_NOT_FOUND ${String(pattern)}`)
  return button
}

async function act2(action: () => void): Promise<void> {
  await act(async () => {
    action()
    await Promise.resolve()
  })
}

async function loadAllImages(): Promise<void> {
  for (const image of Array.from(document.body.querySelectorAll('[role="dialog"] img'))) {
    await act2(() => image.dispatchEvent(new Event('load')))
  }
}

describe('o maço e a prova sinalizada (spec 344 T5)', () => {
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

  it('a sinalizada não tem caixa de marcação e não entra na contagem do "aprovar todos"', async () => {
    await renderDialog()
    const boxes = document.body.querySelectorAll('[role="dialog"] input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect(document.body.textContent).toContain('2 de 3 marcados')
    expect(document.body.textContent).toContain('Parece ser de outra nota (lida: 172195, série 1)')
  })

  it('"aprovar todos" leva só as duas não sinalizadas', async () => {
    await renderDialog()
    await loadAllImages()
    await act2(() => findButton(/^Aprovar 2 canhotos/).click())
    expect(confirmations).toEqual([{ ids: ['doc-1', 'doc-3'], keepOpen: undefined }])
  })

  it('"Aprovar mesmo assim" espera a foto e aprova só aquela, sem fechar o maço', async () => {
    await renderDialog()
    expect(findButton(/^Aprovar mesmo assim/).disabled).toBe(true)
    await loadAllImages()
    await act2(() => findButton(/^Aprovar mesmo assim/).click())
    expect(confirmations).toEqual([{ ids: ['doc-2'], keepOpen: true }])
  })
})
