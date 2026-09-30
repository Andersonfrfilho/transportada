/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T5.8: a imagem do comprovante chega por URL assinada, sobre a rede do galpão — até ela
 * chegar havia um buraco branco do tamanho da miniatura, e nada dizia que algo estava a caminho.
 *
 * O contrato é de comportamento, não de classe: enquanto a imagem não resolve existe um marcador
 * `role="status"`; assim que ela resolve — **carregando ou falhando** — o marcador sai. Falhar
 * conta: um marcador que fica girando para sempre mente mais do que o buraco branco que ele veio
 * substituir. A imagem nasce no DOM junto com o marcador, senão o `load` nunca chega.
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
} from '../../src/modules/trip/shared/deliveryProof.service'

const OPEN_LABEL = 'Abrir em tamanho real'
const LOADING_LABEL = 'Carregando a imagem do comprovante'
const RECEIPT_ALT = 'Foto do comprovante de entrega'

let root: Root | undefined
let container: HTMLDivElement | undefined

/** O diálogo empilha histórico; no happy-dom isso vira navegação de verdade. */
const originalHistoryBack = window.history.back.bind(window.history)
const originalPushState = window.history.pushState.bind(window.history)

function makeProof(id: string, kind: DeliveryProofKind): DeliveryProof {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: `https://storage.test/original/${id}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id,
    kind,
    receiverName: '',
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
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(TripDeliveryProof, {
          documentId: 'document-1',
          occurrences: null,
          products: [],
          view,
        }),
      ),
    )
    await Promise.resolve()
  })
}

function loadingMarkers(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="status"]')).filter(
    (element): element is HTMLElement => element.getAttribute('aria-label') === LOADING_LABEL,
  )
}

function thumbnailFor(alt: string): HTMLImageElement | undefined {
  return Array.from(document.body.querySelectorAll('img')).find(
    (image) => image.getAttribute('alt') === alt,
  )
}

async function fire(target: EventTarget | undefined, type: 'load' | 'error'): Promise<void> {
  if (target === undefined) throw new Error('TARGET_NOT_FOUND')
  await act(async () => {
    target.dispatchEvent(new Event(type))
    await Promise.resolve()
  })
}

async function click(button: HTMLButtonElement | undefined): Promise<void> {
  if (button === undefined) throw new Error('BUTTON_NOT_FOUND')
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

describe('a imagem do comprovante avisa que está chegando (spec 220 T5.8)', () => {
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

  it('a miniatura nasce com marcador de carregamento, e com a imagem junto', async () => {
    await renderProofs([makeProof('proof-1', 'photo')])

    expect(loadingMarkers()).toHaveLength(1)
    // Sem a imagem no DOM desde o início, o `load` nunca chega e o marcador nunca sairia.
    expect(thumbnailFor(RECEIPT_ALT)).toBeDefined()
  })

  it('o marcador sai quando a imagem carrega', async () => {
    await renderProofs([makeProof('proof-1', 'photo')])

    await fire(thumbnailFor(RECEIPT_ALT), 'load')

    expect(loadingMarkers()).toHaveLength(0)
    expect(thumbnailFor(RECEIPT_ALT)).toBeDefined()
  })

  it('imagem que falha também tira o marcador — nada fica girando para sempre', async () => {
    await renderProofs([makeProof('proof-1', 'photo')])

    await fire(thumbnailFor(RECEIPT_ALT), 'error')

    expect(loadingMarkers()).toHaveLength(0)
  })

  it('cada comprovante tem o próprio marcador — um que chega não apaga o aviso dos outros', async () => {
    await renderProofs([
      makeProof('proof-1', 'photo'),
      makeProof('proof-2', 'cargo'),
      makeProof('proof-3', 'signature'),
    ])

    expect(loadingMarkers()).toHaveLength(3)

    await fire(thumbnailFor(RECEIPT_ALT), 'load')

    expect(loadingMarkers()).toHaveLength(2)
  })

  /** Sem miniatura e sem original não há nada a caminho: marcador aqui esperaria para sempre. */
  it('comprovante sem imagem nenhuma não ganha marcador', async () => {
    await renderProofs([{ ...makeProof('proof-1', 'photo'), downloadUrl: '' }])

    expect(loadingMarkers()).toHaveLength(0)
  })

  it('a galeria em tamanho real também avisa enquanto o original não chega', async () => {
    await renderProofs([makeProof('proof-1', 'photo')])
    await fire(thumbnailFor(RECEIPT_ALT), 'load')

    const openButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === OPEN_LABEL,
    )
    await click(openButton)

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBe(null)
    /**
     * A miniatura tem `thumbnailObjectId`; a galeria busca o **original**, outro arquivo e outro
     * download. A miniatura já carregada não diz nada sobre ele.
     */
    expect(loadingMarkers()).toHaveLength(1)

    await fire(dialog?.querySelector('img') ?? undefined, 'load')

    expect(loadingMarkers()).toHaveLength(0)
  })

  /** Cada comprovante é um download seu; o anterior ter chegado não adianta nada para o próximo. */
  it('avançar na galeria traz o marcador de volta para o comprovante seguinte', async () => {
    await renderProofs([makeProof('proof-1', 'photo'), makeProof('proof-2', 'cargo')])
    await fire(thumbnailFor(RECEIPT_ALT), 'load')
    await fire(thumbnailFor('Foto da mercadoria entregue'), 'load')

    const openButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === OPEN_LABEL,
    )
    await click(openButton)

    const dialog = document.body.querySelector('[role="dialog"]')
    await fire(dialog?.querySelector('img') ?? undefined, 'load')
    expect(loadingMarkers()).toHaveLength(0)

    const nextButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Próximo comprovante',
    )
    await click(nextButton)

    expect(loadingMarkers()).toHaveLength(1)
  })
})
