/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './fleetGuards.validation'

const BRASIL_API_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1'
const NUMERIC_TAX_ID_PATTERN = /^[0-9]{14}$/

type LookupCompanyInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  taxId: string
}>

/**
 * O provedor público indexa o CNPJ por dígito: o alfanumérico da IN RFB 2229/2024 não tem consulta,
 * e perguntar por ele daria 404 em todo cadastro de base com letra.
 */
export function isQueryableCompanyTaxId(taxId: string): boolean {
  return NUMERIC_TAX_ID_PATTERN.test(taxId)
}

/** A razão social é o que o formulário guarda; CNPJ desconhecido devolve nada e o campo segue digitável. */
export async function lookupCompanyLegalName(input: LookupCompanyInput): Promise<null | string> {
  const response = await input.fetch(`${BRASIL_API_CNPJ_URL}/${input.taxId}`, {
    headers: { accept: 'application/json' },
    signal: input.signal,
  })
  if (!response.ok) return null
  const body = (await response.json()) as unknown
  if (!isRecord(body)) return null
  const legalName = isString(body['razao_social']) ? body['razao_social'].trim() : ''
  return legalName === '' ? null : legalName
}
