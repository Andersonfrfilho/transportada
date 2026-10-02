/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O card "Comprovante da entrega" com hierarquia: cabeçalho com o estado da conferência à direita,
 * peça principal grande, tira de miniaturas e metadado em grade. Aqui vive só o que é puro (qual é
 * a peça principal, qual o desfecho, qual a distância que alerta) e o que se prova por texto de
 * fonte; o DOM está em `trip-hooks/delivery-proof-card.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  formatDeliveryProofTime,
  isDeliveryProofAwayFromDeliveryEvent,
  resolveDeliveryProofOutcome,
  resolveDeliveryProofPieces,
} from '../../src/modules/trip/shared/deliveryProofCard.service'
import type {
  DeliveryProof,
  DeliveryProofKind,
  DeliveryProofView,
} from '../../src/modules/trip/shared/deliveryProof.service'

const COMPONENTS = new URL('../../src/modules/trip/components/', import.meta.url)
const STYLES = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

function makeProof(id: string, kind: DeliveryProofKind, overrides: Partial<DeliveryProof> = {}) {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: `https://storage.test/original/${id}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id,
    kind,
    receiverName: '',
    ...overrides,
  } satisfies DeliveryProof
}

function makeView(overrides: Partial<DeliveryProofView>): DeliveryProofView {
  return {
    cargoPhotos: [],
    deliveredAt: '2026-09-30T10:00:00Z',
    photos: [],
    receiverName: null,
    signatures: [],
    state: 'delivered-with-proof',
    ...overrides,
  }
}

describe('as peças do comprovante (card com hierarquia)', () => {
  it('o canhoto é a peça principal; mercadoria e assinatura vão para a tira', () => {
    const { main, others } = resolveDeliveryProofPieces(
      makeView({
        cargoPhotos: [makeProof('cargo-1', 'cargo')],
        photos: [makeProof('photo-1', 'photo')],
        signatures: [makeProof('signature-1', 'signature')],
      }),
    )

    expect(main?.proof.id).toBe('photo-1')
    expect(main?.labelKey).toBe('deliveryProof.pieceLabel.photo')
    expect(others.map((piece) => piece.proof.id)).toEqual(['signature-1', 'cargo-1'])
  })

  it('só assinatura, sem canhoto: a assinatura é a principal e a tira fica vazia', () => {
    const { main, others } = resolveDeliveryProofPieces(
      makeView({ signatures: [makeProof('signature-1', 'signature')] }),
    )

    expect(main?.labelKey).toBe('deliveryProof.pieceLabel.signature')
    expect(others).toEqual([])
  })

  it('sem peça nenhuma não há principal nem tira', () => {
    expect(resolveDeliveryProofPieces(makeView({ state: 'delivered-without-proof' }))).toEqual({
      main: undefined,
      others: [],
    })
  })

  it('mais de uma foto do mesmo tipo: as demais viram miniatura, nenhuma some', () => {
    const { main, others } = resolveDeliveryProofPieces(
      makeView({
        photos: [makeProof('photo-1', 'photo'), makeProof('photo-2', 'photo')],
      }),
    )

    expect(main?.proof.id).toBe('photo-1')
    expect(others.map((piece) => piece.proof.id)).toEqual(['photo-2'])
  })
})

describe('o desfecho da conferência (cabeçalho do card)', () => {
  it('traduz o veredito para os três estados do chip', () => {
    const pending = makeProof('p', 'photo', { canhotoReview: 'pending' })
    const approved = makeProof('p', 'photo', { canhotoReview: 'approved' })
    const rejected = makeProof('p', 'photo', { canhotoReview: 'rejected' })

    expect(resolveDeliveryProofOutcome(pending)).toBe('pending')
    expect(resolveDeliveryProofOutcome(approved)).toBe('approved')
    expect(resolveDeliveryProofOutcome(rejected)).toBe('rejected')
  })

  it('sem veredito (assinatura, comprovante antigo) não há chip', () => {
    expect(resolveDeliveryProofOutcome(makeProof('p', 'signature'))).toBeUndefined()
  })
})

