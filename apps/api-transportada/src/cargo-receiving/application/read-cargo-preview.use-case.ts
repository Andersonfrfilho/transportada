/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: ler a prévia é `fleet.read`, sempre pela empresa do contexto — a prévia de outra
 * empresa é 404, não 403.
 */
import { CargoPreviewNotFoundError } from '../domain/cargo-preview.error.js'
import type { Page } from './cargo-arrival.types.js'
import type { CargoPreviewReadRepositoryPort } from './cargo-preview.port.js'
import type {
  GetCargoPreviewParams,
  ListCargoPreviewsParams,
} from './cargo-preview-request.types.js'
import type { CargoPreviewDetail, CargoPreviewSummary } from './cargo-preview.types.js'

type Dependencies = { readonly readRepository: CargoPreviewReadRepositoryPort }

export function createListCargoPreviewsUseCase(dependencies: Dependencies): {
  readonly execute: (params: ListCargoPreviewsParams) => Promise<Page<CargoPreviewSummary>>
} {
  return {
    execute: ({ context, filters, paging }) =>
      dependencies.readRepository.list({ companyId: context.companyId, filters, paging }),
  }
}

export function createGetCargoPreviewUseCase(dependencies: Dependencies): {
  readonly execute: (params: GetCargoPreviewParams) => Promise<CargoPreviewDetail>
} {
  return {
    async execute({ context, items, previewId }) {
      const detail = await dependencies.readRepository.findDetail({
        companyId: context.companyId,
        items,
        previewId,
      })
      if (detail === null) throw new CargoPreviewNotFoundError()
      return detail
    },
  }
}
