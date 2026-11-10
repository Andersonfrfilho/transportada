/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 316: o vendedor da contratante, como a API devolve (cópia por valor — o bundle não importa da API). */
export type SalespersonContractorLink = Readonly<{
  clientCount: number
  contractorId: string
  contractorName: string
}>

export type SalespersonStatus = 'active' | 'inactive'

export type Salesperson = Readonly<{
  contractors: readonly SalespersonContractorLink[]
  email: string | null
  id: string
  name: string
  status: SalespersonStatus
  whatsapp: string | null
}>

export type PortfolioClient = Readonly<{ displayName: string; taxId: string }>

export type ContractorOption = Readonly<{ displayName: string; id: string }>

/** O corpo do cadastro e da edição: o mesmo `.strict()` da API, sem empresa nem ator. */
export type SalespersonInput = Readonly<{
  email: string | null
  name: string
  status: SalespersonStatus
  whatsapp: string | null
}>

export const SALESPERSON_LIMITS = { nameMax: 120, portfolioMax: 2000 } as const

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
/** CNPJ numérico (14 dígitos) ou alfanumérico (12 caracteres + 2 dígitos), como a API aceita. */
const TAX_ID_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLink(value: unknown): value is SalespersonContractorLink {
  return (
    isRecord(value) &&
    typeof value.clientCount === 'number' &&
    typeof value.contractorId === 'string' &&
    typeof value.contractorName === 'string'
  )
}

export function isSalesperson(value: unknown): value is Salesperson {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.status === 'active' || value.status === 'inactive') &&
    (value.email === null || typeof value.email === 'string') &&
    (value.whatsapp === null || typeof value.whatsapp === 'string') &&
    Array.isArray(value.contractors) &&
    value.contractors.every(isLink)
  )
}

export function isPortfolioClient(value: unknown): value is PortfolioClient {
  return isRecord(value) && typeof value.displayName === 'string' && typeof value.taxId === 'string'
}

export function isContractorOption(value: unknown): value is ContractorOption {
  return isRecord(value) && typeof value.id === 'string' && typeof value.displayName === 'string'
}

export type SalespersonFormValues = Readonly<{
  email: string
  name: string
  status: SalespersonStatus
  whatsapp: string
}>

export type SalespersonFormError = 'contactRequired' | 'emailFormat' | 'name'

export const EMPTY_SALESPERSON_FORM: SalespersonFormValues = {
  email: '',
  name: '',
  status: 'active',
  whatsapp: '',
}

export function toFormValues(person: Salesperson): SalespersonFormValues {
  return {
    email: person.email ?? '',
    name: person.name,
    status: person.status,
    whatsapp: person.whatsapp ?? '',
  }
}

/** Valida como a API: nome de 1 a 120, e-mail bem formado e ao menos um canal (o número, a API é que lê). */
export function toInput(
  values: SalespersonFormValues,
):
  | Readonly<{ error: SalespersonFormError; ok: false }>
  | Readonly<{ input: SalespersonInput; ok: true }> {
  const name = values.name.trim()
  if (name === '' || name.length > SALESPERSON_LIMITS.nameMax) return { error: 'name', ok: false }
  const email = values.email.trim().toLowerCase()
  const whatsapp = values.whatsapp.trim()
  if (email === '' && whatsapp === '') return { error: 'contactRequired', ok: false }
  if (email !== '' && !EMAIL_PATTERN.test(email)) return { error: 'emailFormat', ok: false }

  return {
    input: {
      email: email === '' ? null : email,
      name,
      status: values.status,
      whatsapp: whatsapp === '' ? null : whatsapp,
    },
    ok: true,
  }
}

/** Um CNPJ por linha (ou separado por vírgula, ponto e vírgula, espaço), só os dígitos/letras, sem repetição. */
export function parseTaxIds(
  text: string,
): Readonly<{ invalid: readonly string[]; valid: readonly string[] }> {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.replace(/[.\-/]/g, '').toUpperCase())
    .filter((part) => part !== '')
  const unique = [...new Set(parts)]

  return {
    invalid: unique.filter((part) => !TAX_ID_PATTERN.test(part)),
    valid: unique.filter((part) => TAX_ID_PATTERN.test(part)),
  }
}
