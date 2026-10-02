/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.1 (RF-A2, RF-A3, RNF5): do maço de notas marcadas sai o que o diálogo de conferência
 * oferece — só canhoto `pending`. O resto fica de fora **e é contado**, para a tela dizer quantas
 * notas marcadas não tinham canhoto a conferir; o botão não existe quando nada sobra (CA02, CA03).
 */
import { describe, expect, test } from 'bun:test'

import { CANHOTO_BATCH_MAX_ITEMS } from '@/modules/trip/shared/canhotoBatch.constant'
import { resolveCanhotoBatchSelection } from '@/modules/trip/shared/canhotoBatchSelection.service'
import type { TripDeliveryProof } from '@/modules/trip/shared/canhotoBatchSelection.service'
import type { DeliveryProofCanhotoReview } from '@/modules/trip/shared/deliveryProof.service'

type SelectionDocument = Parameters<typeof resolveCanhotoBatchSelection>[0]['documents'][number]

function makeDocument(id: string, overrides: Partial<SelectionDocument> = {}): SelectionDocument {
  return {
    freightCalculationId: null,
    id,
    nfeDocumentId: `nfe-${id}`,
    nfeNumber: `${id}-number`,
    nfeSeries: '1',
    releasedAt: null,
    ...overrides,
  }
}

function makeProof(
  documentId: string,
  overrides: Partial<TripDeliveryProof> & { canhotoReview?: DeliveryProofCanhotoReview } = {},
): TripDeliveryProof {
  return {
    canhotoReview: 'pending',
    createdAt: '2026-09-30T10:00:00Z',
    documentId,
    downloadUrl: `https://storage.test/original/${documentId}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id: `proof-${documentId}`,
    kind: 'photo',
    receiverName: '',
    ...overrides,
  }
}

/** Foto que não é canhoto: a view da API omite `canhotoReview` (nunca o devolve `not_applicable`). */
function makePlainPhoto(documentId: string, id: string): TripDeliveryProof {
  return {
    createdAt: '2026-09-30T10:00:00Z',
    documentId,
    downloadUrl: `https://storage.test/original/${id}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id,
    kind: 'photo',
    receiverName: '',
  }
}

const SIX_DOCUMENTS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeDocument(id))

