/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T8.1: o maço é **uma** parada de Tab, não duas por nota. Com o teto de 40 canhotos, a
 * grade custava 80 paradas antes do botão de aprovar; quem confere com teclado pagava a conta
 * inteira para chegar ao rodapé. As setas andam entre as notas, Espaço marca, Enter abre a foto.
 *
 * O contrato que prende isto é a **contagem não crescer com o número de notas**: é o que uma
 * regressão quebraria sem quebrar mais nada.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripCanhotoBatchDialog } from '../../src/modules/trip/components/TripCanhotoBatchDialog.component'
import type { CanhotoBatchItem } from '../../src/modules/trip/shared/canhotoBatchSelection.service'
import {
  moveRovingDocumentId,
  resolveRovingDocumentId,
} from '../../src/modules/trip/shared/canhotoBatchRovingFocus.service'

const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

let root: Root | undefined
let container: HTMLDivElement | undefined

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

const THREE = [makeItem('doc-1', '101/1'), makeItem('doc-2', '102/1'), makeItem('doc-3', '103/1')]
const EIGHT = Array.from({ length: 8 }, (_, index) =>
  makeItem(`doc-${index + 1}`, `10${index + 1}/1`),
)

async function renderDialog(items: readonly CanhotoBatchItem[]): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripCanhotoBatchDialog, {
        items,
        onClose: () => undefined,
        onConfirm: () => undefined,
        overflowCount: 0,
        status: 'ready',
      }),
    )
    await Promise.resolve()
  })
}

function dialog(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('[role="dialog"]')
  if (element === null) throw new Error('DIALOG_NOT_FOUND')
  return element
}

/** Tudo que o Tab de verdade para em: nem `tabindex="-1"`, nem desabilitado. */
function tabStops(): HTMLElement[] {
  return Array.from(
    dialog().querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
    ),
  )
}

function checkboxes(): HTMLInputElement[] {
  return Array.from(dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
}

function photoButtons(): HTMLButtonElement[] {
  return Array.from(dialog().querySelectorAll<HTMLButtonElement>('figure button'))
}

function images(): HTMLImageElement[] {
  return Array.from(dialog().querySelectorAll<HTMLImageElement>('img'))
}

async function press(key: string): Promise<void> {
  const target = document.activeElement ?? dialog()
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
    await Promise.resolve()
  })
}

async function fire(target: EventTarget, type: 'error' | 'load'): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new Event(type))
    await Promise.resolve()
  })
}

