/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T009 (ADR-0081 §9): o painel tolera `processingState` antes de a API o publicar e mostra
 * o estado ao operador. Ausente = pronto; a conferência manual espera `ready` (RF11).
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { resolveCanhotoBatchSelection } from '../../src/modules/trip/shared/canhotoBatchSelection.service'
import {
  isDeliveryProofAwaitingProcessing,
  presentDeliveryProofProcessing,
  resolveDeliveryProofImageSource,
  resolveDeliveryProofProcessingState,
} from '../../src/modules/trip/shared/deliveryProof.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const PROOF = {
  createdAt: '2026-10-14T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg?assinatura=original',
  expiresAt: '2026-10-14T12:06:00.000Z',
  id: 'p1',
  kind: 'photo' as const,
  receiverName: 'Maria',
}

const PROCESSING_STATES = ['received', 'processing', 'ready', 'processing_failed'] as const

describe('estado de processamento do comprovante (spec 265 T009)', () => {
  it('a validação aceita e preserva os quatro estados, e a ausência', () => {
    const adapters = createTripResponseAdapters()
    for (const processingState of PROCESSING_STATES) {
      const proof = { ...PROOF, processingState }
      expect(adapters.deliveryProofsFromApi([proof])).toEqual([proof])
    }
    expect(adapters.deliveryProofsFromApi([PROOF])).toEqual([PROOF])
  })

  it('estado fora do vocabulário e chave desconhecida continuam recusados', () => {
    const adapters = createTripResponseAdapters()
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, processingState: 'done' }])).toEqual([])
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, processingState: 3 }])).toEqual([])
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, originalObjectId: 'x' }])).toEqual([])
  })

  it('ausente é pronto', () => {
    expect(resolveDeliveryProofProcessingState(PROOF)).toBe('ready')
    expect(presentDeliveryProofProcessing(PROOF)).toBeUndefined()
    expect(isDeliveryProofAwaitingProcessing(PROOF)).toBe(false)
  })

  it('received e processing mostram "processando" e seguram a conferência', () => {
    for (const processingState of ['received', 'processing'] as const) {
      const proof = { ...PROOF, processingState }
      expect(presentDeliveryProofProcessing(proof)).toBe('processing')
      expect(isDeliveryProofAwaitingProcessing(proof)).toBe(true)
    }
  })

  it('processing_failed mostra "sem versão leve" e não segura a conferência (o original existe)', () => {
    const proof = { ...PROOF, processingState: 'processing_failed' as const }
    expect(presentDeliveryProofProcessing(proof)).toBe('failed')
    expect(isDeliveryProofAwaitingProcessing(proof)).toBe(false)
  })

  it('o original continua sendo a imagem enquanto só ele existe', () => {
    expect(resolveDeliveryProofImageSource({ ...PROOF, processingState: 'processing' })).toBe(
      PROOF.downloadUrl,
    )
  })

  it('RF11: o maço lista o canhoto em processamento, mas ele conta como em espera', () => {
    const selection = resolveCanhotoBatchSelection({
      documents: [
        {
          freightCalculationId: null,
          id: 'd1',
          nfeDocumentId: 'n1',
          nfeNumber: '1',
          nfeSeries: '1',
          releasedAt: null,
        },
      ] as never,
      proofs: [
        { ...PROOF, canhotoReview: 'pending', documentId: 'd1', processingState: 'processing' },
      ],
      selectedIds: new Set(['d1']),
      tripStatus: 'in_progress' as never,
    })
    expect(selection.eligible).toHaveLength(1)
    expect(isDeliveryProofAwaitingProcessing(selection.eligible[0]!.proof)).toBe(true)
  })

  it('locales pt-BR e en trazem as linhas', () => {
    for (const file of ['trip.locale.json', 'trip.en.locale.json']) {
      const locale = JSON.parse(
        readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
      ) as { deliveryProof: { processing: Record<string, string> } }
      expect(locale.deliveryProof.processing['processing']).toBeTruthy()
      expect(locale.deliveryProof.processing['failed']).toBeTruthy()
      expect(locale.deliveryProof.processing['waitingReview']).toBeTruthy()
    }
  })
})
