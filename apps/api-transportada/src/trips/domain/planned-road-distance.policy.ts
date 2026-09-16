/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 RF4/D5/D9 (absorve a 148 D2): quanto a viagem roda, quanto disso é a volta ao barracão, e
 * quanto tempo leva.
 *
 * ⚠️ **Existe como seam porque `0` e `null` são coisas diferentes, e a diferença não sobrevive a uma
 * soma escrita na linha de quem precisa.** `end_policy = 'last_stop'` é volta **zero** — o caminhão
 * fecha o dia na última entrega, e isso é medida, não lacuna. Estrada indisponível é volta
 * **desconhecida**, e um zero ali viraria combustível zero numa viagem que roda (D5: nunca zero).
 *
 * ⚠️ **A política de fim não é lida aqui.** `route-depot.policy.ts` é o único lugar do produto que
 * interpreta `end_policy`, e ele já a resolve em `trailingLegs`. Nomear a política de novo nesta
 * conta seria a segunda regra que a spec 097 existe para não ter.
 */

/**
 * A mesma forma de `RouteGeometryLeg` (`trips/application/route-geometry.port.ts`), redeclarada
 * porque domínio não importa aplicação — os dois casam por estrutura, e o campo é o mesmo.
 */
export type RoadLeg = Readonly<{ distanceMetres: number; durationSeconds: number }>

export type RoadDistanceSummary = Readonly<{
  distanceMeters: null | number
  durationSeconds: null | number
  /** Quanto dos metros acima é o retorno ao ponto de término. `0` é "não volta", `null` é "não sei". */
  returnDistanceMeters: null | number
}>

const UNKNOWN_ROAD: RoadDistanceSummary = {
  distanceMeters: null,
  durationSeconds: null,
  returnDistanceMeters: null,
}

export function summarizeRoadDistance(input: {
  readonly legs: readonly RoadLeg[]
  /** Quantos trechos do fim de `legs` são o retorno, como `planRouteFromDepot` já os conta. */
  readonly trailingLegs: number
}): RoadDistanceSummary {
  const { legs, trailingLegs } = input
  if (legs.length === 0) return UNKNOWN_ROAD

  return {
    distanceMeters: legs.reduce((total, leg) => total + leg.distanceMetres, 0),
    durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    returnDistanceMeters: returnDistanceOf({ legs, trailingLegs }),
  }
}

/**
 * ⚠️ Estrada com menos trechos do que o plano do barracão previu não casa com o pedido: a volta vira
 * desconhecida em vez de recortar o trecho errado e anunciá-lo como retorno.
 */
function returnDistanceOf(input: {
  readonly legs: readonly RoadLeg[]
  readonly trailingLegs: number
}): null | number {
  const { legs, trailingLegs } = input
  if (trailingLegs > legs.length) return null

  return legs
    .slice(legs.length - trailingLegs)
    .reduce((total, leg) => total + leg.distanceMetres, 0)
}
