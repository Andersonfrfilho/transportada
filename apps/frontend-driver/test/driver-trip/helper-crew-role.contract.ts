/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DriverHelperNotice } from '../../src/modules/driver-trip/components/DriverHelperNotice.component'
import { DriverStopCard } from '../../src/modules/driver-trip/components/DriverStopCard.component'
import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  DriverTripRequestError,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { toDriverTripSnapshot } from '../../src/modules/driver-trip/shared/driverTripResponse.validation'
import type {
  DriverTripDocument,
  DriverTripStop,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueue,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { canReportOnTrip } from '../../src/modules/driver-trip/shared/tripCrewRole.service'
import { i18n } from '../../src/modules/shared/i18n/i18n.service'

const WORKSPACE = readFileSync(
  new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
  'utf8',
)

const TRIP = {
  createdAt: '2026-09-18T09:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000100',
  manifest: null,
  status: 'dispatched',
  stops: [],
  vehiclePlate: 'GCQ8E47',
}

function parseTrip(trip: Record<string, unknown>) {
  const snapshot = toDriverTripSnapshot({
    data: { isRegisteredDriver: true, pendingProofs: [], score: null, trips: [trip] },
  })
  return snapshot.trips[0]
}

describe('a viagem sabe o papel de quem a lê (spec 239 D4)', () => {
  it('helper e driver atravessam a validação como vieram da API', () => {
    expect(parseTrip({ ...TRIP, crewRole: 'helper' })?.crewRole).toBe('helper')
    expect(parseTrip({ ...TRIP, crewRole: 'driver' })?.crewRole).toBe('driver')
  })

  it('resposta antiga, sem crewRole, vale driver — o cache de ontem não quebra', () => {
    expect(parseTrip(TRIP)?.crewRole).toBe('driver')
  })

  it('papel fora do vocabulário degrada para somente leitura, nunca para motorista', () => {
    for (const unknownRole of ['observer', 7, null]) {
      const trip = parseTrip({ ...TRIP, crewRole: unknownRole })

      expect(trip?.crewRole).toBe('helper')
      expect(trip === undefined ? true : canReportOnTrip(trip)).toBe(false)
    }
  })

  it('a viagem com papel desconhecido não derruba as outras da mesma resposta', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [
          { ...TRIP, crewRole: 'observer', id: 'trip-unknown' },
          { ...TRIP, crewRole: 'driver', id: 'trip-driver' },
          { ...TRIP, id: 'trip-legacy' },
        ],
      },
    })

    expect(snapshot.trips.map((trip) => trip.crewRole)).toEqual(['helper', 'driver', 'driver'])
  })

  it('só o ajudante não reporta; viagem de snapshot antigo (sem o campo) reporta como motorista', () => {
    expect(canReportOnTrip({ crewRole: 'helper' })).toBe(false)
    expect(canReportOnTrip({ crewRole: 'driver' })).toBe(true)
    expect(canReportOnTrip({})).toBe(true)
  })
})

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

function buildStop(hasArrived: boolean): DriverTripStop {
  return {
    arrivedAt: hasArrived ? '2026-10-03T10:00:00.000Z' : null,
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

function renderCard(input: { readonly hasArrived?: boolean; readonly isReadOnly?: boolean }) {
  const noop = () => undefined
  return renderToStaticMarkup(
    createElement(DriverStopCard, {
      canReportArrival: true,
      canStartRoute: { enabled: true },
      deliverActivityByDocumentId: new Map<string, never>(),
      isCurrent: true,
      isEnRoute: false,
      isFieldWorkBlocked: false,
      isLocationDenied: false,
      ...(input.isReadOnly === undefined ? {} : { isReadOnly: input.isReadOnly }),
      isOpen: true,
      lastKnownLocation: null,
      notDeliveredStatusByDocumentId: new Map<string, never>(),
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
      onQueuedDocumentOccurrence: () => 'queued',
      onRetryOccurrenceTypes: noop,
      onStopOccurrence: () => 'queued',
      onToggle: noop,
      queueView: [],
      returnActivityByDocumentId: new Map<string, never>(),
      sentReportKeys: new Set<string>(),
      stop: buildStop(input.hasArrived ?? true),
      stopOccurrenceActivity: undefined,
      tappedReports: [],
    }),
  )
}

describe('o ajudante acompanha, não opera (spec 239 RF-3)', () => {
  it('motorista: o cartão traz as ações de campo (Entreguei, Não entreguei, ocorrência)', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({})

    expect(html).toContain('Entreguei')
    expect(html).toContain('Navegar')
  })

  it('ajudante: nenhuma ação que a API recusa — chegada, entrega, devolução, ocorrência, depois', async () => {
    await i18n.changeLanguage('pt-BR')

    const arrived = renderCard({ isReadOnly: true })
    const notArrived = renderCard({ hasArrived: false, isReadOnly: true })

    expect(arrived).not.toContain('Entreguei')
    expect(arrived).not.toContain('Registrar entrega depois')
    expect(arrived).not.toMatch(/Não entreguei|Devolução|Devolver/u)
    expect(arrived).not.toMatch(/Ocorrência|Deu problema/u)
    expect(notArrived).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*(Cheguei|Iniciar rota)/su)
    expect(notArrived).not.toContain('Registrar entrega depois')
    expect(renderCard({ hasArrived: false })).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Cheguei/su)
  })

  it('ajudante: a leitura continua — a parada, a nota e o botão de navegar', async () => {
    await i18n.changeLanguage('pt-BR')

    const html = renderCard({ isReadOnly: true })

    expect(html).toContain('Rua das Entregas, 100')
    expect(html).toContain('1001')
    expect(html).toContain('Navegar')
  })
})

