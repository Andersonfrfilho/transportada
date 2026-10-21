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

export type OccurrenceWatcherSource = 'company' | 'contractor' | 'occurrence_type'

export type EffectiveWatchers<TSource extends OccurrenceWatcherSource = OccurrenceWatcherSource> =
  Readonly<{
    copy: readonly OccurrenceWatcherCopy[]
    droppedCount: number
    source: TSource | null
  }>

export type ResolveEffectiveWatchersParams = Readonly<{
  companyWatchers: readonly OccurrenceWatcherCandidate[]
  contractorWatchers: readonly OccurrenceWatcherCandidate[]
  excludedUserIds: readonly string[]
  toAddresses: readonly string[]
  /** Spec 271 (D11): a lista do tipo de ocorrência, com o `status` da linha da **empresa**; ausente é a correção de endereço. */
  typeWatchers?: readonly OccurrenceWatcherCandidate[]
}>

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

function selectSource(params: ResolveEffectiveWatchersParams): {
  readonly active: readonly OccurrenceWatcherCandidate[]
  readonly source: OccurrenceWatcherSource | null
} {
  const typeActive = (params.typeWatchers ?? []).filter((entry) => entry.status === 'active')
  if (typeActive.length > 0) return { active: typeActive, source: 'occurrence_type' }
  const contractorActive = params.contractorWatchers.filter((entry) => entry.status === 'active')
  if (contractorActive.length > 0) return { active: contractorActive, source: 'contractor' }
  const companyActive = params.companyWatchers.filter((entry) => entry.status === 'active')
  if (companyActive.length > 0) return { active: companyActive, source: 'company' }
  return { active: [], source: null }
}

/**
 * Lista do tipo (271) com algum ativo vence a da contratante, que vence a da empresa; sem ativo herda. O operador só
 * remove, nunca adiciona.
 */
export function resolveEffectiveWatchers(
  params: ResolveEffectiveWatchersParams & { readonly typeWatchers?: undefined },
): EffectiveWatchers<'company' | 'contractor'>
export function resolveEffectiveWatchers(params: ResolveEffectiveWatchersParams): EffectiveWatchers
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
