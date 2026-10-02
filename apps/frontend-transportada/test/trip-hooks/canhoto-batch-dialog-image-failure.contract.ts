/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.7, RF-A8/CA09: canhoto cuja foto não abriu não pode ser aprovado — a tela não aprova
 * o que não mostrou. Ele nasce desmarcado, travado e com aviso, e não segura as outras notas.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripCanhotoBatchDialog } from '../../src/modules/trip/components/TripCanhotoBatchDialog.component'
import type { CanhotoBatchItem } from '../../src/modules/trip/shared/canhotoBatchSelection.service'

const IMAGE_FAILED_TEXT = 'A foto não abriu. Este canhoto não pode ser aprovado sem ser visto.'

const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

let root: Root | undefined
let container: HTMLDivElement | undefined
let confirmations: (readonly string[])[] = []

function makeItem(documentId: string, label: string, downloadUrl?: string): CanhotoBatchItem {
  return {
    documentId,
    label,
    proof: {
      canhotoReview: 'pending',
      createdAt: '2026-09-30T10:00:00Z',
      documentId,
      downloadUrl: downloadUrl ?? `https://storage.test/original/${documentId}`,
      expiresAt: '2026-09-30T10:05:00Z',
      id: `proof-${documentId}`,
      kind: 'photo',
      receiverName: '',
    },
  }
}

async function renderDialog(items: readonly CanhotoBatchItem[]): Promise<void> {
  confirmations = []
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripCanhotoBatchDialog, {
        items,
        onClose: () => undefined,
        onConfirm: (documentIds: readonly string[]) => {
          confirmations.push(documentIds)
        },
        overflowCount: 0,
        status: 'ready',
      }),
    )
    await Promise.resolve()
  })
}

function images(): HTMLImageElement[] {
  return Array.from(document.body.querySelectorAll<HTMLImageElement>('[role="dialog"] img'))
}

function checkboxes(): HTMLInputElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
  )
}

function approveButton(): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => /^Aprovar \d+ canhotos?/.test(candidate.textContent ?? ''),
  )
  if (button === undefined) throw new Error('APPROVE_BUTTON_NOT_FOUND')
  return button
}

function warnings(): readonly string[] {
  return Array.from(document.body.querySelectorAll('[role="alert"]')).map(
    (element) => element.textContent ?? '',
  )
}

async function fire(target: EventTarget | undefined, type: 'load' | 'error'): Promise<void> {
  if (target === undefined) throw new Error('TARGET_NOT_FOUND')
  await act(async () => {
    target.dispatchEvent(new Event(type))
    await Promise.resolve()
  })
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.click()
    await Promise.resolve()
  })
}

describe('canhoto cuja foto não abriu não é aprovado (spec 222 T2.7)', () => {
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

  it('a foto que falhou desmarca a nota, trava a caixa e avisa', async () => {
    await renderDialog([makeItem('doc-1', '101/1'), makeItem('doc-2', '102/1')])
    await fire(images()[0], 'error')

    expect(checkboxes()[0]?.checked).toBe(false)
    expect(checkboxes()[0]?.disabled).toBe(true)
    expect(checkboxes()[1]?.checked).toBe(true)
    expect(warnings()).toEqual([IMAGE_FAILED_TEXT])
    expect(document.body.textContent).toContain('1 de 2 marcados')
  })

  it('a falha de uma foto não segura as outras: aprova só o que foi visto', async () => {
    await renderDialog([
      makeItem('doc-1', '101/1'),
      makeItem('doc-2', '102/1'),
      makeItem('doc-3', '103/1'),
    ])
    await fire(images()[0], 'error')
    await fire(images()[1], 'load')
    await fire(images()[2], 'load')

    expect(approveButton().disabled).toBe(false)
    expect(approveButton().textContent).toContain('Aprovar 2 canhotos')

    await click(approveButton())
    expect(confirmations).toEqual([['doc-2', 'doc-3']])
  })

  it('a nota que falhou não volta ao maço por clique', async () => {
    await renderDialog([makeItem('doc-1', '101/1'), makeItem('doc-2', '102/1')])
    await fire(images()[0], 'error')
    await fire(images()[1], 'load')

    await click(checkboxes()[0] as HTMLInputElement)

    expect(checkboxes()[0]?.checked).toBe(false)
    await click(approveButton())
    expect(confirmations).toEqual([['doc-2']])
  })

  it('canhoto sem imagem nenhuma já nasce desmarcado, com o mesmo aviso', async () => {
    await renderDialog([makeItem('doc-1', '101/1', ''), makeItem('doc-2', '102/1')])

    expect(checkboxes()[0]?.checked).toBe(false)
    expect(checkboxes()[0]?.disabled).toBe(true)
    expect(warnings()).toEqual([IMAGE_FAILED_TEXT])
  })

  it('com todas as fotos falhas não há o que aprovar', async () => {
    await renderDialog([makeItem('doc-1', '101/1'), makeItem('doc-2', '102/1')])
    await fire(images()[0], 'error')
    await fire(images()[1], 'error')

    expect(approveButton().disabled).toBe(true)
    expect(warnings()).toHaveLength(2)
    expect(document.body.textContent).toContain('0 de 2 marcados')
  })

  it('a foto que carrega normal não ganha aviso', async () => {
    await renderDialog([makeItem('doc-1', '101/1')])
    await fire(images()[0], 'load')

    expect(warnings()).toEqual([])
    expect(checkboxes()[0]?.disabled).toBe(false)
  })
})
