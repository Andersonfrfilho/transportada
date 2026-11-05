/* Copyright (c) 2026 Ada Technology. MIT License. */
import { LICENSE_CATEGORIES } from './fleet.types'

export type LicenseSuggestionField = 'licenseCategory' | 'licenseNumber'

/** O que a leitura do servidor achou na CNH; `null` é campo que ela não reconheceu. */
export type LicenseSuggestionFields = Readonly<Record<LicenseSuggestionField, null | string>>

export type LicenseSuggestionEntry = Readonly<{
  current: string
  field: LicenseSuggestionField
  read: string
  /**
   * `offer`: o campo da ficha está vazio, então a leitura pode ser oferecida. `diverges`: a ficha já
   * diz outra coisa — avisa, e **nunca** corrige. `matches`: confere, e não há o que fazer.
   */
  status: 'diverges' | 'matches' | 'offer'
}>

const FIELDS: readonly LicenseSuggestionField[] = ['licenseNumber', 'licenseCategory']

/** Máscara é do teclado, não do dado: comparar `012.345` com `012345` acusaria divergência à toa. */
function normalize(value: string): string {
  return value.replace(/[^0-9A-Za-z]/gu, '').toUpperCase()
}

/** Categoria que o formulário não aceita não é oferecida: a leitura por OCR erra, e o select recusaria. */
function isOfferable(field: LicenseSuggestionField, read: string): boolean {
  if (field !== 'licenseCategory') return normalize(read).length > 0
  return (LICENSE_CATEGORIES as readonly string[]).includes(normalize(read))
}

/**
 * A sugestão da CNH é **oferta**, campo a campo, nunca gravação. Três guardas, e cada uma tem contrato:
 * (1) só campo vazio da ficha recebe oferta; (2) divergência avisa e não corrige; (3) aceitar a oferta
 * só preenche o formulário — a ficha muda quando o operador salvar, como em qualquer digitação.
 */
export function planLicenseSuggestion(
  input: Readonly<{
    current: Readonly<Record<LicenseSuggestionField, string>>
    suggestion: LicenseSuggestionFields
  }>,
): readonly LicenseSuggestionEntry[] {
  const entries: LicenseSuggestionEntry[] = []
  for (const field of FIELDS) {
    const read = input.suggestion[field]
    if (read === null || normalize(read) === '') continue

    const current = input.current[field]
    if (current.trim() === '') {
      if (isOfferable(field, read)) {
        entries.push({
          current,
          field,
          read: field === 'licenseCategory' ? normalize(read) : read,
          status: 'offer',
        })
      }
      continue
    }
    entries.push({
      current,
      field,
      read,
      status: normalize(current) === normalize(read) ? 'matches' : 'diverges',
    })
  }
  return entries
}
