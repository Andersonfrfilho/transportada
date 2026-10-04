/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a nível 3 (correção da revisão da Fase 4a, M6): o que a linha vira entre as partições
 * ótimas do cliente. Linhas idênticas (mesmo valor e peso) são intercambiáveis — trocá-las não é
 * outra partição, e a forma canônica as põe nos blocos pela ordem da linha. Fora disso, a linha só é
 * vínculo quando toda partição a põe na mesma nota E no mesmo bloco: a nota igual com o bloco
 * diferente é uma linha que só fecha somada a outra que ninguém sabe qual é.
 */
import { compareText } from './cargo-preview-match-input.policy.js'
import type { MatchLine } from './cargo-preview-matching.types.js'
import type { PartitionOption } from './cargo-preview-partition.policy.js'

export type Tentative = {
  readonly blockSize: number
  readonly documentIds: readonly string[]
  readonly isUnique: boolean
}

function lineClassOf(line: MatchLine | undefined): string {
  return `${String(line?.valueCents)}:${String(line?.weightGrams)}`
}

/** A forma canônica: blocos pela nota e, em cada classe de linhas idênticas, as posições na ordem. */
function canonicalize(
  lines: readonly MatchLine[],
  solution: readonly PartitionOption[],
): PartitionOption[] {
  const queues = new Map<string, number[]>()
  lines.forEach((line, position) => {
    const queue = queues.get(lineClassOf(line))
    if (queue === undefined) queues.set(lineClassOf(line), [position])
    else queue.push(position)
  })
  return [...solution]
    .sort((left, right) => compareText(left.documentId, right.documentId))
    .map((option) => ({
      documentId: option.documentId,
      lines: option.lines
        .map((position) => queues.get(lineClassOf(lines[position]))?.shift() ?? position)
        .sort((left, right) => left - right),
    }))
}

/** As partições ótimas sem as repetidas por troca de linhas idênticas. */
export function distinctSolutions(input: {
  readonly lines: readonly MatchLine[]
  readonly solutions: readonly (readonly PartitionOption[])[]
}): readonly (readonly PartitionOption[])[] {
  const distinct = new Map<string, PartitionOption[]>()
  for (const solution of input.solutions) {
    const canonical = canonicalize(input.lines, solution)
    distinct.set(JSON.stringify(canonical), canonical)
  }
  return [...distinct.values()]
}

/** Vínculo só quando toda partição ótima põe a linha na mesma nota E no mesmo bloco de linhas. */
export function tentativeFromPicks(
  picks: readonly (PartitionOption | undefined)[],
): Tentative | undefined {
  if (picks.length === 0 || picks.every((pick) => pick === undefined)) return undefined
  const documentIds = [...new Set(picks.flatMap((pick) => pick?.documentId ?? []))].sort(
    compareText,
  )
  const [first] = picks
  const block = first?.lines.join(',')
  const isUnique = picks.every(
    (pick) =>
      pick !== undefined && pick.documentId === first?.documentId && pick.lines.join(',') === block,
  )
  return { blockSize: first?.lines.length ?? 1, documentIds, isUnique }
}
