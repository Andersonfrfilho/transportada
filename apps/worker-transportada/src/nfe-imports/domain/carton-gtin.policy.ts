/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const GS1_LENGTHS = new Set([8, 12, 13, 14])

/**
 * O código de barras da caixa, como o leitor da API vai procurá-lo.
 *
 * ⚠️ `cEAN` vence `cEANTrib`, e o segundo só entra quando o primeiro está **ausente**: a chave da
 * caixa é `uCom`, e o `cEAN` é o GTIN da unidade comercial — a mesma embalagem. O `cEANTrib` é o da
 * unidade tributável, que costuma ser a lata dentro da caixa; um `cEAN` presente e inválido não cai
 * para ele, porque isso trocaria um código sujo pelo código de outra embalagem.
 */
export function resolveCartonGtin(input: {
  readonly gtin?: string | undefined
  readonly taxableUnitGtin?: string | undefined
}): string | null {
  if (input.gtin !== undefined) return normalizeCartonGtin(input.gtin)
  return normalizeCartonGtin(input.taxableUnitGtin)
}

/**
 * ⚠️ O pacote fiscal entrega só dígitos no tamanho do GS1, mas **não** confere o dígito
 * verificador — e código com dígito errado casaria com o produto de outro emitente. Inválido é
 * nulo. O DUN-14 é reduzido ao GTIN-13 pela mesma régua que a API aplica à etiqueta bipada.
 */
export function normalizeCartonGtin(code: string | undefined): string | null {
  const digits = (code ?? '').trim()
  if (!/^[0-9]+$/.test(digits) || !GS1_LENGTHS.has(digits.length)) return null
  if (/^0+$/.test(digits)) return null

  const base = digits.slice(0, -1)
  if (computeCheckDigit(base) !== Number(digits.slice(-1))) return null
  return reduceToGtin13(digits)
}

/** Cópia por valor de `package-box-queue.policy.ts` da API — contrato de paridade no worker. */
function reduceToGtin13(scanned: string): string | null {
  const digits = scanned.trim()
  if (!/^[0-9]+$/.test(digits)) return null
  if (digits.length === 8 || digits.length === 12 || digits.length === 13) return digits
  if (digits.length !== 14) return null

  const base = digits.slice(1, 13)
  return `${base}${computeCheckDigit(base)}`
}

/** Dígito verificador do GS1: soma ponderada 3/1 da direita para a esquerda, complemento de dez. */
function computeCheckDigit(base: string): number {
  let sum = 0
  for (let index = base.length - 1; index >= 0; index -= 1) {
    const digit = Number(base[index])
    sum += (base.length - index) % 2 === 1 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}
