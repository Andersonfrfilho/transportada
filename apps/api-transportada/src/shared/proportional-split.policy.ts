/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Divide `total` pelos pesos sem perder unidade: piso em cada parte e o resto inteiro para o de maior
 * peso. Determinístico no empate — o primeiro índice vence —, porque resto que muda de dono entre
 * execuções faz a mesma viagem mostrar números diferentes.
 *
 * Uma regra só para o rateio do custo por nota (spec 232) e o rateio das contas da empresa entre as
 * viagens (spec 325, ADR-0116 §6): duas cópias divergiriam no centavo sem nenhum teste perceber.
 */
export function distributeByWeight(total: bigint, weights: readonly bigint[]): bigint[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n)
  if (totalWeight === 0n || total === 0n) return weights.map(() => 0n)

  const parts = weights.map((weight) => (total * weight) / totalWeight)
  const remainder = total - parts.reduce((sum, part) => sum + part, 0n)
  if (remainder === 0n) return parts

  let heaviest = 0
  weights.forEach((weight, index) => {
    if (weight > (weights[heaviest] ?? 0n)) heaviest = index
  })
  parts[heaviest] = (parts[heaviest] ?? 0n) + remainder

  return parts
}
