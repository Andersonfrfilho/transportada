/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ContractorDeliveryNotFoundError } from '../domain/contractor-portal.error.js'
import type {
  ContractorDeliveryEvents,
  ContractorPortalRepositoryPort,
} from './contractor-portal.types.js'

/** Spec 340 D4. Chave que não é dele responde como chave que não existe (ADR-0050 §4). */
export function createReadContractorDeliveryEventsUseCase(dependencies: {
  readonly repository: ContractorPortalRepositoryPort
}): (input: {
  readonly accessKey: string
  readonly context: CompanyContext
}) => Promise<ContractorDeliveryEvents> {
  return async ({ accessKey, context }) => {
    const scope = await dependencies.repository.resolveScope({ context })
    const events = await dependencies.repository.listDeliveryEvents({ accessKey, context, scope })
    if (events === null) throw new ContractorDeliveryNotFoundError()

    return events
  }
}
