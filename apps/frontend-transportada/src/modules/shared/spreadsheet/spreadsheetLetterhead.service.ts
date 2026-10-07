/** Copyright (c) 2026 Ada Technology. MIT License. */
import { formatCnpj } from '../taxId.service'

/** O que o timbre diz da empresa; campo que o cadastro não tem fica de fora, nunca "undefined". */
export type LetterheadCompany = Readonly<{
  address: string
  name: string
  phone: string
  taxId: string
}>

export type LetterheadLabels = Readonly<{
  phone: string
  taxId: string
}>

const PUBLIC_SETTINGS_PATH = '/public/landing-settings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function joinParts(parts: readonly string[], separator: string): string {
  return parts.filter((part) => part !== '').join(separator)
}

function composeAddress(unit: Record<string, unknown>): string {
  const street = joinParts([readText(unit.street), readText(unit.number)], ', ')
  const streetWithComplement = joinParts([street, readText(unit.complement)], ' — ')
  const place = joinParts([readText(unit.city), readText(unit.state)], '/')
  return joinParts(
    [streetWithComplement, readText(unit.district), place, readText(unit.postalCode)],
    ' · ',
  )
}

/**
 * Os dados da própria transportada, da mesma rota pública que a tela de entrar já usa — a primeira
 * unidade é a própria (ADR-0021). Falha e ausência dão o mesmo: timbre só com o nome.
 */
export async function readLetterheadCompany(
  input: Readonly<{ apiUrl: string; fallbackName: string; fetch: typeof globalThis.fetch }>,
): Promise<LetterheadCompany> {
  const empty: LetterheadCompany = { address: '', name: input.fallbackName, phone: '', taxId: '' }
  try {
    const response = await input.fetch(`${input.apiUrl}${PUBLIC_SETTINGS_PATH}`)
    if (!response.ok) return empty
    const payload: unknown = await response.json()
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined
    const units: unknown = data?.units
    const own: unknown = Array.isArray(units) ? units[0] : undefined
    if (!isRecord(own)) return { ...empty, name: readText(data?.brandName) || input.fallbackName }

    const cnpj = readText(own.cnpj)
    return {
      address: composeAddress(own),
      name: readText(data?.brandName) || readText(own.tradeName) || input.fallbackName,
      phone: readText(own.phone),
      taxId: cnpj === '' ? '' : formatCnpj(cnpj),
    }
  } catch {
    return empty
  }
}

/** As linhas abaixo do nome: CNPJ e telefone, endereço, e quando e por quem saiu o arquivo. */
export function composeLetterheadInfoLines(
  input: Readonly<{
    company: LetterheadCompany
    exportedOn: string
    exportedBy: string
    labels: LetterheadLabels
  }>,
): readonly string[] {
  const { company, labels } = input
  return [
    joinParts(
      [
        company.taxId === '' ? '' : `${labels.taxId} ${company.taxId}`,
        company.phone === '' ? '' : `${labels.phone} ${company.phone}`,
      ],
      '  ·  ',
    ),
    company.address,
    joinParts([input.exportedOn, input.exportedBy], '  ·  '),
  ].filter((line) => line !== '')
}
