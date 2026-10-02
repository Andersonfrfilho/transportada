/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T4.1 (D4): o comprovante tem dois eixos — conferência e pontualidade — e cada um é um selo.
 * Prova pelo **markup renderizado**: nenhum estado esconde o outro (recusado e longe do ponto diz as
 * duas coisas), nota sem comprovante não ganha selo, e sem `fleet.read` a consulta nem é feita.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProof } from '../../src/modules/trip/components/TripDeliveryProof.component'
import {
  TripStopDocumentGroup,
  type TripStopDocumentActions,
} from '../../src/modules/trip/components/TripStopList.component'
import {
  resolveDeliveryProofView,
  type DeliveryProof,
  type DeliveryProofCanhotoReview,
  type DeliveryProofPunctuality,
} from '../../src/modules/trip/shared/deliveryProof.service'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'
import {
  buildTripDocumentProofBadgesByDocumentId,
  resolveTripDocumentProofBadges,
} from '../../src/modules/trip/shared/tripDocumentProofBadges.service'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook, waitFor } from './renderHook.helper'

const { useTripProofBadgesQuery } = await import('@/modules/trip/queries/useTripProofBadges.query')

const REVIEW_LABEL = {
  approved: 'Aprovado',
  pending: 'Aguardando conferência',
  rejected: 'Recusado',
} as const satisfies Record<DeliveryProofCanhotoReview, string>
const PUNCTUALITY_LABEL = {
  away: 'Longe do ponto',
  late: 'Atrasada',
  late_and_away: 'Atrasada e longe do ponto',
  on_time: 'No horário',
} as const
const PROOF_PENDING_LABEL = 'Canhoto pendente'
const REVIEWS = ['pending', 'approved', 'rejected'] as const
const PUNCTUALITIES = ['on_time', 'late', 'away', 'late_and_away', undefined] as const

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await i18n.changeLanguage('pt-BR')
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function makeProof(
  review: DeliveryProofCanhotoReview | undefined,
  punctuality: DeliveryProofPunctuality | undefined,
): DeliveryProof {
  return {
    ...(review === undefined ? {} : { canhotoReview: review }),
    ...(punctuality === undefined ? {} : { punctuality }),
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: 'https://storage.test/original/receipt',
    expiresAt: '2026-09-30T10:05:00Z',
    id: 'proof-1',
    kind: 'photo',
    receiverName: '',
  }
}

function makeDocument(overrides: Partial<TripDocumentDetail> = {}): TripDocumentDetail {
  return {
    cteAuthorized: false,
    deliveredAt: '2026-09-30',
    fiscalStatus: 'authorized',
    id: 'doc-1',
    nfeNumber: '1',
    nfeSeries: '1',
    returnedAt: null,
    separationStatus: 'delivered',
    ...overrides,
  } as unknown as TripDocumentDetail
}

function renderHeader(
  proofs: readonly DeliveryProof[],
  document: TripDocumentDetail = makeDocument(),
): HTMLElement {
  const actions = {
    canFieldDelivery: () => false,
    canFieldOccurrence: () => false,
    canManage: false,
    canSeparationOccurrence: false,
    capabilities: { canDocument: () => false, canStop: () => false, canTrip: () => false },
    fiscalReadinessByDocumentId: new Map(),
    openDocumentId: null,
    proofBadgesByDocumentId: buildTripDocumentProofBadgesByDocumentId(
      proofs.map((proof) => ({ ...proof, documentId: 'doc-1' })),
    ),
    renderOccurrences: () => null,
    renderProof: () => null,
  } as unknown as TripStopDocumentActions
  const selection = {
    clear: () => undefined,
    replace: () => undefined,
    selectedIds: new Set<string>(),
    toggle: () => undefined,
    toggleMany: () => undefined,
  }
  container = window.document.createElement('div')
  window.document.body.append(container)
  root = createRoot(container)
  act(() =>
    root?.render(
      createElement(TripStopDocumentGroup, { actions, documents: [document], selection }),
    ),
  )
  return container
}

function badgesOf(dom: HTMLElement): HTMLElement | null {
  return dom.querySelector<HTMLElement>('[data-part="proof-badges"]')
}

