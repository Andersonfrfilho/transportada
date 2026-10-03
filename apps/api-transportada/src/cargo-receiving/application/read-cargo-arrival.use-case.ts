/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as leituras da chegada, sempre pela empresa do contexto. Chegada ou contratante de
 * outra empresa é 404, igual ao inexistente.
 */
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import { CargoArrivalNotFoundError } from '../domain/cargo-arrival.error.js'
import type { CargoArrivalReadRepositoryPort } from './cargo-arrival.port.js'
import type {
  GetCargoArrivalParams,
  ListAvailableArrivalDocumentsParams,
  ListCargoArrivalsParams,
} from './cargo-arrival-request.types.js'
import type {
  AvailableArrivalDocument,
  CargoArrivalDetail,
  CargoArrivalSummary,
  Page,
} from './cargo-arrival.types.js'
import { toCargoArrivalDetail, toCargoArrivalSummary } from './cargo-arrival-view.mapper.js'

type Dependencies = {
  readonly now: () => Date
  readonly readRepository: CargoArrivalReadRepositoryPort
}

export function createGetCargoArrivalUseCase(dependencies: Dependencies): {
  readonly execute: (params: GetCargoArrivalParams) => Promise<CargoArrivalDetail>
} {
  return {
    async execute({ arrivalId, context }) {
      const detail = await dependencies.readRepository.findDetail({
        arrivalId,
        companyId: context.companyId,
      })
      if (detail === null) throw new CargoArrivalNotFoundError()
      return toCargoArrivalDetail({ detail, now: dependencies.now() })
    },
  }
}

export function createListCargoArrivalsUseCase(dependencies: Dependencies): {
  readonly execute: (params: ListCargoArrivalsParams) => Promise<Page<CargoArrivalSummary>>
} {
  return {
    async execute({ context, filters, paging }) {
      const page = await dependencies.readRepository.list({
        companyId: context.companyId,
        filters,
        paging,
      })
      const now = dependencies.now()
      return {
        items: page.items.map((record) =>
          toCargoArrivalSummary({ counts: record.counts, now, record }),
        ),
        nextCursor: page.nextCursor,
      }
    },
  }
}

export function createListAvailableArrivalDocumentsUseCase(
  dependencies: Pick<Dependencies, 'readRepository'>,
): {
  readonly execute: (
    params: ListAvailableArrivalDocumentsParams,
  ) => Promise<Page<AvailableArrivalDocument>>
} {
  return {
    async execute({ context, contractorId, paging }) {
      const lookup = await dependencies.readRepository.listAvailableDocuments({
        companyId: context.companyId,
        contractorId,
        paging,
      })
      if (!lookup.isContractorFound) throw new ContractorNotFoundError()
      return lookup.page
    },
  }
}
