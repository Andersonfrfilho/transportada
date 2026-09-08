/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quais praças a empresa já viu, a partir do pedágio congelado de cada viagem (spec 090 T11) —
 * nunca as 166 do catálogo (spec 095 item 4). Pura: recebe os `planned_toll` crus (um por viagem) e
 * devolve os nós de praça distintos, na ordem em que apareceram pela primeira vez.
 *
 * ⚠️ `planned_toll` é fronteira: `parseTollRouteCost` já decide o que é forma inesperada (linha
 * escrita por versão antiga, coluna editada à mão) — esta função não reabre essa decisão, só
 * agrega o que a fronteira aceitou.
 */
import { parseTollRouteCost } from './toll-route-cost-snapshot.policy.js'

export function extractSeenTollBoothNodeIds(plannedTolls: readonly unknown[]): readonly number[] {
  const seen = new Set<number>()

  for (const value of plannedTolls) {
    const toll = parseTollRouteCost(value)
    if (toll === null) continue
    for (const booth of toll.booths) seen.add(booth.osmNodeId)
  }

  return [...seen]
}
