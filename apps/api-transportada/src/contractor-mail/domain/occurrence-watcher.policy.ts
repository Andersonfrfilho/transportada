/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceWatcherStatus } from './occurrence-watcher.constant.js'

/** `address` fica `undefined` quando o usuário perdeu vínculo, permissão ou e-mail: não pode receber cópia. */
export type OccurrenceWatcherCandidate = Readonly<{
  address: string | undefined
  name: string
  status: OccurrenceWatcherStatus
  userId: string
}>

export type OccurrenceWatcherCopy = Readonly<{ address: string; name: string; userId: string }>

export type EffectiveWatchers = Readonly<{
  copy: readonly OccurrenceWatcherCopy[]
  droppedCount: number
  source: 'company' | 'contractor' | null
}>

export type ResolveEffectiveWatchersParams = Readonly<{
  companyWatchers: readonly OccurrenceWatcherCandidate[]
  contractorWatchers: readonly OccurrenceWatcherCandidate[]
  excludedUserIds: readonly string[]
  toAddresses: readonly string[]
}>

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

function selectSource(params: ResolveEffectiveWatchersParams): {
  readonly active: readonly OccurrenceWatcherCandidate[]
  readonly source: EffectiveWatchers['source']
} {
  const contractorActive = params.contractorWatchers.filter((entry) => entry.status === 'active')
  if (contractorActive.length > 0) return { active: contractorActive, source: 'contractor' }
  const companyActive = params.companyWatchers.filter((entry) => entry.status === 'active')
  if (companyActive.length > 0) return { active: companyActive, source: 'company' }
  return { active: [], source: null }
}

/** Lista da contratante com algum ativo vence a da empresa; sem ativo herda. O operador só remove, nunca adiciona. */
export function resolveEffectiveWatchers(
  params: ResolveEffectiveWatchersParams,
): EffectiveWatchers {
  const { active, source } = selectSource(params)
  const excluded = new Set(params.excludedUserIds)
  const taken = new Set(params.toAddresses.map(normalizeAddress))
  const sorted = [...active].sort(
    (left, right) => left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId),
  )
  const copy: OccurrenceWatcherCopy[] = []
  let droppedCount = 0
  for (const entry of sorted) {
    if (excluded.has(entry.userId)) continue
    const address = entry.address === undefined ? '' : normalizeAddress(entry.address)
    if (address === '') {
      droppedCount += 1
      continue
    }
    if (taken.has(address)) continue
    taken.add(address)
    copy.push({ address, name: entry.name, userId: entry.userId })
  }
  return { copy, droppedCount, source }
}
