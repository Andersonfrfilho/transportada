/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { normalizeTaxId } from '../../shared/tax-id.service.js'

const CNPJ_LENGTH = 14
const CNPJ_ROOT_LENGTH = 8
const ACCESS_KEY_ISSUER_START = 6

export function isIssuedByLinkedContractor(input: {
  readonly accessKey: string
  readonly contractorTaxId: string | undefined
  readonly isContractorActive: boolean | undefined
}): boolean {
  if (input.isContractorActive !== true || input.contractorTaxId === undefined) return false

  const contractorTaxId = normalizeTaxId(input.contractorTaxId)
  if (contractorTaxId.length !== CNPJ_LENGTH) return false

  const issuerTaxId = normalizeTaxId(input.accessKey).slice(
    ACCESS_KEY_ISSUER_START,
    ACCESS_KEY_ISSUER_START + CNPJ_LENGTH,
  )
  return issuerTaxId.slice(0, CNPJ_ROOT_LENGTH) === contractorTaxId.slice(0, CNPJ_ROOT_LENGTH)
}