describe('os selos do comprovante no cabeçalho da nota (spec 227 D4)', () => {
  for (const review of REVIEWS) {
    for (const punctuality of PUNCTUALITIES) {
      it(`conferência ${review} × pontualidade ${punctuality ?? 'ausente'}: um selo por eixo`, () => {
        const dom = renderHeader([makeProof(review, punctuality)])
        const text = badgesOf(dom)?.textContent ?? ''

        expect(text).toContain(REVIEW_LABEL[review])
        if (punctuality === undefined) {
          for (const label of Object.values(PUNCTUALITY_LABEL)) {
            expect(text.replace(PUNCTUALITY_LABEL.on_time, '')).not.toContain(label)
          }
        } else {
          expect(text).toContain(PUNCTUALITY_LABEL[punctuality])
        }
      })
    }
  }

  it('recusado e longe do ponto diz as duas coisas', () => {
    const text = badgesOf(renderHeader([makeProof('rejected', 'away')]))?.textContent ?? ''

    expect(text).toContain('Recusado')
    expect(text).toContain('Longe do ponto')
  })

  it('o selo de canhoto pendente da spec 223 convive com os dois, sem substituí-los', () => {
    const dom = renderHeader(
      [makeProof('rejected', 'late_and_away')],
      makeDocument({ proofPending: true }),
    )

    expect(dom.textContent).toContain(PROOF_PENDING_LABEL)
    expect(badgesOf(dom)?.textContent).toContain('Recusado')
    expect(badgesOf(dom)?.textContent).toContain('Atrasada e longe do ponto')
  })

  it('nota sem comprovante não ganha selo, nem rótulo vazio', () => {
    const dom = renderHeader([], makeDocument({ deliveredAt: null, separationStatus: 'pending' }))

    expect(badgesOf(dom)).toBeNull()
    expect(dom.textContent).not.toContain(REVIEW_LABEL.pending)
  })

  it('sem comprovante o serviço não devolve selo algum', () => {
    expect(resolveTripDocumentProofBadges(undefined)).toBeUndefined()
    expect(buildTripDocumentProofBadgesByDocumentId([]).size).toBe(0)
  })

  it('pontualidade dispensada (not_required) não vira selo', () => {
    const dom = renderHeader([makeProof(undefined, 'not_required')])

    expect(badgesOf(dom)).toBeNull()
  })

  it('os selos ficam fora do botão de abrir', () => {
    const dom = renderHeader([makeProof('approved', 'on_time')])
    const toggle = dom.querySelector('button[aria-expanded]')

    expect(toggle?.contains(badgesOf(dom))).toBe(false)
    expect(toggle?.textContent).not.toContain('Aprovado')
  })

  it('os rótulos saem em inglês, das mesmas chaves', async () => {
    await i18n.changeLanguage('en')
    const text = badgesOf(renderHeader([makeProof('rejected', 'away')]))?.textContent ?? ''

    expect(text).toContain('Rejected')
    expect(text).toContain('Away from the stop')
  })
})

describe('os selos no topo da seção do comprovante (spec 227 D4)', () => {
  function renderSection(proof: DeliveryProof): HTMLElement {
    const view = resolveDeliveryProofView({
      document: {
        deliveredAt: '2026-09-30T10:00:00Z',
        returnedAt: null,
        returnReason: null,
        separationStatus: 'delivered',
      },
      proofs: [proof],
    })
    container = window.document.createElement('div')
    window.document.body.append(container)
    root = createRoot(container)
    act(() =>
      root?.render(
        createElement(TripDeliveryProof, {
          documentId: 'doc-1',
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
    return container
  }

  it('recusado e longe do ponto: os dois selos no cabeçalho da seção, e a pontualidade só ali', () => {
    const dom = renderSection({ ...makeProof('rejected', 'away'), distanceMeters: 1500 })
    const header = dom.querySelector('header')

    expect(header?.textContent).toContain('Recusado')
    expect(header?.textContent).toContain('Longe do ponto')
    expect(dom.textContent?.split('Longe do ponto').length).toBe(2)
  })

  it('a distância e o alerta de longe do ponto continuam na leitura', () => {
    const dom = renderSection({ ...makeProof('approved', 'away'), distanceMeters: 1500 })
    const alert = dom.querySelector('[data-alert="true"]')

    expect(alert?.textContent).toContain('1,5')
  })
})

describe('a consulta dos selos (spec 227 D4)', () => {
  const PROOFS = [
    { ...makeProof('rejected', 'away'), documentId: 'doc-1' },
    { ...makeProof('approved', undefined), documentId: 'doc-2', id: 'proof-2' },
  ]

  function installClient(): { calls: () => number } {
    let calls = 0
    fakes.tripClient = {
      ...fakes.tripClient,
      readTripDeliveryProofs: () => {
        calls += 1
        return Promise.resolve(PROOFS)
      },
    }
    return { calls: () => calls }
  }

  it('sem a permissão que a rota exige, não faz chamada', async () => {
    resetTripHookFakes([])
    const client = installClient()

    const rendered = await renderHook(() =>
      useTripProofBadgesQuery({
        canRead: false,
        companyId: 'company-1',
        hasAnyProof: true,
        tripId: 'trip-1',
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(client.calls()).toBe(0)
    rendered.unmount()
  })

  /**
   * Viagem que ainda não entregou nada não tem comprovante algum: a rota devolveria uma lista vazia com as
   * URLs assinadas de ninguém, e o cabeçalho de cada nota não teria selo para mostrar. A chamada seria à toa.
   */
  it('viagem sem nota entregue ou devolvida não faz chamada, mesmo com a permissão', async () => {
    resetTripHookFakes([])
    const client = installClient()

    const rendered = await renderHook(() =>
      useTripProofBadgesQuery({
        canRead: true,
        companyId: 'company-1',
        hasAnyProof: false,
        tripId: 'trip-1',
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(client.calls()).toBe(0)
    rendered.unmount()
  })

  it('com a permissão, uma chamada só para a viagem inteira, indexada por nota', async () => {
    resetTripHookFakes([])
    const client = installClient()

    const rendered = await renderHook(() =>
      useTripProofBadgesQuery({
        canRead: true,
        companyId: 'company-1',
        hasAnyProof: true,
        tripId: 'trip-1',
      }),
    )
    await waitFor(() => expect(rendered.result().data?.size).toBe(2))

    expect(client.calls()).toBe(1)
    expect(rendered.result().data?.get('doc-1')).toEqual({
      punctuality: 'away',
      review: 'rejected',
    })
    expect(rendered.result().data?.get('doc-2')).toEqual({ review: 'approved' })
    rendered.unmount()
  })
})
