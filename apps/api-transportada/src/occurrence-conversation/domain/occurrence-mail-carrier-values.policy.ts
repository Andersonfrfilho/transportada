/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §5, D5/D16): as variáveis de texto da transportadora e da contratante. Pura; o escape é do
 * renderer, que escapa todo valor de texto.
 */
import type { CarrierIdentity } from '../application/occurrence-mail.port.js'
import {
  CNPJ_PATTERN,
  CPF_PATTERN,
  formatCnpjForDisplay,
  normalizeTaxId,
} from '../../shared/tax-id.service.js'

export type CarrierMailValues = {
  readonly cidadeTransportadora: string
  readonly cnpjContratante: string
  readonly cnpjTransportadora: string
  readonly nomeExibicao: string
  readonly razaoSocialTransportadora: string
}

/**
 * Onze dígitos: CPF `000.000.000-00`; CNPJ (inclusive o alfanumérico): a máscara por posição; qualquer outra coisa,
 * vazio — documento truncado impresso parece documento real. Guarda de conjunto, nunca de comprimento.
 */
export function formatContractorTaxId(taxId: null | string): string {
  const normalized = normalizeTaxId(taxId ?? '')
  if (CNPJ_PATTERN.test(normalized)) return formatCnpjForDisplay(normalized)
  if (CPF_PATTERN.test(normalized)) {
    return `${normalized.slice(0, 3)}.${normalized.slice(3, 6)}.${normalized.slice(6, 9)}-${normalized.slice(9)}`
  }
  return ''
}

export function buildOccurrenceMailIdentityValues(params: {
  readonly carrier: CarrierIdentity
  readonly contractorTaxId: null | string
}): CarrierMailValues {
  const { carrier } = params
  return {
    cidadeTransportadora: [carrier.city, carrier.state]
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join(' · '),
    cnpjContratante: formatContractorTaxId(params.contractorTaxId),
    cnpjTransportadora: formatCnpjForDisplay(carrier.cnpj),
    nomeExibicao: carrier.displayName,
    razaoSocialTransportadora: carrier.legalName,
  }
}
