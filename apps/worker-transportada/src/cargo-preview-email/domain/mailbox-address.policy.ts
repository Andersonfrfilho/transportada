/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: um cabeçalho de remetente só vira endereço quando é EXATAMENTE uma caixa. Lista,
 * grupo, nome sem endereço ou `a@b@c` são recusados — quem lê o remetente nunca adivinha qual dos
 * endereços valia. O nome de exibição é descartado: ele pode imitar o endereço permitido.
 */
import { addressParser } from 'postal-mime'

export function readSingleMailboxAddress(value: string): string | undefined {
  const parsed = addressParser(value, { flatten: true })
  if (parsed.length !== 1) return undefined
  const address = parsed[0]?.address?.trim().toLowerCase()
  if (address === undefined || address.length === 0) return undefined
  const parts = address.split('@')
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return undefined
  return address
}
