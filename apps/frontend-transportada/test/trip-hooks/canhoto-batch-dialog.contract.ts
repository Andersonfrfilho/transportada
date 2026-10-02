/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.6: o diálogo de conferência em maço montado de verdade. A tela não aprova o que não
 * mostrou: o botão só vale depois que as fotos marcadas chegaram. Os dados são sintéticos.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import {
  TripCanhotoBatchDialog,
  type CanhotoBatchDialogStatus,
} from '../../src/modules/trip/components/TripCanhotoBatchDialog.component'
import type { CanhotoBatchItem } from '../../src/modules/trip/shared/canhotoBatchSelection.service'

const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

let root: Root | undefined
let container: HTMLDivElement | undefined
let confirmations: (readonly string[])[] = []
let closeCalls = 0

function makeItem(documentId: string, label: string): CanhotoBatchItem {
  return {
    documentId,
    label,
    proof: {
      canhotoReadNumber: '123',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
      createdAt: '2026-09-30T10:00:00Z',
      documentId,
      downloadUrl: `https://storage.test/original/${documentId}`,
      expiresAt: '2026-09-30T10:05:00Z',
      id: `proof-${documentId}`,
      kind: 'photo',
      receiverName: '',
    },
  }
}

const ITEMS = [makeItem('doc-1', '101/1'), makeItem('doc-2', '102/1'), makeItem('doc-3', '103/1')]

type RenderOverrides = Readonly<{
  items?: readonly CanhotoBatchItem[]
  overflowCount?: number
  status?: CanhotoBatchDialogStatus
}>

async function renderDialog({
  items = ITEMS,
  overflowCount = 0,
  status = 'ready',
}: RenderOverrides = {}): Promise<void> {
  confirmations = []
  closeCalls = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await rerender({ items, overflowCount, status })
}

async function rerender({
  items = ITEMS,
  overflowCount = 0,
  status = 'ready',
}: RenderOverrides): Promise<void> {
  await act(async () => {
    root?.render(
      createElement(TripCanhotoBatchDialog, {
        items,
        onClose: () => {
          closeCalls += 1
        },
        onConfirm: (documentIds: readonly string[]) => {
          confirmations.push(documentIds)
        },
        overflowCount,
        status,
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
    (candidate) => /^(Aprovar \d+ canhotos?|Aprovando)/.test(candidate.textContent ?? ''),
  )
  if (button === undefined) throw new Error('APPROVE_BUTTON_NOT_FOUND')
  return button
}

async function fire(target: EventTarget, type: 'load' | 'error'): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new Event(type))
    await Promise.resolve()
  })
}

async function loadAllImages(): Promise<void> {
  for (const image of images()) await fire(image, 'load')
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.click()
    await Promise.resolve()
  })
}

