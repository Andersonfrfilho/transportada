/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parsePostalCode } from '../domain/postal-code-suggestion.policy.js'

/**
 * O segmento chega como o operador digitou, com máscara ou sem. Canonicalizar aqui é o que faz
 * `14020-210` e `14020210` serem o mesmo recurso — e CEP fora de forma morre em 400 na fronteira,
 * antes de qualquer consulta.
 */
export function parsePostalCodePathParameter(value: string): string {
  return parsePostalCode(value)
}
