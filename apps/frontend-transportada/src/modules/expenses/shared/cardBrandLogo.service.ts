/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Marcas de cartão com logo em `public/card-brands/`, achadas pelo trecho do nome do tipo (sem acento nem caixa). */
const CARD_BRAND_LOGOS: readonly (readonly [string, string])[] = [
  ['santander', '/card-brands/santander.svg'],
  ['mercado pago', '/card-brands/mercado-pago.svg'],
  ['mercadopago', '/card-brands/mercado-pago.svg'],
  ['caixa', '/card-brands/caixa.svg'],
]

const DIACRITIC_PATTERN = /[̀-ͯ]/g

/** Spec 331: o logo do banco do cartão pelo nome do tipo ("Santander Unique · Visa final 8738"); sem marca conhecida, sem logo. */
export function resolveCardBrandLogo(subtypeName: string | null | undefined): string | undefined {
  if (subtypeName === null || subtypeName === undefined) return undefined
  const name = subtypeName.normalize('NFD').replace(DIACRITIC_PATTERN, '').toLowerCase()
  return CARD_BRAND_LOGOS.find(([key]) => name.includes(key))?.[1]
}