describe('resolveCanhotoBatchSelection (spec 222 T2.1)', () => {
  test('six marked notes, four with a pending canhoto: four are offered and two are counted out (CA02)', () => {
    const result = resolveCanhotoBatchSelection({
      documents: SIX_DOCUMENTS,
      proofs: [
        makeProof('a'),
        makeProof('b'),
        makeProof('c'),
        makeProof('d'),
        makeProof('e', { canhotoReview: 'approved' }),
      ],
      selectedIds: new Set(['a', 'b', 'c', 'd', 'e', 'f']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible.map((item) => item.documentId)).toEqual(['a', 'b', 'c', 'd'])
    expect(result.excludedCount).toBe(2)
    expect(result.overflowCount).toBe(0)
  })

  test('nothing pending means nothing offered and nothing to warn about (CA03)', () => {
    const result = resolveCanhotoBatchSelection({
      documents: SIX_DOCUMENTS,
      proofs: [
        makeProof('a', { canhotoReview: 'approved' }),
        makeProof('b', { canhotoReview: 'rejected' }),
      ],
      selectedIds: new Set(['a', 'b', 'c']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible).toEqual([])
    expect(result.excludedCount).toBe(0)
  })

  test('a note without proof, a signature, a cargo photo and a photo that is not a canhoto are left out', () => {
    const result = resolveCanhotoBatchSelection({
      documents: SIX_DOCUMENTS,
      proofs: [
        makeProof('a'),
        makeProof('b', { id: 'signature-b', kind: 'signature' }),
        makeProof('c', { id: 'cargo-c', kind: 'cargo' }),
        makePlainPhoto('d', 'plain-photo-d'),
      ],
      selectedIds: new Set(['a', 'b', 'c', 'd', 'e']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible.map((item) => item.documentId)).toEqual(['a'])
    expect(result.excludedCount).toBe(4)
  })

  test('a pending canhoto of a note that was not marked is not offered', () => {
    const result = resolveCanhotoBatchSelection({
      documents: SIX_DOCUMENTS,
      proofs: [makeProof('a'), makeProof('b')],
      selectedIds: new Set(['a']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible.map((item) => item.documentId)).toEqual(['a'])
    expect(result.excludedCount).toBe(0)
  })

  test('the latest canhoto of the note decides, the way the review route picks it', () => {
    const olderPendingNewerRejected = resolveCanhotoBatchSelection({
      documents: [makeDocument('a')],
      proofs: [
        makeProof('a', { createdAt: '2026-09-30T09:00:00Z', id: 'older' }),
        makeProof('a', {
          canhotoReview: 'rejected',
          createdAt: '2026-09-30T11:00:00Z',
          id: 'newer',
        }),
      ],
      selectedIds: new Set(['a']),
      tripStatus: 'on_delivery_route',
    })
    const olderRejectedNewerPending = resolveCanhotoBatchSelection({
      documents: [makeDocument('a')],
      proofs: [
        makeProof('a', {
          canhotoReview: 'rejected',
          createdAt: '2026-09-30T09:00:00Z',
          id: 'older',
        }),
        makeProof('a', { createdAt: '2026-09-30T11:00:00Z', id: 'newer' }),
      ],
      selectedIds: new Set(['a']),
      tripStatus: 'on_delivery_route',
    })

    expect(olderPendingNewerRejected.eligible).toEqual([])
    expect(olderRejectedNewerPending.eligible.map((item) => item.proof.id)).toEqual(['newer'])
  })

  test('each item names the note by number and series and carries what the automatic reading found (RF-A4)', () => {
    const result = resolveCanhotoBatchSelection({
      documents: [makeDocument('a', { nfeNumber: '12345', nfeSeries: '2' })],
      proofs: [makeProof('a', { canhotoReadNumber: '12399', canhotoReadSource: 'barcode' })],
      selectedIds: new Set(['a']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible).toHaveLength(1)
    expect(result.eligible[0]?.label).toBe('12345/2')
    expect(result.eligible[0]?.proof.canhotoReadNumber).toBe('12399')
    expect(result.eligible[0]?.proof.canhotoReadSource).toBe('barcode')
  })

  test('a note without a number is still listed, by the identifier the label falls back to', () => {
    const result = resolveCanhotoBatchSelection({
      documents: [makeDocument('a', { nfeNumber: null, nfeSeries: null })],
      proofs: [makeProof('a')],
      selectedIds: new Set(['a']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible).toHaveLength(1)
    expect(result.eligible[0]?.label).not.toBe('')
  })

  test('a cancelled trip and a released note offer nothing', () => {
    const cancelled = resolveCanhotoBatchSelection({
      documents: [makeDocument('a')],
      proofs: [makeProof('a')],
      selectedIds: new Set(['a']),
      tripStatus: 'cancelled',
    })
    const released = resolveCanhotoBatchSelection({
      documents: [makeDocument('a', { releasedAt: '2026-09-30T08:00:00Z' }), makeDocument('b')],
      proofs: [makeProof('a'), makeProof('b')],
      selectedIds: new Set(['a', 'b']),
      tripStatus: 'on_delivery_route',
    })

    expect(cancelled.eligible).toEqual([])
    expect(cancelled.excludedCount).toBe(0)
    expect(released.eligible.map((item) => item.documentId)).toEqual(['b'])
    expect(released.excludedCount).toBe(1)
  })

  test('a selection id that is no longer in the trip is ignored, not counted', () => {
    const result = resolveCanhotoBatchSelection({
      documents: [makeDocument('a')],
      proofs: [makeProof('a')],
      selectedIds: new Set(['a', 'gone']),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible).toHaveLength(1)
    expect(result.excludedCount).toBe(0)
  })

  test('the dialog is capped, and the notes past the cap are reported as overflow, not as excluded (RNF5)', () => {
    const ids = Array.from({ length: CANHOTO_BATCH_MAX_ITEMS + 5 }, (_, index) => `n${index}`)

    const result = resolveCanhotoBatchSelection({
      documents: ids.map((id) => makeDocument(id)),
      proofs: ids.map((id) => makeProof(id)),
      selectedIds: new Set(ids),
      tripStatus: 'on_delivery_route',
    })

    expect(result.eligible).toHaveLength(CANHOTO_BATCH_MAX_ITEMS)
    expect(result.eligible.map((item) => item.documentId)).toEqual(
      ids.slice(0, CANHOTO_BATCH_MAX_ITEMS),
    )
    expect(result.overflowCount).toBe(5)
    expect(result.excludedCount).toBe(0)
  })
})
