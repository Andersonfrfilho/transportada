/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2b: o painel aceita `deliveryDeadline` ANTES de a API o mandar. Os cinco formatos vêm do
 * JSON de referência que a API serializa de verdade (cópia idêntica, conferida lá). O campo é só do
 * `TripDocumentDetail`: o `TripDocument` lê chaves exatas e uma chave nova o derrubaria. Campo
 * malformado cai sozinho — `contact` e `proofPending` da mesma nota ficam.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { TripDocumentDeliveryDeadline } from '@/modules/trip/shared/trip.types'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()
const TIMESTAMP = '2026-10-07T12:00:00.000Z'

const GOLDEN = JSON.parse(
  readFileSync(
    new URL('../fixtures/trip-document-delivery-deadline.golden.json', import.meta.url),
    'utf8',
  ),
) as Record<string, TripDocumentDeliveryDeadline>

const CONTACT = { contractorName: null, name: 'Destinatário', phone: null, taxId: '12345678000190' }

function buildDocument(overrides: Record<string, unknown> = {}) {
  return {
    contact: CONTACT,
    createdAt: TIMESTAMP,
    cteAuthorized: false,
    deliveredAt: null,
    destinationOrigin: 'recipient',
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: 'd1',
    loadedAt: null,
    nfeDocumentId: 'n1',
    proofPending: true,
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: 's1',
    tripId: 't1',
    updatedAt: TIMESTAMP,
    ...overrides,
  }
}

function buildDetail(documentOverrides: Record<string, unknown> = {}) {
  return {
    amounts: null,
    companyId: 'ce523659-5e30-4b13-96ce-8d603d8cb9e9',
    createdAt: TIMESTAMP,
    documents: [buildDocument(documentOverrides)],
    driverNames: [],
    drivers: [],
    estimatedArrivalFrozenAt: null,
    estimatedFinishAt: null,
    id: '66667bb0-1618-417a-96da-f3148da475a3',
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'separating',
    stops: [
      {
        addressKey: '3543402|14076400|2296',
        arrivedAt: null,
        completedAt: null,
        deliveryWindowEnd: null,
        deliveryWindowStart: null,
        documents: [buildDocument(documentOverrides)],
        id: 's1',
        label: 'AVENIDA ARMANDO PENTEADO, 61',
        sequence: 1,
      },
    ],
    updatedAt: TIMESTAMP,
    vehicleId: '31c6e233-e079-4691-8674-c9ed9be2d299',
  }
}

describe('deliveryDeadline na nota da viagem (spec 236 T1.2b)', () => {
  it.each(Object.keys(GOLDEN))('aceita o formato %s da API, na lista e na parada', (state) => {
    const detail = adapters.tripDetailFromApi(buildDetail({ deliveryDeadline: GOLDEN[state] }))

    expect(detail.documents[0]?.deliveryDeadline).toEqual(GOLDEN[state])
    expect(detail.stops[0]?.documents[0]?.deliveryDeadline).toEqual(GOLDEN[state])
    expect(detail.documents[0]?.contact).toEqual(CONTACT)
    expect(detail.documents[0]?.proofPending).toBe(true)
  })

  it('aceita null (not_applicable sai como null)', () => {
    const detail = adapters.tripDetailFromApi(buildDetail({ deliveryDeadline: null }))

    expect(detail.documents[0]?.deliveryDeadline).toBeNull()
    expect(detail.documents[0]?.contact).toEqual(CONTACT)
  })

  it('aceita a nota sem o campo (API anterior)', () => {
    const detail = adapters.tripDetailFromApi(buildDetail())

    expect(detail.documents[0]?.deliveryDeadline).toBeUndefined()
    expect(detail.documents[0]?.proofPending).toBe(true)
  })

  const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
    ['texto', 'on_time'],
    ['estado desconhecido', { dueOn: '2026-10-15', state: 'soon' }],
    ['not_applicable cru', { reason: 'no_arrival', state: 'not_applicable' }],
    ['on_time sem a contagem', { dueOn: '2026-10-15', state: 'on_time' }],
    ['contagem negativa', { businessDaysRemaining: -1, dueOn: '2026-10-15', state: 'on_time' }],
    ['contagem fracionária', { businessDaysLate: 1.5, dueOn: '2026-10-15', state: 'overdue' }],
    ['dueOn com hora', { dueOn: '2026-10-15T00:00:00.000Z', state: 'due_today' }],
    ['dueOn de outro formato', { dueOn: '15/10/2026', state: 'due_today' }],
    ['chave a mais', { dueOn: '2026-10-15', extra: true, state: 'due_today' }],
    ['entregue sem a data', { dueOn: '2026-10-15', state: 'delivered_on_time' }],
    ['lista', [GOLDEN.on_time]],
  ]

  it.each(MALFORMED)(
    'descarta só o campo quando vem %s: contact e proofPending ficam',
    (_, bad) => {
      const detail = adapters.tripDetailFromApi(buildDetail({ deliveryDeadline: bad }))

      expect(detail.documents[0]?.deliveryDeadline).toBeUndefined()
      expect(detail.documents[0]?.contact).toEqual(CONTACT)
      expect(detail.documents[0]?.proofPending).toBe(true)
      expect(detail.stops[0]?.documents[0]?.deliveryDeadline).toBeUndefined()
      expect(detail.stops[0]?.documents[0]?.contact).toEqual(CONTACT)
    },
  )

  it('o TripDocument segue com chaves exatas: uma chave a mais ainda recusa', () => {
    const plain: Record<string, unknown> = buildDocument()
    for (const key of ['contact', 'cteAuthorized', 'fiscalStatus', 'proofPending'])
      delete plain[key]

    expect(() => adapters.tripDocumentFromApi(plain)).not.toThrow()
    expect(() =>
      adapters.tripDocumentFromApi({ ...plain, deliveryDeadline: GOLDEN.on_time }),
    ).toThrow()
  })
})
