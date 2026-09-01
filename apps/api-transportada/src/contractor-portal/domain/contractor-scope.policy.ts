/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { normalizeTaxId } from '../../shared/tax-id.service.js'
import { ContractorNotBoundError } from './contractor-portal.error.js'

export type ContractorBinding = {
  readonly contractorId: string
  readonly taxId: string
}

/**
 * O recorte do contratante, e ele é **derivado da conta**. O tipo não tem construtor público de
 * propósito: só `resolveContractorScope` o produz, a partir do que o banco disse estar amarrado
 * àquela membership — não há caminho em que um documento vindo da requisição vire escopo.
 */
export type ContractorScope = {
  readonly contractorIds: readonly string[]
  readonly taxIds: readonly string[]
}

/**
 * ADR-0050 §2: o documento **nunca chega do cliente**. Esta função é a única fonte do escopo, e ela
 * recebe vínculo, não filtro — aceitar aqui um "documento pedido" seria a mesma classe de falha que
 * aceitar `companyId` no corpo.
 *
 * Sem vínculo é recusa, não lista vazia: ver `ContractorNotBoundError`.
 */
export function resolveContractorScope(bindings: readonly ContractorBinding[]): ContractorScope {
  const taxIds = new Set<string>()
  const contractorIds = new Set<string>()

  for (const binding of bindings) {
    const taxId = normalizeTaxId(binding.taxId)
    // Documento em branco no cadastro não vira escopo: casar com string vazia alcançaria participante
    // sem documento, que é justamente a nota de terceiro que este recorte existe para não mostrar.
    if (taxId.length === 0) continue
    taxIds.add(taxId)
    contractorIds.add(binding.contractorId)
  }

  if (taxIds.size === 0) throw new ContractorNotBoundError()

  return { contractorIds: [...contractorIds], taxIds: [...taxIds] }
}
