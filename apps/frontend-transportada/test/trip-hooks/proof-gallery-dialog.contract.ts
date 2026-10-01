/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T5.5 (RF21): o visualizador dos comprovantes montado de verdade. A ordem e a navegação já
 * têm contrato na função pura (`delivery-proof-gallery.contract.ts`); aqui só o que exige DOM: o
 * portal, o foco, o Esc, o `popstate` do Android e o `alt` que distingue canhoto, mercadoria e
 * assinatura. As buscas são por papel e rótulo acessível — o que o operador alcança pelo teclado.
 */
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProof } from '../../src/modules/trip/components/TripDeliveryProof.component'
import {
  resolveDeliveryProofView,
  type DeliveryProof,
  type DeliveryProofKind,
  type DeliveryProofView,
} from '../../src/modules/trip/shared/deliveryProof.service'

const OPEN_LABEL = 'Abrir em tamanho real'
const NEXT_LABEL = 'Próximo comprovante'
const PREVIOUS_LABEL = 'Comprovante anterior'
const RECEIPT_ALT = 'Foto do comprovante de entrega'
const CARGO_ALT = 'Foto da mercadoria entregue'
const SIGNATURE_ALT = 'Assinatura de quem recebeu a carga'

let root: Root | undefined
let container: HTMLDivElement | undefined

/**
 * O `history.back()` do diálogo vira um contador: no navegador ele só desempilha a entrada, e o
 * happy-dom o trataria como navegação de verdade.
 */
const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)
const originalReplaceState = window.history.replaceState.bind(window.history)
let historyBackCalls = 0
let pushStateCalls = 0

let renderedView: DeliveryProofView | undefined

