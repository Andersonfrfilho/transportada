/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a níveis 2 e 3: dentro de um escopo (o grupo roteiro ↔ carga, ou o resto), as linhas
 * de cada cliente procuram nota em passadas da evidência mais forte para a mais fraca — alias
 * `Company → CNPJ`, CEP ou razão social, qualquer nota, e por fim só o valor (sugestão). Numa mesma
 * passada, nota disputada por dois clientes é ambígua para os dois (1:1); entre passadas, a mais
 * forte já levou a nota.
 */
import { compareText } from './cargo-preview-match-input.policy.js'
import type { CargoPreviewMatchEvidence } from './cargo-preview-matching.constant.js'
import type {
  LineDecision,
  MatchDocument,
  MatchLine,
  WeightCloses,
} from './cargo-preview-matching.types.js'
import { buildPartitionOptions, searchPartitions } from './cargo-preview-partition.policy.js'

export type MatchingScope = {
  readonly aliases: ReadonlyMap<string, string>
  readonly allowsDocument: (line: MatchLine, document: MatchDocument) => boolean
  readonly documents: readonly MatchDocument[]
  readonly isRouteGroup: boolean
  readonly weightCloses: WeightCloses
}

export type MatchingState = {
  readonly decisions: Map<number, LineDecision>
  readonly takenDocuments: Set<string>
}

type Pass = 'alias' | 'open' | 'reinforced' | 'value'
type Tentative = {
  readonly blockSize: number
  readonly documentIds: readonly string[]
  readonly isUnique: boolean
}

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

function candidatesFor(input: {
  cluster: readonly MatchLine[]
  pass: Pass
  scope: MatchingScope
  state: MatchingState
}) {
  const free = input.scope.documents.filter(
    (document) => !input.state.takenDocuments.has(document.id),
  )
  if (input.pass === 'open' || input.pass === 'value') return free
  if (input.pass === 'alias') {
    const code = input.cluster[0]?.recipientCode
    const taxId = code === undefined ? undefined : input.scope.aliases.get(code)
    return taxId === undefined ? [] : free.filter((document) => document.taxId === taxId)
  }
  const postalCodes = new Set(input.cluster.flatMap((line) => line.postalCode ?? []))
  const names = new Set(input.cluster.flatMap((line) => line.nameKey ?? []))
  return free.filter(
    (document) =>
      (document.postalCode !== undefined && postalCodes.has(document.postalCode)) ||
      (document.nameKey !== undefined && names.has(document.nameKey)),
  )
}

/** Por linha: a nota em que todas as partições ótimas concordam, ou as candidatas, se discordam. */
function tentativeFor(input: {
  cluster: readonly MatchLine[]
  pass: Pass
  scope: MatchingScope
  state: MatchingState
}) {
  const options = buildPartitionOptions({
    allowsDocument: input.scope.allowsDocument,
    documents: candidatesFor(input),
    lines: input.cluster,
    requireWeight: input.pass !== 'value',
    weightCloses: input.scope.weightCloses,
  })
  const search = searchPartitions({ options })
  const tentative = new Map<number, Tentative>()
  input.cluster.forEach((line, position) => {
    const lineOptions = options.flat().filter((option) => option.lines.includes(position))
    if (search.kind === 'overflow') {
      const documentIds = [...new Set(lineOptions.map((option) => option.documentId))].sort(
        compareText,
      )
      if (documentIds.length > 0)
        tentative.set(line.index, { blockSize: 1, documentIds, isUnique: false })
      return
    }
    const picks = search.solutions.map((solution) =>
      solution.find((option) => option.lines.includes(position)),
    )
    if (picks.length === 0 || picks.every((pick) => pick === undefined)) return
    const documentIds = [...new Set(picks.map((pick) => pick?.documentId ?? ''))]
      .filter((id) => id !== '')
      .sort(compareText)
    const isUnique = picks.every(
      (pick) => pick !== undefined && pick.documentId === picks[0]?.documentId,
    )
    tentative.set(line.index, { blockSize: picks[0]?.lines.length ?? 1, documentIds, isUnique })
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
  for (const cluster of clustersOf(pending)) {
    const clusterKey = String(cluster[0]?.index)
    for (const [index, tentative] of tentativeFor({ ...input, cluster })) {
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
    const unique = input.pass === 'value' ? 'suggested' : 'matched'
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
