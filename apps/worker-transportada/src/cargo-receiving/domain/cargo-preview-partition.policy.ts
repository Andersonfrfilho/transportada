/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a nível 3: uma NF junta vários pedidos do mesmo cliente. As linhas de um cliente se
 * partem em blocos, cada bloco fechando UMA nota (valor exato; peso exato ou na tolerância), sem
 * nota repetida. Vale a cobertura máxima; se mais de uma partição a atinge, o que todas concordam
 * vincula e o resto é ambíguo. Busca com poda e teto de nós: estourou, é ambíguo — nunca trava.
 */
import {
  MAX_PARTITION_LINES,
  MAX_PARTITION_SEARCH_NODES,
} from './cargo-preview-matching.constant.js'
import { indexByValue } from './cargo-preview-match-input.policy.js'
import type { MatchDocument, MatchLine, WeightCloses } from './cargo-preview-matching.types.js'

/** `lines`: posições dentro do cliente; o bloco inteiro fecha `documentId`. */
export type PartitionOption = { readonly documentId: string; readonly lines: readonly number[] }

export type PartitionSearch =
  | { readonly kind: 'overflow' }
  | { readonly kind: 'solutions'; readonly solutions: readonly (readonly PartitionOption[])[] }

type SearchContext = {
  best: number
  covered: number
  readonly assignment: PartitionOption[]
  readonly decided: boolean[]
  readonly hasOption: readonly boolean[]
  readonly maxNodes: number
  nodes: number
  readonly options: readonly (readonly PartitionOption[])[]
  overflow: boolean
  solutions: PartitionOption[][]
  readonly usedDocuments: Set<string>
}

const MAX_SOLUTIONS = 64

function subsetsOf(count: number): readonly (readonly number[])[] {
  if (count > MAX_PARTITION_LINES) return Array.from({ length: count }, (_unused, index) => [index])
  const subsets: number[][] = []
  for (let mask = 1; mask < 2 ** count; mask += 1) {
    subsets.push(
      Array.from({ length: count }, (_unused, index) => index).filter(
        (index) => (mask & (2 ** index)) !== 0,
      ),
    )
  }
  return subsets
}

/** Por linha (a primeira do bloco), os blocos que fecham uma nota candidata. */
export function buildPartitionOptions(input: {
  readonly allowsDocument: (line: MatchLine, document: MatchDocument) => boolean
  readonly documents: readonly MatchDocument[]
  readonly lines: readonly MatchLine[]
  readonly requireWeight: boolean
  readonly weightCloses: WeightCloses
}): readonly (readonly PartitionOption[])[] {
  const byValue = indexByValue(input.documents)
  const options: PartitionOption[][] = input.lines.map(() => [])
  for (const subset of subsetsOf(input.lines.length)) {
    const members = subset.flatMap((position) => input.lines[position] ?? [])
    const value = members.reduce((total, line) => total + line.valueCents, 0n)
    const weight = members.reduce((total, line) => total + line.weightGrams, 0n)
    for (const document of byValue.get(value) ?? []) {
      if (input.requireWeight && !input.weightCloses(weight, document.weightGrams)) continue
      if (!members.every((line) => input.allowsDocument(line, document))) continue
      options[subset[0] ?? 0]?.push({ documentId: document.id, lines: subset })
    }
  }
  return options
}

function record(context: SearchContext): void {
  if (context.covered < context.best) return
  if (context.covered > context.best) {
    context.best = context.covered
    context.solutions = []
  }
  if (context.solutions.length >= MAX_SOLUTIONS) context.overflow = true
  else context.solutions.push([...context.assignment])
}

function upperBound(context: SearchContext, from: number): number {
  let reachable = context.covered
  for (let position = from; position < context.decided.length; position += 1) {
    if (!context.decided[position] && context.hasOption[position]) reachable += 1
  }
  return reachable
}

function setLines(context: SearchContext, option: PartitionOption, covered: boolean): void {
  for (const line of option.lines) context.decided[line] = covered
  context.covered += covered ? option.lines.length : -option.lines.length
}

function explore(context: SearchContext, from: number): void {
  context.nodes += 1
  if (context.overflow || context.nodes > context.maxNodes) {
    context.overflow = true
    return
  }
  const first = context.decided.indexOf(false, from)
  if (first < 0) return record(context)
  if (upperBound(context, first) < context.best) return
  for (const option of context.options[first] ?? []) {
    if (
      option.lines.some((line) => context.decided[line]) ||
      context.usedDocuments.has(option.documentId)
    )
      continue
    setLines(context, option, true)
    context.usedDocuments.add(option.documentId)
    context.assignment.push(option)
    explore(context, first + 1)
    context.assignment.pop()
    context.usedDocuments.delete(option.documentId)
    setLines(context, option, false)
  }
  context.decided[first] = true
  explore(context, first + 1)
  context.decided[first] = false
}

export function searchPartitions(input: {
  readonly maxNodes?: number
  readonly options: readonly (readonly PartitionOption[])[]
}): PartitionSearch {
  const { options } = input
  const context: SearchContext = {
    assignment: [],
    best: 1,
    covered: 0,
    decided: options.map(() => false),
    maxNodes: input.maxNodes ?? MAX_PARTITION_SEARCH_NODES,
    hasOption: options.map((_unused, position) =>
      options.some((list) => list.some((option) => option.lines.includes(position))),
    ),
    nodes: 0,
    options,
    overflow: false,
    solutions: [],
    usedDocuments: new Set(),
  }
  explore(context, 0)
  return context.overflow
    ? { kind: 'overflow' }
    : { kind: 'solutions', solutions: context.solutions }
}
