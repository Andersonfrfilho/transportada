/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isProofPendingWarningDue,
  listProofPendingDocuments,
} from '@/modules/driver-trip/shared/driverTripView.service'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import type {
  DriverTrip,
  DriverTripDocument,
  DriverTripSnapshot,
  DriverTripStop,
} from '@/modules/driver-trip/shared/driverTrip.types'

function buildDocument(overrides: Partial<DriverTripDocument> = {}): DriverTripDocument {
  return {
    accessKey: '',
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '',
    id: 'document-1',
    number: '123',
    proofPending: false,
    recipientName: 'Cliente',
    returnReason: null,
    separationStatus: 'pending',
    series: '1',
    totalAmount: '0',
    volumeCount: '1',
    ...overrides,
  }
}

function buildStop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'Rua das Entregas, 100',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

function buildTrip(overrides: Partial<DriverTrip> = {}): DriverTrip {
  return {
    id: 'trip-1',
    manifest: null,
    status: 'in_transit',
    stops: [],
    vehiclePlate: 'ABC1D23',
    ...overrides,
  }
}

describe('a resposta do snapshot com proofPending e score (RF1/RF2)', () => {
  it('lê proofPending por documento e score na raiz', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        score: 85,
        trips: [
          {
            id: 'trip-1',
            manifest: null,
            status: 'in_transit',
            stops: [
              {
                documents: [
                  { id: 'document-1', proofPending: true, separationStatus: 'delivered' },
                ],
                id: 'stop-1',
                label: 'Rua das Entregas, 100',
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })

    expect(snapshot.score).toBe(85)
    expect(snapshot.trips[0]?.stops[0]?.documents[0]?.proofPending).toBe(true)
  })

  it('proofPending ausente vira false, e score fora de faixa vira null — nunca quebra a tela', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        score: 250,
        trips: [
          {
            id: 'trip-1',
            manifest: null,
            status: 'in_transit',
            stops: [
              {
                documents: [{ id: 'document-1', separationStatus: 'pending' }],
                id: 'stop-1',
                label: 'Rua das Entregas, 100',
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })

    expect(snapshot.score).toBeNull()
    expect(snapshot.trips[0]?.stops[0]?.documents[0]?.proofPending).toBe(false)
  })

  it('score null (sem histórico) permanece null', () => {
    const snapshot = toDriverTripSnapshot({
      data: { isRegisteredDriver: true, score: null, trips: [] },
    })

    expect(snapshot.score).toBeNull()
  })
})

describe('o aviso da foto obrigatória antes de entregar (RF12)', () => {
  it('avisa quando a nota exige foto e ainda não foi entregue', () => {
    expect(
      isProofPendingWarningDue({
        document: buildDocument({ deliveryProof: null, separationStatus: 'pending' }),
        stopProofSettings: {
          photo: 'required',
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
        },
      }),
    ).toBe(true)
  })

  it('não avisa quando a foto é opcional ou desligada', () => {
    expect(
      isProofPendingWarningDue({
        document: buildDocument(),
        stopProofSettings: {
          photo: 'optional',
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
        },
      }),
    ).toBe(false)
  })

  it('não avisa depois de entregue — o aviso é só antes do toque', () => {
    expect(
      isProofPendingWarningDue({
        document: buildDocument({ separationStatus: 'delivered' }),
        stopProofSettings: {
          photo: 'required',
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
        },
      }),
    ).toBe(false)
  })
})

describe('a lista de fotos pendentes (T9)', () => {
  it('reúne toda nota proofPending de qualquer viagem, na ordem da parada', () => {
    const snapshot: DriverTripSnapshot = {
      isRegisteredDriver: true,
      score: 90,
      trips: [
        buildTrip({
          stops: [
            buildStop({
              documents: [
                buildDocument({ id: 'a', proofPending: false }),
                buildDocument({ id: 'b', proofPending: true }),
              ],
              id: 'stop-1',
              label: 'Parada 1',
            }),
            buildStop({
              documents: [buildDocument({ id: 'c', proofPending: true })],
              id: 'stop-2',
              label: 'Parada 2',
            }),
          ],
        }),
      ],
    }

    const entries = listProofPendingDocuments(snapshot)

    expect(entries.map((entry) => entry.document.id)).toEqual(['b', 'c'])
    expect(entries[1]?.stopLabel).toBe('Parada 2')
  })

  it('sem snapshot, a lista é vazia', () => {
    expect(listProofPendingDocuments(undefined)).toEqual([])
  })
})