describe('o diálogo de conferência de canhotos em maço (spec 222 T2.6)', () => {
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

  it('mostra uma foto e uma caixa de marcação por canhoto, todas marcadas', async () => {
    await renderDialog()

    expect(images()).toHaveLength(3)
    expect(checkboxes()).toHaveLength(3)
    expect(checkboxes().every((checkbox) => checkbox.checked)).toBe(true)
    expect(document.body.textContent).toContain('3 de 3 marcados')
  })

  it('mostra o número e a série da nota e a leitura automática de cada canhoto', async () => {
    await renderDialog()

    const text = document.body.textContent ?? ''
    expect(text).toContain('Nota 101/1')
    expect(text).toContain('Nota 103/1')
    expect(text).toContain('Aguardando conferência: número lido 123')
  })

  it('a caixa de marcação diz de qual nota é', async () => {
    await renderDialog()

    expect(checkboxes().map((checkbox) => checkbox.getAttribute('aria-label'))).toEqual([
      'Aprovar o canhoto da nota 101/1',
      'Aprovar o canhoto da nota 102/1',
      'Aprovar o canhoto da nota 103/1',
    ])
  })

  it('as fotos carregam já, sem esperar a rolagem — o que não carrega não pode ser aprovado', async () => {
    await renderDialog()

    expect(images().every((image) => image.getAttribute('loading') === 'eager')).toBe(true)
  })

  it('não aprova enquanto as fotos marcadas não chegaram', async () => {
    await renderDialog()

    expect(approveButton().disabled).toBe(true)
    expect(document.body.textContent).toContain('Aguarde as fotos carregarem para aprovar.')

    await click(approveButton())
    expect(confirmations).toEqual([])
  })

  it('com todas as fotos carregadas, aprova as marcadas na ordem da viagem', async () => {
    await renderDialog()
    await loadAllImages()

    expect(approveButton().disabled).toBe(false)
    expect(approveButton().textContent).toContain('Aprovar 3 canhotos')

    await click(approveButton())

    expect(confirmations).toEqual([['doc-1', 'doc-2', 'doc-3']])
  })

  it('o que a pessoa desmarcou fica de fora, e a contagem acompanha', async () => {
    await renderDialog()
    await loadAllImages()

    await click(checkboxes()[1] as HTMLInputElement)

    expect(document.body.textContent).toContain('2 de 3 marcados')
    expect(approveButton().textContent).toContain('Aprovar 2 canhotos')

    await click(approveButton())
    expect(confirmations).toEqual([['doc-1', 'doc-3']])
  })

  it('foto ainda a caminho de uma nota desmarcada não segura o botão', async () => {
    await renderDialog()
    await click(checkboxes()[2] as HTMLInputElement)
    await fire(images()[0] as HTMLImageElement, 'load')
    await fire(images()[1] as HTMLImageElement, 'load')

    expect(approveButton().disabled).toBe(false)
  })

  it('sem nada marcado o botão não vale', async () => {
    await renderDialog()
    await loadAllImages()
    for (const checkbox of checkboxes()) await click(checkbox)

    expect(approveButton().disabled).toBe(true)
    expect(document.body.textContent).toContain('0 de 3 marcados')
  })

  it('enquanto aprova, o botão trava e diz o que faz', async () => {
    await renderDialog()
    await loadAllImages()
    await rerender({ status: 'submitting' })

    expect(approveButton().disabled).toBe(true)
    expect(approveButton().textContent).toContain('Aprovando')
  })

  it('carregando a consulta, mostra o marcador e nenhuma foto', async () => {
    await renderDialog({ items: [], status: 'loading' })

    expect(
      document.body.querySelector('[role="status"][aria-label="Carregando os canhotos"]'),
    ).not.toBe(null)
    expect(images()).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/Aprovar \d+ canhoto/)
  })

  it('consulta que falhou avisa e não oferece aprovar', async () => {
    await renderDialog({ items: [], status: 'failed' })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível carregar os canhotos',
    )
    expect(document.body.textContent).not.toMatch(/Aprovar \d+ canhoto/)
  })

  it('nada a conferir diz isso', async () => {
    await renderDialog({ items: [] })

    expect(document.body.textContent).toContain(
      'Nenhum canhoto desta seleção está aguardando conferência.',
    )
  })

  it('o que passou do teto aparece como aviso, não some em silêncio', async () => {
    await renderDialog({ overflowCount: 2 })

    expect(document.body.textContent).toContain('2 canhotos ficaram para a próxima rodada.')
  })

  it('o foco entra no diálogo e o Escape fecha', async () => {
    await renderDialog()

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(document.activeElement).toBe(dialog)
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).not.toBe(null)

    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })
    expect(closeCalls).toBe(1)
  })

  it('abrir uma foto em tamanho real não fecha a conferência, e o Escape fecha só a foto', async () => {
    await renderDialog()
    const openButton = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Abrir em tamanho real"]',
    )
    await click(openButton as HTMLButtonElement)

    const dialogs = document.body.querySelectorAll('[role="dialog"]')
    expect(dialogs).toHaveLength(2)

    await act(async () => {
      dialogs[1]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })

    expect(closeCalls).toBe(0)
  })
})