describe('o aviso fixo do ajudante (spec 239 RF-3)', () => {
  it('é um status anunciado e diz que ele acompanha como ajudante, nos dois idiomas', async () => {
    await i18n.changeLanguage('pt-BR')
    const pt = renderToStaticMarkup(createElement(DriverHelperNotice))
    expect(pt).toContain('role="status"')
    expect(pt).toContain('Você acompanha esta viagem como ajudante')

    await i18n.changeLanguage('en')
    const en = renderToStaticMarkup(createElement(DriverHelperNotice))
    expect(en).toContain('You are following this trip as a helper')
    await i18n.changeLanguage('pt-BR')
  })

  it('as chaves existem nos dois locales, com texto não vazio', () => {
    expect(driverTrip.helperNotice.title.length).toBeGreaterThan(0)
    expect(driverTrip.helperNotice.detail.length).toBeGreaterThan(0)
    expect(driverTripEn.helperNotice.title.length).toBeGreaterThan(0)
    expect(driverTripEn.helperNotice.detail.length).toBeGreaterThan(0)
  })
})

describe('a tela da viagem não oferece nem enfileira nada ao ajudante (spec 239 RF-3)', () => {
  it('o aviso monta só para o ajudante, e o cartão recebe o modo de leitura', () => {
    expect(WORKSPACE).toContain('<DriverHelperNotice />')
    expect(WORKSPACE).toContain('isReadOnly={!canReportOnTrip(trip)}')
  })

  it('o despacho da viagem fica atrás do mesmo predicado', () => {
    expect(WORKSPACE).toMatch(
      /trip !== undefined\s*&&\s*canReportOnTrip\(trip\)\s*&&\s*isAwaitingDispatch\(trip\)/u,
    )
  })

  it('a localização só é compartilhada por viagem em que ele reporta', () => {
    expect(WORKSPACE).toContain('useLocationSharing(reportableTrips)')
  })
})

/**
 * O que acontece, hoje, quando mesmo assim um toque de ajudante chega à fila (aparelho com a API
 * antiga, item gravado antes do papel mudar): o 403 é recusa do servidor — sai da fila como
 * "recusado", visível, e nunca é reenviado.
 */
describe('um 403 na fila é recusa, nunca nova tentativa (spec 239 RF-3)', () => {
  it('o 403 vira `rejected` com a causa, não `failed-network`', () => {
    const error = new DriverTripRequestError({
      code: 'FORBIDDEN',
      isOffline: false,
      status: 403,
    })

    expect(toAttachmentSendOutcome(error)).toEqual({ cause: '403 FORBIDDEN', kind: 'rejected' })
  })

  it('a drenagem tira o item recusado da fila e não o reenvia', async () => {
    let items: readonly QueuedReport[] = [
      {
        attempts: 0,
        createdAt: '2026-10-03T10:00:00.000Z',
        report: {
          idempotencyKey: 'key-1',
          kind: 'arrive',
          location: null,
          stopId: 'stop-1',
        },
      },
    ]
    const store: OfflineQueueStore = {
      read: () => Promise.resolve(items),
      update: (mutate) => {
        items = mutate(items)
        return Promise.resolve(items)
      },
    }
    let sends = 0
    const send = () => {
      sends += 1
      return Promise.resolve('rejected' as const)
    }

    const first = await drainQueue({ send, store })
    const second = await drainQueue({ send, store })

    expect(first.rejected).toHaveLength(1)
    expect(first.remaining).toBe(0)
    expect(second.rejected).toHaveLength(0)
    expect(sends).toBe(1)
  })
})