function makeProof(
  id: string,
  kind: DeliveryProofKind,
  overrides: Partial<DeliveryProof> = {},
): DeliveryProof {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: `https://storage.test/original/${id}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id,
    kind,
    receiverName: '',
    ...overrides,
  }
}

async function renderProofs(proofs: readonly DeliveryProof[]): Promise<void> {
  const view = resolveDeliveryProofView({
    document: {
      deliveredAt: '2026-09-30T10:00:00Z',
      returnedAt: null,
      returnReason: null,
      separationStatus: 'delivered',
    },
    proofs,
  })
  renderedView = view
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderCurrentView()
}

async function renderCurrentView(): Promise<void> {
  if (renderedView === undefined) throw new Error('VIEW_NOT_RENDERED')
  const view = renderedView
  await act(async () => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(TripDeliveryProof, {
          documentId: 'document-1',
          occurrences: null,
          products: [],
          reviewActions: {
            canReview: false,
            onApprove: () => undefined,
            onReject: () => undefined,
          },
          view,
        }),
      ),
    )
    await Promise.resolve()
  })
}

function openButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button')).filter(
    (button) => button.getAttribute('aria-label') === OPEN_LABEL,
  )
}

/** A tela mostra assinatura, canhoto e mercadoria; o botão se acha pelo `alt` da miniatura que ele envolve. */
function openButtonFor(thumbnailAlt: string): HTMLButtonElement | undefined {
  return openButtons().find(
    (button) => button.querySelector('img')?.getAttribute('alt') === thumbnailAlt,
  )
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === label,
  )
}

function dialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]')
}

function dialogImage(): HTMLImageElement {
  const image = dialog()?.querySelector('img')
  if (image === null || image === undefined) throw new Error('DIALOG_IMAGE_NOT_FOUND')
  return image
}

/** O voltar do navegador desempilha a entrada reservada **antes** de disparar o evento. */
async function popBack(): Promise<void> {
  await act(async () => {
    originalReplaceState(null, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    await Promise.resolve()
  })
}

async function click(element: HTMLElement | undefined): Promise<void> {
  if (element === undefined) throw new Error('CLICK_TARGET_NOT_FOUND')
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

const THREE_PROOFS = [
  makeProof('receipt-1', 'photo', { thumbnailUrl: 'https://storage.test/thumb/receipt-1' }),
  makeProof('cargo-1', 'cargo'),
  makeProof('signature-1', 'signature'),
] as const

describe('visualizador de comprovantes (spec 220 RF21)', () => {
  beforeEach(() => {
    historyBackCalls = 0
    pushStateCalls = 0
    window.history.back = () => {
      historyBackCalls += 1
    }
    window.history.pushState = (data, unused, url) => {
      pushStateCalls += 1
      originalPushState(data, unused, url)
    }
  })

  // O desfazer da entrada é adiado uma tarefa: sem drenar aqui, ele cairia dentro do teste seguinte.
  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    window.history.back = originalHistoryBack
    window.history.pushState = originalPushState
    container?.remove()
    root = undefined
    container = undefined
    renderedView = undefined
  })

  it('clicar na miniatura abre o diálogo com o original, não com a fonte da miniatura', async () => {
    await renderProofs(THREE_PROOFS)
    expect(dialog()).toBe(null)

    await click(openButtonFor(RECEIPT_ALT))

    expect(dialogImage().getAttribute('src')).toBe('https://storage.test/original/receipt-1')
    expect(dialogImage().getAttribute('src')).not.toContain('thumb')
  })

  it('o diálogo é irmão do container em document.body, com role e aria-modal', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    const opened = dialog()
    expect(opened?.parentElement).toBe(document.body)
    expect(container?.contains(opened)).toBe(false)
    expect(opened?.getAttribute('aria-modal')).toBe('true')
  })

  it('Esc fecha o diálogo', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    await act(async () => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })

    expect(dialog()).toBe(null)
  })

  it('o foco vai para dentro do diálogo ao abrir', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    expect(dialog()?.contains(document.activeElement)).toBe(true)
  })

  it('próxima e anterior trocam a imagem, e o botão da ponta fica desabilitado', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    expect(buttonByLabel(PREVIOUS_LABEL)?.disabled).toBe(true)
    expect(buttonByLabel(NEXT_LABEL)?.disabled).toBe(false)

    await click(buttonByLabel(NEXT_LABEL))
    expect(dialogImage().getAttribute('src')).toBe('https://storage.test/original/signature-1')
    expect(buttonByLabel(PREVIOUS_LABEL)?.disabled).toBe(false)

    await click(buttonByLabel(NEXT_LABEL))
    expect(dialogImage().getAttribute('src')).toBe('https://storage.test/original/cargo-1')
    expect(buttonByLabel(NEXT_LABEL)?.disabled).toBe(true)

    await click(buttonByLabel(PREVIOUS_LABEL))
    expect(dialogImage().getAttribute('src')).toBe('https://storage.test/original/signature-1')
  })

  it('abrir pela primeira miniatura da tela abre em 1 de N, com anterior desabilitado e próxima habilitada', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtons()[0])

    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toBe('1 de 3')
    expect(dialogImage().getAttribute('src')).toBe('https://storage.test/original/receipt-1')
    expect(buttonByLabel(PREVIOUS_LABEL)?.disabled).toBe(true)
    expect(buttonByLabel(NEXT_LABEL)?.disabled).toBe(false)
  })

  it('com uma imagem só, não há próxima, anterior nem contador', async () => {
    await renderProofs([makeProof('receipt-1', 'photo')])
    await click(openButtonFor(RECEIPT_ALT))

    expect(dialog()).not.toBe(null)
    expect(buttonByLabel(NEXT_LABEL)).toBeUndefined()
    expect(buttonByLabel(PREVIOUS_LABEL)).toBeUndefined()
    expect(dialog()?.querySelector('[aria-live="polite"]')).toBe(null)
  })

  it('o contador anuncia a posição quando há mais de uma imagem', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toBe('1 de 3')
  })

  it('popstate (o voltar do Android) fecha o diálogo em vez de sair da tela', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))
    expect(dialog()).not.toBe(null)

    await popBack()

    expect(dialog()).toBe(null)
  })

  /**
   * ⚠️ Medido **na página de verdade** durante a revisão da T5.6: um clique produzia
   * `pushState → back → pushState → abre → popstate → fecha`, e o diálogo nunca aparecia. Sob
   * `StrictMode` — e o painel inteiro roda sob ele — o React monta, limpa e monta o efeito de novo;
   * o `back()` da limpeza dispara um `popstate` **assíncrono** que chega depois da remontagem, com
   * `state=null`, e o ouvinte novo o lê como "o usuário voltou".
   *
   * Por isso a montagem aqui é sob `StrictMode`: simular o eco à mão seria mais fraco que provocar a
   * dupla montagem de verdade. Uma entrada empilhada por montagem, e ela sobrevive ao segundo ciclo.
   */
  it('a dupla montagem do StrictMode não fecha o diálogo que acabou de abrir', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve))
    })

    expect(dialog()).not.toBe(null)
    expect(pushStateCalls).toBe(1)
    expect(historyBackCalls).toBe(0)
  })

  it('abre empilhando uma entrada de histórico e a desempilha ao fechar', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))
    expect(window.history.state).toEqual({ proofGalleryDialog: true })
    expect(historyBackCalls).toBe(0)

    await click(
      Array.from(dialog()?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent === 'Fechar',
      ),
    )

    expect(dialog()).toBe(null)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve))
    })
    expect(historyBackCalls).toBe(1)
  })

  /**
   * ⚠️ Achado da revisão de design da T5.6 **contra a página de verdade**: clicar na miniatura
   * congelava o renderizador. O efeito do histórico dependia de `onClose`, e o painel redeclara esse
   * handler a cada render — logo, cada render do painel desmontava o efeito (`history.back()`) e o
   * remontava (`pushState`). O `back()` dispara `popstate`, que fecha, que re-renderiza: laço.
   *
   * O dublê de `history.back` da T5.5 escondeu isto: ele conta a chamada e **não** dispara `popstate`.
   * Aqui o que se exige é anterior ao laço — a entrada de histórico é uma por montagem, e um render a
   * mais do painel não mexe nela.
   */
  it('re-render do painel não empilha nem desempilha histórico de novo', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))

    expect(pushStateCalls).toBe(1)
    expect(historyBackCalls).toBe(0)

    await renderCurrentView()

    expect(dialog()).not.toBe(null)
    expect(pushStateCalls).toBe(1)
    expect(historyBackCalls).toBe(0)
  })

  it('o alt da imagem do diálogo distingue canhoto, mercadoria e assinatura', async () => {
    await renderProofs(THREE_PROOFS)
    await click(openButtonFor(RECEIPT_ALT))
    expect(dialogImage().getAttribute('alt')).toBe(RECEIPT_ALT)

    await click(buttonByLabel(NEXT_LABEL))
    expect(dialogImage().getAttribute('alt')).toBe(SIGNATURE_ALT)

    await click(buttonByLabel(NEXT_LABEL))
    expect(dialogImage().getAttribute('alt')).toBe(CARGO_ALT)
  })

  it('comprovante sem original não oferece botão para abrir', async () => {
    await renderProofs([makeProof('receipt-1', 'photo', { downloadUrl: '' })])

    expect(openButtons()).toHaveLength(0)
    expect(document.body.querySelector('img')?.getAttribute('alt')).toBe(RECEIPT_ALT)
  })
})
