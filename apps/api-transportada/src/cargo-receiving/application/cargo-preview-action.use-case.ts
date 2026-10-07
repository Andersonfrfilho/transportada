/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9 e RF5b: o operador confirma, desvincula e vincula à mão; e a prévia propõe a
 * chegada sem criar nada — quem registra é o `POST /cargo-arrivals` de sempre.
 */
import {
  CargoPreviewDocumentAlreadyLinkedError,
  CargoPreviewDocumentNotCandidateError,
  CargoPreviewItemActionRefusedError,
  CargoPreviewItemNotFoundError,
  CargoPreviewNotFoundError,
  CargoPreviewNotReadyError,
} from '../domain/cargo-preview.error.js'
import type { CargoPreviewActionRepositoryPort } from './cargo-preview.port.js'
import type {
  CargoPreviewItemActionParams,
  CargoPreviewItemActionResult,
  ProposeCargoPreviewArrivalParams,
} from './cargo-preview-request.types.js'
import type { CargoPreviewArrivalProposal } from './cargo-preview.types.js'

type Dependencies = {
  readonly now: () => Date
  readonly repository: CargoPreviewActionRepositoryPort
}

export type CargoPreviewItemActionOutcome = {
  readonly itemIds: readonly string[]
  readonly outcome: 'changed' | 'unchanged'
}

function toOutcome(result: CargoPreviewItemActionResult): CargoPreviewItemActionOutcome {
  switch (result.kind) {
    case 'changed':
    case 'unchanged':
      return { itemIds: result.itemIds, outcome: result.kind }
    case 'preview_not_found':
      throw new CargoPreviewNotFoundError()
    case 'item_not_found':
      throw new CargoPreviewItemNotFoundError()
    case 'not_ready':
      throw new CargoPreviewNotReadyError()
    case 'document_linked_elsewhere':
      throw new CargoPreviewDocumentAlreadyLinkedError()
    case 'document_not_candidate':
      throw new CargoPreviewDocumentNotCandidateError()
    case 'refused':
      throw new CargoPreviewItemActionRefusedError(result.code)
  }
}

export function createCargoPreviewItemActionUseCase(dependencies: Dependencies): {
  readonly execute: (params: CargoPreviewItemActionParams) => Promise<CargoPreviewItemActionOutcome>
} {
  return {
    async execute({ context, ...params }) {
      return toOutcome(
        await dependencies.repository.applyItemAction({
          ...params,
          actorUserId: context.userId,
          companyId: context.companyId,
          now: dependencies.now(),
        }),
      )
    },
  }
}

export function createProposeCargoPreviewArrivalUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: ProposeCargoPreviewArrivalParams,
  ) => Promise<CargoPreviewArrivalProposal>
} {
  return {
    async execute({ context, previewId }) {
      const proposal = await dependencies.repository.proposeArrival({
        actorUserId: context.userId,
        companyId: context.companyId,
        now: dependencies.now(),
        previewId,
      })
      if (proposal === 'not_found') throw new CargoPreviewNotFoundError()
      if (proposal === 'not_ready') throw new CargoPreviewNotReadyError()
      return proposal
    },
  }
}
