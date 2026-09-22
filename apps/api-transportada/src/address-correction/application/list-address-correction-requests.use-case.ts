/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AddressCorrectionRepositoryPort,
  AddressCorrectionRequest,
} from './address-correction.port.js'

export type ListAddressCorrectionRequestsUseCase = Readonly<{
  list: (input: { readonly companyId: string }) => Promise<readonly AddressCorrectionRequest[]>
}>

/** A aba cruza isto com `GET /address-report` pela `addressKey` (plan.md § Rotas). */
export function createListAddressCorrectionRequestsUseCase(dependencies: {
  readonly repository: AddressCorrectionRepositoryPort
}): ListAddressCorrectionRequestsUseCase {
  return {
    list: (input) => dependencies.repository.listByCompany(input),
  }
}
