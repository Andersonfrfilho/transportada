/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (T4.3): cada linha da prévia vira `matched | ambiguous | suggested | awaiting_xml`,
 * sem I/O e de forma determinística. Nível 1: roteiro ↔ carga; dentro de cada par, os níveis 2 e 3
 * (cliente, soma); o que sobra — e todo roteiro sem par — no vínculo por linha entre as notas
 * livres. A linha de um roteiro pareado só pega, fora do grupo, nota sem carga.
 */
import { pairRoutesWithLoads } from './cargo-preview-route-pairing.policy.js'
import {
  matchScope,
  type MatchingScope,
  type MatchingState,
} from './cargo-preview-cluster-matching.policy.js'
import {
  compareText,
  createWeightCloses,
  toMatchDocument,
  toMatchLine,
} from './cargo-preview-match-input.policy.js'
import { CARGO_PREVIEW_MATCH_EVIDENCE } from './cargo-preview-matching.constant.js'
import type {
  CargoPreviewItemMatch,
  CargoPreviewRoutePairing,
  MatchDocument,
  MatchLine,
  RecipientAlias,
  ResolveCargoPreviewMatchesParams,
  ResolveCargoPreviewMatchesResult,
} from './cargo-preview-matching.types.js'

function learnAliases(input: {
  documents: readonly MatchDocument[]
  knownAliases: readonly RecipientAlias[]
  lines: readonly MatchLine[]
  state: MatchingState
}): readonly RecipientAlias[] {
  const known = new Set(input.knownAliases.map((alias) => alias.recipientCode))
  const taxIdOf = new Map(input.documents.map((document) => [document.id, document.taxId]))
  const learned = new Map<string, Set<string>>()
  for (const line of input.lines) {
    const decision = input.state.decisions.get(line.index)
    const taxId = taxIdOf.get(decision?.documentIds[0] ?? '')
    if (decision?.state !== 'matched' || line.recipientCode === undefined || taxId === undefined)
      continue
    if (known.has(line.recipientCode)) continue
    learned.set(line.recipientCode, (learned.get(line.recipientCode) ?? new Set()).add(taxId))
  }
  return [...learned.entries()]
    .filter(([, taxIds]) => taxIds.size === 1)
    .map(([recipientCode, taxIds]) => ({ recipientCode, recipientTaxId: [...taxIds][0] ?? '' }))
    .sort((left, right) => compareText(left.recipientCode, right.recipientCode))
}

function toItemMatch(
  itemKey: string,
  line: MatchLine | undefined,
  state: MatchingState,
): CargoPreviewItemMatch {
  const decision = line === undefined ? undefined : state.decisions.get(line.index)
  if (decision === undefined)
    return { documentIds: [], evidence: [], itemKey, state: 'awaiting_xml' }
  return {
    documentIds: [...decision.documentIds],
    evidence: CARGO_PREVIEW_MATCH_EVIDENCE.filter((evidence) => decision.evidence.has(evidence)),
    itemKey,
    state: decision.state,
  }
}

type ScopeBase = Omit<MatchingScope, 'allowsDocument' | 'documents' | 'isRouteGroup'>

type MatchAllScopesParams = {
  readonly base: ScopeBase
  readonly documents: readonly MatchDocument[]
  readonly lines: readonly MatchLine[]
  readonly routePairs: readonly CargoPreviewRoutePairing[]
  readonly state: MatchingState
}

/** Cada par roteiro ↔ carga é um escopo; depois, o resto, onde roteiro pareado só pega nota sem carga. */
function matchAllScopes(params: MatchAllScopesParams): void {
  const { base, documents, lines, routePairs, state } = params
  for (const pair of routePairs) {
    matchScope({
      lines: lines.filter((line) => line.routeName === pair.routeName),
      scope: {
        ...base,
        allowsDocument: () => true,
        documents: documents.filter((document) => document.loadReference === pair.loadReference),
        isRouteGroup: true,
      },
      state,
    })
  }
  const pairedRoutes = new Set(routePairs.map((pair) => pair.routeName))
  const pairedLoads = new Set(routePairs.map((pair) => pair.loadReference))
  const isLoose = (document: MatchDocument): boolean =>
    document.loadReference === undefined || !pairedLoads.has(document.loadReference)
  matchScope({
    lines,
    scope: {
      ...base,
      allowsDocument: (line, document) =>
        !pairedRoutes.has(line.routeName) || document.loadReference === undefined,
      documents: documents.filter(isLoose),
      isRouteGroup: false,
    },
    state,
  })
}

export function resolveCargoPreviewMatches(
  params: ResolveCargoPreviewMatchesParams,
): ResolveCargoPreviewMatchesResult {
  const lineByPosition = params.items.map((item, index) => toMatchLine(item, index))
  const lines = lineByPosition.flatMap((line) => line ?? [])
  const documents = params.candidates.flatMap((candidate) => toMatchDocument(candidate) ?? [])
  const weightCloses = createWeightCloses(params.weightTolerancePercent)
  const routePairs = pairRoutesWithLoads({
    documents,
    knownRoutePairs: params.knownRoutePairs,
    lines,
    weightCloses,
  })
  const aliases = new Map(
    params.knownAliases.map((alias) => [alias.recipientCode, alias.recipientTaxId]),
  )
  const state: MatchingState = { decisions: new Map(), takenDocuments: new Set() }
  matchAllScopes({ base: { aliases, weightCloses }, documents, lines, routePairs, state })
  return {
    items: params.items.map((item, index) =>
      toItemMatch(item.itemKey, lineByPosition[index], state),
    ),
    learnedAliases: learnAliases({ documents, knownAliases: params.knownAliases, lines, state }),
    routePairs,
  }
}
