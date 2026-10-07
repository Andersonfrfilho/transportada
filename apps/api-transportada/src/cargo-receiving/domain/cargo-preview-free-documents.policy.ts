/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (revisão de segurança da Fase 4a, S2): as notas livres de uma passada do vínculo,
 * indexadas por CNPJ, CEP, razão social e valor. O vínculo roda sob a trava advisory do contratante,
 * e cada cliente refiltrar todas as notas livres era tempo de trava presa.
 */
import { indexByValue } from './cargo-preview-match-input.policy.js'
import type { MatchDocument, MatchLine } from './cargo-preview-matching.types.js'

/** As notas só são tomadas depois de todos os clientes da passada: o índice vale a passada inteira. */
export type FreeDocuments = {
  readonly byName: ReadonlyMap<string, readonly MatchDocument[]>
  readonly byPostalCode: ReadonlyMap<string, readonly MatchDocument[]>
  readonly byTaxId: ReadonlyMap<string, readonly MatchDocument[]>
  readonly byValue: ReadonlyMap<bigint, readonly MatchDocument[]>
  readonly positionOf: ReadonlyMap<string, number>
}

function groupDocuments(
  documents: readonly MatchDocument[],
  keyOf: (document: MatchDocument) => string | undefined,
): ReadonlyMap<string, readonly MatchDocument[]> {
  const groups = new Map<string, MatchDocument[]>()
  for (const document of documents) {
    const key = keyOf(document)
    if (key === undefined) continue
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [document])
    else group.push(document)
  }
  return groups
}

export function indexFreeDocuments(input: {
  readonly documents: readonly MatchDocument[]
  readonly takenDocuments: ReadonlySet<string>
}): FreeDocuments {
  const free = input.documents.filter((document) => !input.takenDocuments.has(document.id))
  return {
    byName: groupDocuments(free, (document) => document.nameKey),
    byPostalCode: groupDocuments(free, (document) => document.postalCode),
    byTaxId: groupDocuments(free, (document) => document.taxId),
    byValue: indexByValue(free),
    positionOf: new Map(free.map((document, position) => [document.id, position])),
  }
}

/** As notas do reforço (CEP ou razão social), na ordem das notas livres, sem repetir. */
export function reinforcedDocuments(
  cluster: readonly MatchLine[],
  free: FreeDocuments,
): readonly MatchDocument[] {
  const found = new Map<string, MatchDocument>()
  for (const line of cluster) {
    for (const document of free.byPostalCode.get(line.postalCode ?? '') ?? []) {
      found.set(document.id, document)
    }
    for (const document of free.byName.get(line.nameKey ?? '') ?? []) {
      found.set(document.id, document)
    }
  }
  const position = (document: MatchDocument): number => free.positionOf.get(document.id) ?? 0
  return [...found.values()].sort((left, right) => position(left) - position(right))
}
