/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.1 (RF6): a equipe separa por rota do contratante × cidade do destinatário. O grupo é
 * leitura, nunca estado gravado; a ordem é estável para a tela do celular não pular de lugar.
 */
import type { CargoArrivalDocumentState } from '../../shared/cargo-arrival.constant.js'

export type GroupableArrivalDocument = {
  readonly cityIbgeCode: string | null
  readonly nfeDocumentId: string
  readonly number: string
  readonly routeName: string | null
  readonly separationState: CargoArrivalDocumentState
}

export type ArrivalStateCounts = Readonly<Record<CargoArrivalDocumentState | 'total', number>>

export type ArrivalDocumentGroup<TDocument extends GroupableArrivalDocument> = {
  readonly cityIbgeCode: string | null
  readonly counts: ArrivalStateCounts
  readonly documents: readonly TDocument[]
  readonly routeName: string | null
}

const NUMERIC_COLLATOR = new Intl.Collator('pt-BR', { numeric: true })

export function groupArrivalDocuments<TDocument extends GroupableArrivalDocument>(
  documents: readonly TDocument[],
): readonly ArrivalDocumentGroup<TDocument>[] {
  const groups = new Map<string, TDocument[]>()
  for (const document of [...documents].sort(compareDocuments)) {
    const key = JSON.stringify([document.routeName, document.cityIbgeCode])
    const members = groups.get(key) ?? []
    members.push(document)
    groups.set(key, members)
  }
  return [...groups.values()].map((members) => toGroup(members))
}

export function countArrivalStates(
  documents: readonly Pick<GroupableArrivalDocument, 'separationState'>[],
): ArrivalStateCounts {
  const counts = { expected: 0, received: 0, separated: 0, total: documents.length }
  for (const document of documents) counts[document.separationState] += 1
  return counts
}

function toGroup<TDocument extends GroupableArrivalDocument>(
  members: readonly TDocument[],
): ArrivalDocumentGroup<TDocument> {
  const [first] = members
  return {
    cityIbgeCode: first?.cityIbgeCode ?? null,
    counts: countArrivalStates(members),
    documents: members,
    routeName: first?.routeName ?? null,
  }
}

function compareDocuments(left: GroupableArrivalDocument, right: GroupableArrivalDocument): number {
  return (
    compareNullableLast(left.routeName, right.routeName) ||
    compareNullableLast(left.cityIbgeCode, right.cityIbgeCode) ||
    NUMERIC_COLLATOR.compare(left.number, right.number) ||
    left.nfeDocumentId.localeCompare(right.nfeDocumentId)
  )
}

function compareNullableLast(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return NUMERIC_COLLATOR.compare(left, right)
}
