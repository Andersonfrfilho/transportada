/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * 539 é "duplicidade de CT-e com diferença na chave de acesso": o par CNPJ + modelo + série +
 * número já pertence a outro documento autorizado. O número não foi pulado, foi usado — avançar
 * é reconciliação com o que a SEFAZ já tem, não quebra de sequência, e por isso não gera
 * pendência de inutilização.
 */
const BURNED_FISCAL_NUMBER_CODE = '539'

/**
 * Teto de sondas por item. Cada sonda é uma emissão a mais no webservice da SEFAZ, então o limite
 * protege dos dois lados: não martela o serviço e não queima numeração indefinidamente quando a
 * causa real for outra.
 */
export const CTE_FISCAL_NUMBER_PROBE_LIMIT = 5

export type CteRejectionDisposition = 'advance_fiscal_number' | 'terminal'

export function isFiscalNumberRejection(code: string): boolean {
  return code === BURNED_FISCAL_NUMBER_CODE
}

export function classifyCteRejection(input: {
  readonly code: string
  readonly probesMade: number
}): CteRejectionDisposition {
  if (!isFiscalNumberRejection(input.code)) return 'terminal'
  if (input.probesMade >= CTE_FISCAL_NUMBER_PROBE_LIMIT) return 'terminal'

  return 'advance_fiscal_number'
}
