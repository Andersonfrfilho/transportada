/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  ContractorDelivery,
  ContractorPortalRepositoryPort,
} from './contractor-portal.types.js'

/**
 * Teto de leitura do portal. Cursor entra quando alguém pedir — o contratante olha a semana dele, e
 * uma página que não paginava seria pior que uma que pagina tarde.
 */
export const CONTRACTOR_DELIVERY_LIMIT = 100

export type ReadContractorDeliveriesUseCase = (input: {
  readonly context: CompanyContext
}) => Promise<readonly ContractorDelivery[]>

/**
 * ADR-0050 §4: a rota **não recebe documento**. O escopo sai da conta, e a listagem recebe o escopo
 * — não há assinatura por onde um documento pedido pelo cliente entre no caminho.
 */
export function createReadContractorDeliveriesUseCase(dependencies: {
  readonly repository: ContractorPortalRepositoryPort
}): ReadContractorDeliveriesUseCase {
  return async ({ context }) => {
    const scope = await dependencies.repository.resolveScope({ context })

    return dependencies.repository.listDeliveries({
      context,
      limit: CONTRACTOR_DELIVERY_LIMIT,
      scope,
    })
  }
}
