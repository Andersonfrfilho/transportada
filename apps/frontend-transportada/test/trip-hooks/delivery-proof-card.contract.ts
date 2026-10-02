/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O card do comprovante no DOM, nos casos que não podem quebrar o layout: completo, só assinatura,
 * com foto de avaria, canhoto recusado, longe do ponto, sem coordenada, enviando e sem comprovante.
 * Dados sintéticos.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProof } from '../../src/modules/trip/components/TripDeliveryProof.component'
import {
  resolveDeliveryProofView,
  type DeliveryProof,
  type DeliveryProofKind,
} from '../../src/modules/trip/shared/deliveryProof.service'

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeProof(id: string, kind: DeliveryProofKind, overrides: Partial<DeliveryProof> = {}) {
  return {
    createdAt: '2026-09-30T10:05:00',
    downloadUrl: `https://storage.test/original/${id}`,
    expiresAt: '2026-09-30T10:10:00',
    id,
    kind,
    receiverName: '',
    ...overrides,
  } satisfies DeliveryProof
}

async function renderCard(
  proofs: readonly DeliveryProof[],
  options: { calls?: string[]; canReview?: boolean; isExpanded?: boolean } = {},
): Promise<string> {
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
      createElement(TripDeliveryProof, {
        documentId: 'document-1',
        products: [],
        reviewActions: {
          canReview: options.canReview ?? false,
          onApprove: () => options.calls?.push('approve'),
          onReject: () => options.calls?.push('reject'),
        },
        view,
      }),
    )
    await Promise.resolve()
  })
  /** O comprovante nasce compacto (revisão de design da 233): quase todo caso abaixo olha o aberto. */
  if (options.isExpanded !== false) {
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
      await Promise.resolve()
    })
  }
  return container.textContent ?? ''
}

