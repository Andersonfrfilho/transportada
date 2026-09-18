/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetDriverListItem } from './fleet.types'

/**
 * Spec 157 RF11, ADR-0068 §7: o seletor de motoristas da viagem ordena por nota — da maior para a
 * menor, `null` (sem histórico) sempre por último, e empate pelo nome. Pura e testável sem tela: a
 * ordenação não filtra ninguém, só ordena — a regra é "ordena, não filtra" (ADR-0068 §7).
 */
export function sortDriversByScore(
  drivers: readonly FleetDriverListItem[],
): readonly FleetDriverListItem[] {
  return [...drivers].sort((a, b) => {
    if (a.score === null && b.score === null) return a.name.localeCompare(b.name, 'pt-BR')
    if (a.score === null) return 1
    if (b.score === null) return -1
    if (a.score !== b.score) return b.score - a.score
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
