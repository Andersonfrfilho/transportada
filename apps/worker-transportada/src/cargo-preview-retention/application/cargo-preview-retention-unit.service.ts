/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewRetentionUnitResult } from '../domain/cargo-preview-retention.constant.js'
import type {
  CargoPreviewRetentionGateway,
  DeleteStoredObjectBytes,
} from './cargo-preview-retention-unit.port.js'

export async function applyCargoPreviewRetentionUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: CargoPreviewRetentionGateway
  readonly now: Date
  readonly previewId: string
}): Promise<CargoPreviewRetentionUnitResult> {
  void input
  return 'skipped'
}
