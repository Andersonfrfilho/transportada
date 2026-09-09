/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 107: **a sobra da roteirização** — o que não entrou em viagem nenhuma, e por quê.
 *
 * ⚠️ Sugestão que devolve quarenta paradas e cala sobre doze é pior que sugestão nenhuma: ela
 * **parece completa**. O operador aceita, e descobre a carga esquecida no dia seguinte.
 */
/**
 * ⚠️ A forma mínima de que a regra precisa, e **não** `RouteSuggestionStop`: quem chama é o
 * adaptador do módulo `trip`, que lê o corpo cru da API. Exigir o tipo completo do `routing` o
 * obrigaria a construir campos que ele não usa só para satisfazer a assinatura.
 */
export type CoverableSuggestionStop = Readonly<{
  excludedFromOptimization: boolean
  label: string
  nfeDocumentIds: readonly string[]
  vehicleId: string | null
}>

/**
 * Por que a parada ficou de fora. São causas com ações diferentes, e juntá-las num "não coube"
 * mandaria o operador procurar no lugar errado.
 */
export const LEFTOVER_REASON = {
  /** Coordenada em precisão de município: a ADR-0044 §5 a tira do problema antes da matriz. */
  imprecise: 'imprecise_location',
  /** Nenhum motorista ofertado cobre a região dela (spec 106). */
  notCovered: 'not_covered',
} as const

export type LeftoverReason = (typeof LEFTOVER_REASON)[keyof typeof LEFTOVER_REASON]

export type LeftoverStop = Readonly<{
  excludedFromOptimization: boolean
  label: string
  nfeDocumentIds: readonly string[]
  reason: LeftoverReason
}>

/**
 * ⚠️ A parada sem veículo é a sobra, e a **razão** separa as duas causas: a excluída por precisão
 * vem marcada da própria sugestão; o resto sobrou por cobertura, que é a única outra forma de uma
 * parada não ter dono depois da spec 106.
 */
export function resolveLeftoverStops(
  stops: readonly CoverableSuggestionStop[],
): readonly LeftoverStop[] {
  return stops
    .filter((stop) => stop.vehicleId === null)
    .map((stop) => ({
      excludedFromOptimization: stop.excludedFromOptimization,
      label: stop.label,
      nfeDocumentIds: stop.nfeDocumentIds,
      reason: stop.excludedFromOptimization
        ? LEFTOVER_REASON.imprecise
        : LEFTOVER_REASON.notCovered,
    }))
}

/**
 * O resumo que a frase imprime. ⚠️ Ele **não substitui** a lista: "56 notas" sem quais manda o
 * operador procurar numa tela de 345 — que é exatamente o passo em que ele errou o filtro e
 * despachou 345 achando que eram 21 (spec 103).
 */
/**
 * As notas de toda a sobra, sem repetição — o que o botão de continuação devolve à seleção.
 *
 * ⚠️ Só as paradas **sem cobertura**: a excluída por endereço impreciso não fica melhor numa segunda
 * montagem, e reoferecê-la faria o operador repetir o mesmo pedido esperando resultado diferente.
 */
export function collectRetryableDocumentIds(leftovers: readonly LeftoverStop[]): readonly string[] {
  return [
    ...new Set(
      leftovers
        .filter((stop) => stop.reason === LEFTOVER_REASON.notCovered)
        .flatMap((stop) => stop.nfeDocumentIds),
    ),
  ]
}

export function countLeftoverByReason(
  leftovers: readonly LeftoverStop[],
): ReadonlyMap<LeftoverReason, number> {
  const byReason = new Map<LeftoverReason, number>()
  for (const leftover of leftovers) {
    byReason.set(leftover.reason, (byReason.get(leftover.reason) ?? 0) + 1)
  }

  return byReason
}
