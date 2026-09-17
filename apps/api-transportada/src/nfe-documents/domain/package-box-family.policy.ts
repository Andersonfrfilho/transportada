/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Prefixo com menos tokens é categoria + tamanho, sem marca: `AZEITE 500ML` junta garrafa PET com
 * garrafa de vidro. Medido sobre as caixas de produção, esse piso derruba só essa família.
 */
export const MINIMUM_FAMILY_PREFIX_TOKENS = 3

/** Guloso de propósito: cortar no primeiro dígito juntaria `REFR TANG 18G PACK 15` com o sachê avulso. */
const FAMILY_PREFIX_PATTERN = /^.*[0-9][^ ]*/

const PACKAGING_UNIT_COUNT_PATTERN = /([0-9]+)$/

export type ResolveBoxFamilyParams = {
  readonly commercialUnit: string
  readonly description: string
}

export type PackageBoxFamily = {
  /** `undefined` quando a caixa não tem com quem replicar: sem rótulo ou com prefixo genérico. */
  readonly familyKey: string | undefined
  readonly prefix: string
  readonly variantLabel: string
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function buildFamilyKey(input: {
  readonly commercialUnit: string
  readonly prefix: string
  readonly variantLabel: string
}): string | undefined {
  if (input.variantLabel === '') return undefined
  if (input.prefix.split(' ').length < MINIMUM_FAMILY_PREFIX_TOKENS) return undefined
  return `${input.prefix}|${input.commercialUnit}`
}

export function resolveBoxFamily(params: ResolveBoxFamilyParams): PackageBoxFamily {
  const description = normalize(params.description)
  const commercialUnit = normalize(params.commercialUnit)
  const prefix = FAMILY_PREFIX_PATTERN.exec(description)?.[0] ?? description
  const variantLabel = description.slice(prefix.length).trim()

  return {
    familyKey: buildFamilyKey({ commercialUnit, prefix, variantLabel }),
    prefix,
    variantLabel,
  }
}

/** A unidade comercial carrega a contagem no sufixo (`CX36`, `FR12`) — é o que o conferente confere. */
export function resolvePackagingUnitCount(commercialUnit: string): number | undefined {
  const digits = PACKAGING_UNIT_COUNT_PATTERN.exec(normalize(commercialUnit))?.[1] ?? ''
  const count = Number.parseInt(digits, 10)

  return Number.isSafeInteger(count) && count > 0 ? count : undefined
}