describe('distância que alerta', () => {
  it('só a pontualidade "longe da baixa" acende o alerta — o front não inventa limite', () => {
    expect(
      isDeliveryProofAwayFromDeliveryEvent(makeProof('p', 'photo', { punctuality: 'away' })),
    ).toBe(true)
    expect(
      isDeliveryProofAwayFromDeliveryEvent(
        makeProof('p', 'photo', { punctuality: 'late_and_away' }),
      ),
    ).toBe(true)
    expect(
      isDeliveryProofAwayFromDeliveryEvent(makeProof('p', 'photo', { punctuality: 'late' })),
    ).toBe(false)
    expect(
      isDeliveryProofAwayFromDeliveryEvent(makeProof('p', 'photo', { punctuality: 'on_time' })),
    ).toBe(false)
    expect(
      isDeliveryProofAwayFromDeliveryEvent(makeProof('p', 'photo', { distanceMeters: 90000 })),
    ).toBe(false)
  })
})

describe('hora do prazo da conferência', () => {
  it('escreve só hora e minuto, com dois dígitos', () => {
    expect(formatDeliveryProofTime({ locale: 'pt-BR', value: '2026-09-30T10:05:00' })).toBe('10:05')
  })

  it('valor que não é data volta como veio, em vez de "Invalid Date"', () => {
    expect(formatDeliveryProofTime({ locale: 'pt-BR', value: 'ontem' })).toBe('ontem')
  })
})

describe('textos do card, nos dois idiomas', () => {
  const NEW_KEYS = [
    'pieceLabel',
    'reviewStatus',
    'readings',
    'pendingSince',
    'piecesLabel',
  ] as const

  it('cada texto novo existe em português e em inglês', () => {
    for (const key of NEW_KEYS) {
      expect(trip.deliveryProof[key]).toBeDefined()
      expect(tripEn.deliveryProof[key]).toBeDefined()
    }
    expect(trip.deliveryProof.pieceLabel.photo).toBe('Canhoto assinado')
    expect(trip.deliveryProof.reviewStatus.pending).toBe('Aguardando conferência')
    expect(trip.deliveryProof.reviewStatus.approved).toBe('Aprovado')
    expect(trip.deliveryProof.reviewStatus.rejected).toBe('Recusado')
    expect(trip.deliveryProof.pendingSince).toInclude('{{time}}')
  })
})

describe('o card por texto de fonte', () => {
  const card = readFileSync(new URL('TripDeliveryProof.component.tsx', COMPONENTS), 'utf8')
  const styles = readFileSync(STYLES, 'utf8')

  it('o estado da conferência mora no cabeçalho, ao lado do título', () => {
    const header = /<header[^>]*>([\s\S]*?)<\/header>/u.exec(card)?.[1] ?? ''

    expect(header).toInclude('deliveryProof.title')
    expect(header).toInclude('<ProofReviewChip')
  })

  it('o rodapé de ação é separado por régua e carrega o prazo e os botões', () => {
    const footer = /<footer[^>]*>([\s\S]*?)<\/footer>/u.exec(card)?.[1] ?? ''

    expect(footer).toInclude('<ProofReviewDeadline')
    expect(footer).toInclude('<ProofReviewActions')
    expect(/\.proofCardFooter\s*\{([^}]*)\}/u.exec(styles)?.[1]).toMatch(/border-top:/u)
  })

  it('não inventa mapa: nenhuma coordenada nem mapa no card', () => {
    for (const file of ['TripDeliveryProof', 'ProofReadings', 'ProofImage', 'ProofPieces']) {
      const source = readFileSync(new URL(`${file}.component.tsx`, COMPONENTS), 'utf8')

      expect(source).not.toMatch(/latitude|longitude|<Map|maplibre/iu)
    }
  })

  it('sem estilo inline em nenhuma peça do card', () => {
    for (const file of [
      'TripDeliveryProof',
      'ProofReadings',
      'ProofImage',
      'ProofPieces',
      'ProofReview',
    ]) {
      const source = readFileSync(new URL(`${file}.component.tsx`, COMPONENTS), 'utf8')

      expect(source).not.toMatch(/style=\{/u)
    }
  })

  it('toda miniatura da tira tem o lado declarado em token, e a tira rola no celular', () => {
    expect(/\.proofThumbnailButton\s*\{([^}]*)\}/u.exec(styles)?.[1]).toMatch(
      /inline-size:\s*var\(--proof-thumbnail-size\)/u,
    )
    expect(/\.proofStrip\s*\{([^}]*)\}/u.exec(styles)?.[1]).toMatch(/overflow-x:\s*auto/u)
  })
})