describe('o card do comprovante no DOM', () => {
  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    container?.remove()
    root = undefined
    container = undefined
  })

  it('entrega completa aprovada: sem selo no comprovante, canhoto e tira com as outras peças', async () => {
    const text = await renderCard([
      makeProof('photo-1', 'photo', {
        canhotoReview: 'approved',
        canhotoReviewOrigin: 'automatic',
        capturedAt: '2026-09-30T09:58:00',
        distanceMeters: 12,
        punctuality: 'on_time',
      }),
      makeProof('signature-1', 'signature'),
      makeProof('cargo-1', 'cargo'),
    ])

    const toggle = container?.querySelector('button[aria-expanded]')
    expect(toggle?.textContent).toContain('Comprovante da entrega')
    expect(container?.querySelector('.ui-badge')).toBeNull()
    expect(text).toContain('Canhoto assinado')
    expect(container?.querySelectorAll('ul img').length).toBe(2)
    expect(text).toContain('a 12 m do ponto')
    expect(container?.querySelector('footer')).toBeNull()
  })

  it('só assinatura: sem tira e sem chip de conferência', async () => {
    await renderCard([makeProof('signature-1', 'signature')])

    expect(container?.querySelector('ul')).toBeNull()
    expect(container?.textContent).not.toContain('Aguardando')
    expect(container?.querySelector('img')).not.toBeNull()
  })

  it('conferência pendente: prazo e botões no rodapé, Recusar antes de Aprovar', async () => {
    const calls: string[] = []
    await renderCard([makeProof('photo-1', 'photo', { canhotoReview: 'pending' })], {
      calls,
      canReview: true,
    })

    const footer = container?.querySelector('footer')
    expect(footer?.textContent).toContain('Conferência pendente desde 10:05')
    const buttons = Array.from(footer?.querySelectorAll('button') ?? [])
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Recusar canhoto',
      'Aprovar canhoto',
    ])
    for (const button of buttons) act(() => button.click())
    expect(calls).toEqual(['reject', 'approve'])
  })

  it('sem trip.manage o prazo aparece, mas nenhum botão está no DOM', async () => {
    await renderCard([makeProof('photo-1', 'photo', { canhotoReview: 'pending' })])

    expect(container?.querySelector('footer')?.textContent).toContain('pendente desde')
    expect(container?.querySelector('footer button')).toBeNull()
  })

  it('canhoto recusado: chip Recusado e motivo, sem rodapé', async () => {
    const text = await renderCard([
      makeProof('photo-1', 'photo', {
        canhotoReview: 'rejected',
        canhotoReviewReason: 'illegible',
      }),
    ])

    expect(text).not.toContain('Recusado')
    expect(text).toContain('Ilegível')
    expect(container?.querySelector('footer')).toBeNull()
  })

  it('longe do ponto: a linha de distância ganha a classe de alerta', async () => {
    await renderCard([makeProof('photo-1', 'photo', { distanceMeters: 4500, punctuality: 'away' })])

    const values = Array.from(container?.querySelectorAll('dd') ?? [])
    const distance = values.find((value) => value.textContent?.includes('4,5'))
    expect(distance?.getAttribute('data-alert')).toBe('true')
  })

  it('sem coordenada: a linha de distância some e fica o aviso discreto', async () => {
    const text = await renderCard([
      makeProof('photo-1', 'photo', { capturedAt: '2026-09-30T09:58:00' }),
    ])

    expect(text).not.toContain('do ponto')
    expect(text).toContain('sem localização')
  })

  it('nasce compacto: só o resumo e a miniatura, sem leituras nem foto grande', async () => {
    const text = await renderCard(
      [
        makeProof('photo-1', 'photo', {
          capturedAt: '2026-09-30T09:58:00',
          distanceMeters: 12,
          receiverName: 'Marcos Tavares',
        }),
      ],
      { isExpanded: false },
    )

    const toggle = container?.querySelector('button[aria-expanded]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.textContent).toContain('Recebido por Marcos Tavares')
    expect(text).not.toContain('Distância')
    expect(text).not.toContain('Captura')
    expect(container?.querySelectorAll('img').length).toBe(1)
    expect(container?.querySelector('figure')?.nextElementSibling?.tagName).toBe('H4')
    expect(container?.querySelector(`[id="${toggle?.getAttribute('aria-controls')}"]`)).toBeNull()
  })

  it('abrir mostra as leituras e troca a miniatura pela foto; fechar volta ao resumo', async () => {
    await renderCard([makeProof('photo-1', 'photo', { distanceMeters: 12 })], { isExpanded: false })
    const toggle = container?.querySelector<HTMLButtonElement>('button[aria-expanded]')

    await act(async () => {
      toggle?.click()
      await Promise.resolve()
    })
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    const details = container?.querySelector(`[id="${toggle?.getAttribute('aria-controls')}"]`)
    expect(details?.textContent).toContain('a 12 m do ponto')
    expect(details?.querySelector('figure')).not.toBeNull()
    expect(container?.querySelectorAll('figure').length).toBe(1)

    await act(async () => {
      toggle?.click()
      await Promise.resolve()
    })
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container?.querySelector('figure')?.nextElementSibling?.tagName).toBe('H4')
  })

  it('a captura no mesmo minuto da baixa não vira uma segunda leitura', async () => {
    const same = await renderCard([
      makeProof('photo-1', 'photo', { capturedAt: '2026-09-30T10:00:00Z' }),
    ])
    expect(same).not.toContain('Captura')
    act(() => root?.unmount())
    container?.remove()

    const other = await renderCard([
      makeProof('photo-1', 'photo', { capturedAt: '2026-09-30T09:40:00Z' }),
    ])
    expect(other).toContain('Captura')
  })

  it('o conferente aparece uma vez, como texto, nunca como selo', async () => {
    await renderCard([
      makeProof('photo-1', 'photo', {
        canhotoReview: 'approved',
        canhotoReviewAt: '2026-09-30T12:00:00Z',
        canhotoReviewByName: 'Helena Prado',
        canhotoReviewOrigin: 'manual',
      }),
    ])

    const matches = Array.from(container?.querySelectorAll('p') ?? []).filter((paragraph) =>
      paragraph.textContent?.includes('Aprovado por Helena Prado'),
    )
    expect(matches).toHaveLength(1)
    expect(container?.querySelector('.ui-badge')).toBeNull()
  })

  it('sem comprovante: texto de estado vazio, sem imagem e sem rodapé', async () => {
    const text = await renderCard([])

    expect(text).toContain('Comprovante da entrega')
    expect(container?.querySelector('img')).toBeNull()
    expect(container?.querySelector('footer')).toBeNull()
    expect(text.length).toBeGreaterThan('Comprovante da entrega'.length)
  })
})
