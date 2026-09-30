/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildProofPhotoWithThumbnail,
  PROOF_THUMBNAIL_MAX_BYTES,
  PROOF_THUMBNAIL_MAX_SIDE,
  PROOF_THUMBNAIL_START_QUALITY,
  PROOF_THUMBNAIL_TARGET_BYTES,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'

const KIB = 1024

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

const original = blobOfSize(800 * KIB)

describe('spec 220 RF17-RF19: miniatura do comprovante gerada no cliente', () => {
  it('a régua é 320 px de lado maior, qualidade 0,7, alvo de 60 KiB e teto duro de 128 KiB', () => {
    expect(PROOF_THUMBNAIL_MAX_SIDE).toBe(320)
    expect(PROOF_THUMBNAIL_START_QUALITY).toBe(0.7)
    expect(PROOF_THUMBNAIL_TARGET_BYTES).toBe(60 * KIB)
    expect(PROOF_THUMBNAIL_MAX_BYTES).toBe(128 * KIB)
    expect(PROOF_THUMBNAIL_TARGET_BYTES).toBeLessThan(PROOF_THUMBNAIL_MAX_BYTES)
  })

  it('codifica uma única vez, no lado de 320 px, e devolve a miniatura ao lado do original', async () => {
    const requestedSides: number[] = []
    const result = await buildProofPhotoWithThumbnail({
      encodeThumbnail: (maxSide) => {
        requestedSides.push(maxSide)
        return Promise.resolve(blobOfSize(60 * KIB))
      },
      original,
    })
    expect(requestedSides).toEqual([PROOF_THUMBNAIL_MAX_SIDE])
    expect(result.original).toBe(original)
    expect(result.thumbnail?.size).toBe(60 * KIB)
  })

  it('miniatura no teto de 128 KiB passa; um byte acima é descartada e o original segue', async () => {
    const atCap = await buildProofPhotoWithThumbnail({
      encodeThumbnail: () => Promise.resolve(blobOfSize(PROOF_THUMBNAIL_MAX_BYTES)),
      original,
    })
    expect(atCap.thumbnail?.size).toBe(PROOF_THUMBNAIL_MAX_BYTES)

    const overCap = await buildProofPhotoWithThumbnail({
      encodeThumbnail: () => Promise.resolve(blobOfSize(PROOF_THUMBNAIL_MAX_BYTES + 1)),
      original,
    })
    expect(overCap.original).toBe(original)
    expect(overCap.thumbnail).toBeUndefined()
  })

  it('falha ao gerar a miniatura não derruba o comprovante: sobe só o original', async () => {
    const result = await buildProofPhotoWithThumbnail({
      encodeThumbnail: () => Promise.reject(new Error('CANVAS_UNAVAILABLE')),
      original,
    })
    expect(result.original).toBe(original)
    expect(result.thumbnail).toBeUndefined()
  })
})
