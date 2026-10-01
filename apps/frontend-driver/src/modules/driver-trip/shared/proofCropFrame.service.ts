/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CropBounds } from './proofCrop.service'

export const INITIAL_CROP_MARGIN_RATIO = 0.08

export function resolveInitialCropBounds(input: {
  readonly detected: CropBounds | null
  readonly height: number
  readonly width: number
}): CropBounds {
  if (input.detected !== null) return input.detected
  const marginX = Math.round(input.width * INITIAL_CROP_MARGIN_RATIO)
  const marginY = Math.round(input.height * INITIAL_CROP_MARGIN_RATIO)
  return {
    bottom: input.height - marginY,
    left: marginX,
    right: input.width - marginX,
    top: marginY,
  }
}
