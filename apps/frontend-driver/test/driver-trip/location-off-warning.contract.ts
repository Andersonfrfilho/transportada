/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DriverStopCard } from '../../src/modules/driver-trip/components/DriverStopCard.component'
import type {
  DriverTripDocument,
  DriverTripStop,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { i18n } from '../../src/modules/shared/i18n/i18n.service'

const WARNING =
  'Localização desligada: entregar assim conta como longe do local e pode tirar pontos da sua nota. Ligue a localização do aparelho para a entrega valer no local.'

function buildDocument(): DriverTripDocument {
  return {
    accessKey: '0'.repeat(44),
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '10.000',
    id: 'document-1',
    number: '1001',
    occurrenceTypes: null,
    proofPending: false,
    recipientDisplayName: 'Destinatário',
    recipientIsCompany: false,
    recipientName: 'Destinatário',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '100.00',
    volumeCount: '1',
  }
}

function buildStop(input: { readonly hasArrived: boolean }): DriverTripStop {
  return {
    arrivedAt: input.hasArrived ? '2026-10-03T10:00:00.000Z' : null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [buildDocument()],
    id: 'stop-1',
    label: 'Rua das Entregas, 100',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
  }
}

function renderCard(input: { readonly hasArrived: boolean; readonly isLocationDenied: boolean }) {
  const noop = () => undefined
  return renderToStaticMarkup(
    createElement(DriverStopCard, {
      canReportArrival: true,
      canStartRoute: { enabled: true },
      deliverActivityByDocumentId: new Map(),
      isCurrent: true,
      isEnRoute: false,
      isFieldWorkBlocked: false,
      isLocationDenied: input.isLocationDenied,
      isOpen: true,
      lastKnownLocation: null,
      notDeliveredStatusByDocumentId: new Map(),
      occurrenceTypes: { status: 'loading' },
      onArrive: noop,
      onCancelDeparture: noop,
      onDeliver: noop,
      onDepart: noop,
      onDiscardProofAwaitingDelivery: noop,
      onFocusStop: noop,
      onHeaderRef: noop,
      onNotDelivered: noop,
      onProof: () => Promise.resolve(true),
      onQueuedDocumentOccurrence: () => Promise.resolve('queued'),
      onRetryOccurrenceTypes: noop,
      onStopOccurrence: () => Promise.resolve('queued'),
      onToggle: noop,
      queueView: [],
      returnActivityByDocumentId: new Map(),
      sentReportKeys: new Set(),
      stop: buildStop({ hasArrived: input.hasArrived }),
      stopOccurrenceActivity: undefined,
      tappedReports: [],
    }),
  )
}

/**
 * Spec 234 D4d: com a localização do aparelho negada, entregar conta como "longe" (D4c). O aviso vem
 * antes do "Entreguei" — e só avisa: o botão continua lá, tocável.
 */
describe('o cartão da parada avisa antes do "Entreguei" com a localização negada (spec 234 D4d)', () => {
  it('negada, com a chegada registrada: o aviso aparece, antes do botão "Entreguei"', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ hasArrived: true, isLocationDenied: true })

    expect(html).toContain(WARNING)
    expect(html.indexOf(WARNING)).toBeLessThan(html.indexOf('Entreguei'))
  })

  it('o aviso não bloqueia: o botão "Entreguei" segue no cartão, sem estar desabilitado', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ hasArrived: true, isLocationDenied: true })

    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>(?:(?!<\/button>).)*Entreguei/su)
  })

  it('o aviso é um status anunciado, não um alerta que interrompe', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ hasArrived: true, isLocationDenied: true })

    expect(html).toMatch(/role="status"[^>]*>(?:(?!<\/div>).)*Localização desligada/su)
  })

  it('localização liberada (ou sem resposta da API de permissões): nenhum aviso', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ hasArrived: true, isLocationDenied: false })

    expect(html).not.toContain('Localização desligada')
    expect(html).toContain('Entreguei')
  })

  it('negada, mas sem "Cheguei": não há "Entreguei", então não há aviso', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ hasArrived: false, isLocationDenied: true })

    expect(html).not.toContain('Localização desligada')
  })

  it('o texto em inglês diz o mesmo', async () => {
    await i18n.changeLanguage('en')

    const html = renderCard({ hasArrived: true, isLocationDenied: true })
    await i18n.changeLanguage('pt-BR')

    expect(html).toContain(
      "Location is off: delivering this way counts as away from the location and may cost points on your score. Turn on your device's location so the delivery counts on site.",
    )
  })
})
