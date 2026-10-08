/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  PROOF_IMAGE_MAX_HEIGHT_CM,
  PROOF_IMAGE_MIN_HEIGHT_CM,
  paginateProofBlocks,
  resolveProofImageHeightCm,
  shouldRotateProofImage,
} from '../../src/trips/domain/trip-proof-page.layout.js'

describe('trip-proof-page.layout (spec 253 T2.4)', () => {
  it('declares the 5 to 7 cm image band', () => {
    expect(PROOF_IMAGE_MIN_HEIGHT_CM).toBe(5)
    expect(PROOF_IMAGE_MAX_HEIGHT_CM).toBe(7)
  })

  it('clamps the image height by proportion and never leaves the band', () => {
    expect(resolveProofImageHeightCm({ heightPx: 2000, widthPx: 3000 })).toBe(7)
    expect(resolveProofImageHeightCm({ heightPx: 1000, widthPx: 4000 })).toBe(5)
    const within = resolveProofImageHeightCm({ heightPx: 1000, widthPx: 3000 })
    expect(within).toBeGreaterThanOrEqual(5)
    expect(within).toBeLessThanOrEqual(7)
    expect(within).toBeCloseTo(6, 5)
  })

  it('treats a vertical photo as horizontal after the 90 degree rotation', () => {
    expect(shouldRotateProofImage({ heightPx: 2000, widthPx: 1000 })).toBe(true)
    expect(shouldRotateProofImage({ heightPx: 1000, widthPx: 2000 })).toBe(false)
    expect(shouldRotateProofImage({ heightPx: 1000, widthPx: 1000 })).toBe(false)
    expect(resolveProofImageHeightCm({ heightPx: 2000, widthPx: 1000 })).toBe(7)
    expect(resolveProofImageHeightCm({ heightPx: 1000, widthPx: 2000 })).toBe(7)
  })

  it('stacks two 7 cm blocks per page', () => {
    const layout = paginateProofBlocks([7, 7, 7, 7, 7])
    expect(layout.pageCount).toBe(3)
    expect(layout.placements.map((placement) => placement.pageNumber)).toEqual([1, 1, 2, 2, 3])
  })

  it('stacks three 5 cm blocks per page', () => {
    const layout = paginateProofBlocks([5, 5, 5, 5])
    expect(layout.placements.map((placement) => placement.pageNumber)).toEqual([1, 1, 1, 2])
    expect(layout.pageCount).toBe(2)
  })

  it('never cuts a block: the one that does not fit opens the next page', () => {
    const layout = paginateProofBlocks([7, 7, 5])
    expect(layout.placements.map((placement) => placement.pageNumber)).toEqual([1, 1, 2])
    expect(layout.placements[2]?.topCm).toBe(0)
    for (const placement of layout.placements) {
      expect(placement.topCm + placement.blockHeightCm).toBeLessThanOrEqual(24.7 + 1e-9)
    }
  })

  it('places each block below the previous one with info strip and gap', () => {
    const layout = paginateProofBlocks([7, 5])
    expect(layout.placements[0]?.topCm).toBe(0)
    expect(layout.placements[0]?.imageTopCm).toBeCloseTo(1.6, 5)
    expect(layout.placements[1]?.topCm).toBeCloseTo(9, 5)
  })

  it('has one page even with no blocks', () => {
    expect(paginateProofBlocks([]).pageCount).toBe(1)
  })
})
