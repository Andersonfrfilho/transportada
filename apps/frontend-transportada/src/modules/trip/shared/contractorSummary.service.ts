/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { isRecord, isString } from './tripGuards.validation'

/**
 * Spec 218 (T10/T11/T14): a mesma forma curta que `delivery-clients/shared/contractorContacts.types.ts`
 * já usa para o seletor de contratante do painel de contatos — reaproveitada aqui em vez de importar
 * o módulo `delivery-clients` (zero acoplamento entre módulos, `web.md` §1). Mudou lá, muda aqui.
 */
export type ContractorSummary = Readonly<{ displayName: string; id: string; taxId: string }>

const CONTRACTOR_SUMMARY_KEYS = [
  'closingPeriod',
  'displayName',
  'id',
  'notes',
  'reportEmail',
  'status',
  'taxId',
] as const

function isContractorSummary(value: unknown): value is ContractorSummary {
  if (!hasExactKeys(value, CONTRACTOR_SUMMARY_KEYS)) return false
  return isString(value.displayName) && isString(value.id) && isString(value.taxId)
}

/**
 * `GET /contractors` traz o agregado inteiro (`security.md` §8: a guarda confere a forma completa
 * mesmo que a tela só use três campos) — o resto é descartado aqui, perto da leitura.
 */
export function contractorSummariesFromApi(payload: unknown): readonly ContractorSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  if (!payload.data.every(isContractorSummary)) return []
  return payload.data.map((contractor) => ({
    displayName: contractor.displayName,
    id: contractor.id,
    taxId: contractor.taxId,
  }))
}

/** O rótulo de exibição: nome se houver, senão o CNPJ — mesmo critério de `ContractorContactsPanel`. */
export function contractorLabel(contractor: ContractorSummary): string {
  return contractor.displayName === '' ? contractor.taxId : contractor.displayName
}
