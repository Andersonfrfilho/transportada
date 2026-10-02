/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 205 RF8: o registro tardio sai na linha do tempo e no comprovante **como dado**. O painel
 * aceita os dois corpos — da API anterior ao campo e da posterior — e continua recusando chave
 * desconhecida e tipo errado.
 */
import { describe, expect, it } from 'bun:test'

import { resolveProofRadiusMeters } from '../../src/modules/trip/shared/deliveryProof.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TIMELINE_ITEM = {
  actorName: 'Marina Alves',
  channel: 'driver_app' as const,
  closeReason: null,
  document: { id: 'doc-1', number: '123', series: '1' },
  fromStatus: null,
  id: 'item-1',
  kind: 'document.delivered' as const,
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-09-25T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 1 },
  toStatus: null,
}

const PROOF = {
  createdAt: '2026-09-25T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg?assinatura=abc',
  expiresAt: '2026-09-25T12:06:00.000Z',
  id: 'p1',
  kind: 'photo' as const,
  receiverName: '',
}

describe('linha do tempo tolera lateRegistration (spec 205 RF8)', () => {
  it('aceita o item sem o campo (API anterior)', () => {
    const page = adapters.tripTimelineFromApi({ items: [TIMELINE_ITEM], nextCursor: null })

    expect(page.items).toHaveLength(1)
  })

  it('aceita o item com lateRegistration booleano e o preserva', () => {
    const page = adapters.tripTimelineFromApi({
      items: [{ ...TIMELINE_ITEM, lateRegistration: true }],
      nextCursor: null,
    })

    expect(page.items[0]?.lateRegistration).toBe(true)
  })

  it('recusa lateRegistration que não é booleano', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...TIMELINE_ITEM, lateRegistration: 'true' }],
        nextCursor: null,
      }),
    ).toThrow()
  })

  it('continua recusando chave desconhecida', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...TIMELINE_ITEM, lateRegistrationAt: '2026-09-25T12:00:00.000Z' }],
        nextCursor: null,
      }),
    ).toThrow()
  })
})

describe('comprovante tolera lateRegistration (spec 205 RF8)', () => {
  it('aceita o comprovante sem o campo (API anterior)', () => {
    expect(adapters.deliveryProofsFromApi([PROOF])).toHaveLength(1)
  })

  /**
   * `receiverDocument` já sai da API desde a spec 082 (sempre a máscara, vazia de fábrica) e o
   * validador de chave exata recusava a lista inteira por ela — a tolerância entra junto.
   */
  it('aceita lateRegistration e receiverDocument mascarado', () => {
    const [proof] = adapters.deliveryProofsFromApi([
      { ...PROOF, lateRegistration: true, receiverDocument: '***.938.570-**' },
    ])

    expect(proof?.lateRegistration).toBe(true)
  })

  /** Spec 193 T3.1: o item estranho sai sozinho da lista, sem derrubar os outros. */
  it('descarta o comprovante com lateRegistration que não é booleano', () => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, lateRegistration: 1 }, PROOF])).toEqual([
      PROOF,
    ])
  })

  it('continua descartando o comprovante com chave desconhecida', () => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, objectKey: 'a/b.jpg' }])).toEqual([])
  })
})

describe('comprovante aceita o raio de pontualidade (spec 227 D6)', () => {
  it('aceita raio positivo e finito, sem descartar o comprovante', () => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, proofRadiusMeters: 300 }])).toEqual([
      { ...PROOF, proofRadiusMeters: 300 },
    ])
  })

  it.each([
    ['zero', 0],
    ['negativo', -1],
    ['NaN', Number.NaN],
    ['string numérica', '300'],
  ])('descarta o comprovante com proofRadiusMeters %s', (_label, proofRadiusMeters) => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, proofRadiusMeters }, PROOF])).toEqual([
      PROOF,
    ])
  })
})

describe('comprovante recusa distanceMeters que não é distância', () => {
  it('aceita distância finita e não negativa', () => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, distanceMeters: 0 }])).toHaveLength(1)
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, distanceMeters: 184.5 }])).toHaveLength(1)
  })

  it.each([
    ['NaN', Number.NaN],
    ['negativo', -1],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['string numérica', '120'],
  ])('descarta o comprovante com distanceMeters %s', (_label, distanceMeters) => {
    expect(adapters.deliveryProofsFromApi([{ ...PROOF, distanceMeters }, PROOF])).toEqual([PROOF])
  })
})

describe('o raio que a nota mostra vem do comprovante (spec 227 D6/T5.3)', () => {
  it('devolve o raio do primeiro comprovante que o trouxe', () => {
    const proofs = adapters.deliveryProofsFromApi([
      PROOF,
      { ...PROOF, id: 'p2', proofRadiusMeters: 300 },
    ])

    expect(resolveProofRadiusMeters(proofs)).toBe(300)
  })

  it('sem raio em nenhum comprovante, não há raio — nunca um número suposto', () => {
    expect(resolveProofRadiusMeters(adapters.deliveryProofsFromApi([PROOF]))).toBeUndefined()
    expect(resolveProofRadiusMeters([])).toBeUndefined()
  })
})