describe('a navegação do maço de canhotos por teclado (spec 222 T8.1)', () => {
  describe('a conta das paradas de Tab', () => {
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

    it('não cresce com o número de notas — três e oito canhotos param no mesmo lugar', async () => {
      await renderDialog(THREE)
      const withThree = tabStops().length

      if (root !== undefined) act(() => root?.unmount())
      container?.remove()

      await renderDialog(EIGHT)
      const withEight = tabStops().length

      expect(withEight).toBe(withThree)
    })

    /**
     * Medido em staging: com **quatro** canhotos a dica ficava 176 px abaixo da área visível, porque
     * vinha depois da grade. Instrução de teclado atrás do que ela ensina a navegar não é instrução.
     */
    it('a dica de teclado vem antes da grade, não depois dela', async () => {
      await renderDialog(THREE)

      const hint = [...dialog().querySelectorAll('p')].find((p) =>
        (p.textContent ?? '').includes('Setas andam'),
      )
      const grade = dialog().querySelector('ul')

      expect(hint).toBeDefined()
      expect(grade).not.toBeNull()
      expect(
        (hint?.compareDocumentPosition(grade as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeGreaterThan(0)
    })

    it('a grade inteira é uma parada: a primeira caixa de marcação', async () => {
      await renderDialog(THREE)

      const [first, ...rest] = checkboxes()
      expect(first?.tabIndex).toBe(0)
      expect(rest.map((checkbox) => checkbox.tabIndex)).toEqual([-1, -1])
    })

    it('abrir a foto nunca é parada de Tab — é Enter na nota em foco', async () => {
      await renderDialog(THREE)

      expect(photoButtons()).toHaveLength(3)
      expect(photoButtons().every((button) => button.tabIndex === -1)).toBe(true)
    })

    it('o rodapé e o fechar seguem com as paradas deles', async () => {
      await renderDialog(THREE)
      for (const image of images()) await fire(image, 'load')

      const labels = tabStops().map(
        (stop) => stop.getAttribute('aria-label') ?? stop.textContent ?? '',
      )
      expect(labels.some((label) => label.includes('Fechar a conferência'))).toBe(true)
      expect(labels.some((label) => label.includes('Cancelar'))).toBe(true)
      expect(labels.some((label) => label.includes('Aprovar 3 canhotos'))).toBe(true)
    })
  })

  describe('as setas', () => {
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

    it('ArrowDown move a parada para a nota seguinte e põe o foco nela', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('ArrowDown')

      expect(checkboxes().map((checkbox) => checkbox.tabIndex)).toEqual([-1, 0, -1])
      expect(document.activeElement).toBe(checkboxes()[1] ?? null)
    })

    it('ArrowRight anda igual a ArrowDown — a grade tem coluna variável', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('ArrowRight')

      expect(checkboxes()[1]?.tabIndex).toBe(0)
    })

    it('não dá a volta: ArrowUp na primeira fica na primeira, ArrowDown na última fica na última', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('ArrowUp')
      expect(checkboxes()[0]?.tabIndex).toBe(0)

      await press('End')
      expect(checkboxes()[2]?.tabIndex).toBe(0)

      await press('ArrowDown')
      expect(checkboxes()[2]?.tabIndex).toBe(0)
    })

    it('Home volta para a primeira nota', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('End')
      await press('Home')

      expect(checkboxes()[0]?.tabIndex).toBe(0)
    })

    it('andar não marca nem desmarca nada', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('ArrowDown')
      await press('ArrowDown')
      await press('Home')

      expect(checkboxes().every((checkbox) => checkbox.checked)).toBe(true)
    })

    it('a nota cuja foto não abriu é pulada — não há o que conferir nela', async () => {
      await renderDialog(THREE)
      const [, second] = images()
      if (second !== undefined) await fire(second, 'error')
      checkboxes()[0]?.focus()

      await press('ArrowDown')

      expect(checkboxes()[2]?.tabIndex).toBe(0)
      expect(document.activeElement).toBe(checkboxes()[2] ?? null)
    })

    it('Enter abre a foto da nota em foco em tamanho real', async () => {
      await renderDialog(THREE)
      checkboxes()[0]?.focus()

      await press('ArrowDown')
      await press('Enter')

      const dialogs = document.body.querySelectorAll('[role="dialog"]')
      expect(dialogs.length).toBe(2)
    })
  })

  describe('a conta pura de para onde o foco vai', () => {
    const ELIGIBLE = ['doc-1', 'doc-2', 'doc-3']

    it('mantém a nota pedida quando ela ainda pode ser conferida', () => {
      expect(resolveRovingDocumentId({ eligibleIds: ELIGIBLE, requestedId: 'doc-2' })).toBe('doc-2')
    })

    it('cai na primeira quando a foto da nota pedida quebrou depois', () => {
      expect(
        resolveRovingDocumentId({ eligibleIds: ['doc-1', 'doc-3'], requestedId: 'doc-2' }),
      ).toBe('doc-1')
    })

    it('não tem alvo quando nenhuma nota pode ser conferida', () => {
      expect(resolveRovingDocumentId({ eligibleIds: [], requestedId: 'doc-2' })).toBeUndefined()
    })

    it('anda para frente e para trás, sem dar a volta', () => {
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-1', key: 'ArrowDown' }),
      ).toBe('doc-2')
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-3', key: 'ArrowRight' }),
      ).toBe('doc-3')
      expect(moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-1', key: 'ArrowUp' })).toBe(
        'doc-1',
      )
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-2', key: 'ArrowLeft' }),
      ).toBe('doc-1')
    })

    it('Home e End vão às pontas', () => {
      expect(moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-2', key: 'Home' })).toBe(
        'doc-1',
      )
      expect(moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-2', key: 'End' })).toBe(
        'doc-3',
      )
    })

    it('tecla que não navega não move nada — Espaço e Enter são de quem está em foco', () => {
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-1', key: ' ' }),
      ).toBeUndefined()
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-1', key: 'Enter' }),
      ).toBeUndefined()
      expect(
        moveRovingDocumentId({ eligibleIds: ELIGIBLE, fromId: 'doc-1', key: 'a' }),
      ).toBeUndefined()
    })

    it('sem nota conferível, nem as setas têm para onde ir', () => {
      expect(
        moveRovingDocumentId({ eligibleIds: [], fromId: undefined, key: 'ArrowDown' }),
      ).toBeUndefined()
    })
  })
})
