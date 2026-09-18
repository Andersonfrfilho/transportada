/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '@/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEn from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import {
  isProofPendingWarningDue,
  listProofPendingDocuments,
} from '@/modules/driver-trip/shared/driverTripView.service'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import type {
  DriverTripDocument,
  DriverTripSnapshot,
  PendingProofDocument,
} from '@/modules/driver-trip/shared/driverTrip.types'

const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)

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

function buildPendingProof(overrides: Partial<PendingProofDocument> = {}): PendingProofDocument {
  return {
    deliveredAt: null,
    deliveryProof: null,
    documentId: 'document-1',
    documentNumber: '123',
    documentSeries: '1',
    recipientName: 'Cliente',
    tripId: 'trip-1',
    tripStatus: 'in_transit',
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

  /** Spec 159 (T11, item 8): o cartão chama o serviço, nunca reimplementa a condição à parte. */
  it('o cartão da parada usa isProofPendingWarningDue, sem reimplementar a condição', () => {
    const card = readFileSync(CARD, 'utf8')
    expect(card).toInclude('isProofPendingWarningDue({ document, stopProofSettings })')
    expect(card).not.toInclude("proofSettings?.photo === 'required' ? (")
  })

  /**
   * Spec 159 (T11, item 3, ADR-0069 D3a/D3b): tirar a foto de novo não melhora a pontualidade, e a
   * foto que sobe muito depois conta como tardia mesmo com o relógio do aparelho dizendo outra
   * hora — o aviso tem de dizer isso em linguagem simples.
   */
  it('o aviso diz que refazer não ajuda e que o atraso no envio conta mesmo assim', () => {
    expect(driverTrip.proofPendingWarning).toInclude('Tirar de novo não melhora')
    expect(driverTrip.proofPendingWarning).toInclude('relógio do aparelho')
    expect(driverTripEn.proofPendingWarning).toInclude('Retaking it never helps')
    expect(driverTripEn.proofPendingWarning).toInclude('device clock')
  })

  /**
   * Spec 159 (T12, revisão de design): o aviso aparece **antes** do "Entreguei" — dizer que a entrega
   * já está registrada era falso ali. Título curto e uma frase à vista; a regra fina fica a um toque.
   */
  it('o aviso do cartão é curto, não mente sobre a entrega e guarda o detalhe num toque', () => {
    const card = readFileSync(CARD, 'utf8')
    expect(driverTrip.proofPendingWarning).not.toInclude('já está registrada')
    expect(driverTrip.proofPendingWarningTitle).toBe('Foto do canhoto obrigatória')
    expect(driverTrip.proofPendingWarningLead).toInclude('tira pontos da sua nota')
    expect(card).toInclude("t('proofPendingWarningTitle')")
    expect(card).toInclude('<details className={styles.proofPendingWarningDetails}>')
  })
})

/**
 * Spec 159 (T11, revisão): `pendingProofs` sai da **raiz** do snapshot, não mais do percurso por
 * `trips` — é o único jeito de ver a pendente de uma viagem já `completed`, que sai de `trips` mas
 * continua aqui. Contrato novo do frontend registrado em `evidence.md` §T11.
 */
describe('a resposta do snapshot com pendingProofs na raiz (T11)', () => {
  it('lê pendingProofs mesmo sem viagem ativa nenhuma', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [
          {
            deliveredAt: '2026-09-18T12:00:00.000Z',
            deliveryProof: {
              photo: 'required',
              receiverDocument: 'off',
              receiverName: 'optional',
              signature: 'optional',
            },
            documentId: 'document-1',
            documentNumber: '1234',
            documentSeries: '1',
            recipientName: 'Cliente',
            tripId: 'trip-1',
            tripStatus: 'completed',
          },
        ],
        score: 85,
        trips: [],
      },
    })

    expect(snapshot.trips).toEqual([])
    expect(snapshot.pendingProofs).toEqual([
      {
        deliveredAt: '2026-09-18T12:00:00.000Z',
        deliveryProof: {
          photo: 'required',
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
        },
        documentId: 'document-1',
        documentNumber: '1234',
        documentSeries: '1',
        recipientName: 'Cliente',
        tripId: 'trip-1',
        tripStatus: 'completed',
      },
    ])
  })

  it('pendingProofs ausente (snapshot em cache antigo) vira lista vazia', () => {
    const snapshot = toDriverTripSnapshot({
      data: { isRegisteredDriver: true, score: null, trips: [] },
    })

    expect(snapshot.pendingProofs).toEqual([])
  })

  it('item sem documentId ou tripId some da lista, sem quebrar a tela', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [{ recipientName: 'Sem id' }],
        score: null,
        trips: [],
      },
    })

    expect(snapshot.pendingProofs).toEqual([])
  })
})

describe('a lista de fotos pendentes (T9, T11)', () => {
  it('lê a raiz do snapshot, na ordem que a API mandou', () => {
    const snapshot: DriverTripSnapshot = {
      isRegisteredDriver: true,
      pendingProofs: [
        buildPendingProof({ documentId: 'b' }),
        buildPendingProof({ documentId: 'c', tripId: 'trip-2', tripStatus: 'completed' }),
      ],
      score: 90,
      trips: [],
    }

    const entries = listProofPendingDocuments(snapshot)

    expect(entries.map((entry) => entry.documentId)).toEqual(['b', 'c'])
    expect(entries[1]?.tripStatus).toBe('completed')
  })

  it('alcança a pendente de uma viagem concluída, sem viagem ativa no snapshot', () => {
    const snapshot: DriverTripSnapshot = {
      isRegisteredDriver: true,
      pendingProofs: [buildPendingProof({ tripStatus: 'completed' })],
      score: 90,
      trips: [],
    }

    expect(listProofPendingDocuments(snapshot)).toHaveLength(1)
  })

  it('sem snapshot, a lista é vazia', () => {
    expect(listProofPendingDocuments(undefined)).toEqual([])
  })
})
