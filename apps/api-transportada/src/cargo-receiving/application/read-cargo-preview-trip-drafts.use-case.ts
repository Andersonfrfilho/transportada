/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 (RF7): ler os rascunhos de viagem da prévia é `fleet.read`, sempre pela empresa do
 * contexto — a prévia de outra empresa é 404. Não cria viagem: a recomendação só lê (ADR-0044 §5).
 */
import { CargoPreviewNotFoundError } from '../domain/cargo-preview.error.js'
import { buildCargoPreviewTripDrafts } from '../domain/cargo-preview-trip-draft.policy.js'
import type { CargoPreviewTripDrafts } from '../domain/cargo-preview-trip-draft.types.js'
import type { GetCargoPreviewTripDraftsParams } from './cargo-preview-request.types.js'
import type { CargoPreviewTripDraftRepositoryPort } from './cargo-preview.port.js'

type Dependencies = { readonly repository: CargoPreviewTripDraftRepositoryPort }

export function createGetCargoPreviewTripDraftsUseCase(dependencies: Dependencies): {
  readonly execute: (params: GetCargoPreviewTripDraftsParams) => Promise<CargoPreviewTripDrafts>
} {
  return {
    async execute({ context, previewId }) {
      const input = await dependencies.repository.findInput({
        companyId: context.companyId,
        previewId,
      })
      if (input === null) throw new CargoPreviewNotFoundError()
      return buildCargoPreviewTripDrafts(input)
    },
  }
}
