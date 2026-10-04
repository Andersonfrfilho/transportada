/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a níveis 2 e 3: dentro de um escopo (o grupo roteiro ↔ carga, ou o resto), as linhas
 * de cada cliente procuram nota em passadas da evidência mais forte para a mais fraca — alias
 * `Company → CNPJ`, CEP ou razão social, qualquer nota, e por fim só o valor (sugestão). Valor e peso
 * sem reforço só são vínculo dentro de um par confirmado pelos totais; fora dele, sugestão. Numa
 * mesma passada, nota disputada por dois clientes é ambígua para os dois (1:1); entre passadas, a
 * mais forte já levou a nota.
 */
import {
  indexFreeDocuments,
  reinforcedDocuments,
  type FreeDocuments,
} from './cargo-preview-free-documents.policy.js'
import { compareText, indexByValue } from './cargo-preview-match-input.policy.js'
import type { CargoPreviewMatchEvidence } from './cargo-preview-matching.constant.js'
import type {
  LineDecision,
  MatchDocument,
  MatchingBudget,
  MatchLine,
  WeightCloses,
} from './cargo-preview-matching.types.js'
import {
  buildPartitionOptions,
  documentsCovering,
  searchPartitions,
  type PartitionOption,
} from './cargo-preview-partition.policy.js'
import {
  distinctSolutions,
  tentativeFromPicks,
  type Tentative,
} from './cargo-preview-partition-choice.policy.js'

export type MatchingScope = {
  readonly aliases: ReadonlyMap<string, string>
  readonly budget: MatchingBudget
  readonly allowsDocument: (line: MatchLine, document: MatchDocument) => boolean
  readonly documents: readonly MatchDocument[]
  /** O par do grupo fecha pelos totais (ou já foi firmado): valor e peso bastam dentro dele. */
  readonly isConfirmedGroup: boolean
  readonly isRouteGroup: boolean
  readonly weightCloses: WeightCloses
}

export type MatchingState = {
  readonly decisions: Map<number, LineDecision>
  readonly takenDocuments: Set<string>
}

type Pass = 'alias' | 'open' | 'reinforced' | 'value'

const PASSES: readonly Pass[] = ['alias', 'reinforced', 'open', 'value']

function clustersOf(lines: readonly MatchLine[]): readonly (readonly MatchLine[])[] {
  const clusters = new Map<string, MatchLine[]>()
  for (const line of lines) {
    const key = `${line.routeName}\u0000${line.recipientCode ?? `#${line.index}`}`
    const cluster = clusters.get(key)
    if (cluster === undefined) clusters.set(key, [line])
    else cluster.push(line)
  }
  return [...clusters.values()]
}

function candidatesByValue(input: {
  cluster: readonly MatchLine[]
  free: FreeDocuments
  pass: Pass
  scope: MatchingScope
}): ReadonlyMap<bigint, readonly MatchDocument[]> {
  if (input.pass === 'open' || input.pass === 'value') return input.free.byValue
  if (input.pass === 'reinforced')
    return indexByValue(reinforcedDocuments(input.cluster, input.free))
  const code = input.cluster[0]?.recipientCode
  const taxId = code === undefined ? undefined : input.scope.aliases.get(code)
  return indexByValue(taxId === undefined ? [] : (input.free.byTaxId.get(taxId) ?? []))
}

/** Por linha: a nota em que todas as partições ótimas concordam, ou as candidatas, se discordam. */
function tentativeFor(input: {
  cluster: readonly MatchLine[]
  free: FreeDocuments
  pass: Pass
  scope: MatchingScope
}) {
  const options = buildPartitionOptions({
    allowsDocument: input.scope.allowsDocument,
    byValue: candidatesByValue(input),
    lines: input.cluster,
    requireWeight: input.pass !== 'value',
    weightCloses: input.scope.weightCloses,
  })
  const search = searchPartitions({ options })
  const tentative = new Map<number, Tentative>()
  if (search.kind === 'overflow') {
    const covering = documentsCovering(options)
    input.cluster.forEach((line, position) => {
      const documentIds = [...(covering.get(position) ?? [])].sort(compareText)
      if (documentIds.length > 0)
        tentative.set(line.index, { blockSize: 1, documentIds, isUnique: false })
    })
    return tentative
  }
  const solutions = distinctSolutions({ lines: input.cluster, solutions: search.solutions })
  input.cluster.forEach((line, position) => {
    const covers = (option: PartitionOption) => option.lines.includes(position)
    const decided = tentativeFromPicks(solutions.map((solution) => solution.find(covers)))
    if (decided !== undefined) tentative.set(line.index, decided)
  })
  return tentative
}

function evidenceFor(input: {
  document: MatchDocument | undefined
  line: MatchLine
  pass: Pass
  scope: MatchingScope
  tentative: Tentative
}): ReadonlySet<CargoPreviewMatchEvidence> {
  const { document, line, tentative } = input
  const evidence = new Set<CargoPreviewMatchEvidence>(['value'])
  if (input.scope.isRouteGroup) evidence.add('route_load')
  if (input.pass === 'alias') evidence.add('recipient_alias')
  if (input.pass !== 'value') evidence.add('weight')
  if (!tentative.isUnique || document === undefined) return evidence
  if (line.postalCode !== undefined && line.postalCode === document.postalCode)
    evidence.add('postal_code')
  if (line.nameKey !== undefined && line.nameKey === document.nameKey)
    evidence.add('recipient_name')
  if (tentative.blockSize > 1) evidence.add('sum')
  return evidence
}

function runPass(input: {
  lines: readonly MatchLine[]
  pass: Pass
  scope: MatchingScope
  state: MatchingState
}): void {
  const pending = input.lines.filter((line) => !input.state.decisions.has(line.index))
  const tentatives = new Map<number, Tentative>()
  const claims = new Map<string, Set<string>>()
  const free = indexFreeDocuments({
    documents: input.scope.documents,
    takenDocuments: input.state.takenDocuments,
  })
  for (const cluster of clustersOf(pending)) {
    input.scope.budget.check()
    const clusterKey = String(cluster[0]?.index)
    for (const [index, tentative] of tentativeFor({ ...input, cluster, free })) {
      tentatives.set(index, tentative)
      for (const id of tentative.documentIds)
        claims.set(id, (claims.get(id) ?? new Set()).add(clusterKey))
    }
  }
  const byId = new Map(input.scope.documents.map((document) => [document.id, document]))
  for (const line of pending) {
    const tentative = tentatives.get(line.index)
    if (tentative === undefined) continue
    const contested = tentative.documentIds.some((id) => (claims.get(id)?.size ?? 0) > 1)
    const decided = contested ? { ...tentative, isUnique: false } : tentative
    const document = decided.isUnique ? byId.get(decided.documentIds[0] ?? '') : undefined
    const isBare = input.pass === 'open' && !input.scope.isConfirmedGroup
    const unique = input.pass === 'value' || isBare ? 'suggested' : 'matched'
    const evidence = evidenceFor({
      document,
      line,
      pass: input.pass,
      scope: input.scope,
      tentative: decided,
    })
    input.state.decisions.set(line.index, {
      documentIds: decided.documentIds,
      evidence,
      state: decided.isUnique ? unique : 'ambiguous',
    })
    for (const id of decided.documentIds) input.state.takenDocuments.add(id)
  }
}

export function matchScope(input: {
  lines: readonly MatchLine[]
  scope: MatchingScope
  state: MatchingState
}): void {
  for (const pass of PASSES) runPass({ ...input, pass })
}
