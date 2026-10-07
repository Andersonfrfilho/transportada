/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF11b: o estado das pílulas da aba Tipos e o que cada pílula liga e desliga.
 */
import { OCCURRENCE_MOMENTS, type OccurrenceMoment } from './occurrence.constant'
import {
  OCCURRENCE_REQUIREMENT_FIELDS,
  type OccurrenceRequirementField,
} from './occurrenceRequirement.constant'

export type OccurrenceTypeFilters = Readonly<{
  activity: 'active' | 'all' | 'inactive'
  hasException: boolean
  moments: readonly OccurrenceMoment[]
  notification: 'all' | 'notifies' | 'silent'
  query: string
  requirements: readonly OccurrenceRequirementField[]
}>

export const EMPTY_OCCURRENCE_TYPE_FILTERS: OccurrenceTypeFilters = {
  activity: 'all',
  hasException: false,
  moments: [],
  notification: 'all',
  query: '',
  requirements: [],
}

export type OccurrenceTypeFilterChipId =
  | 'activity:active'
  | 'activity:inactive'
  | 'exception:has'
  | 'notification:notifies'
  | 'notification:silent'
  | `moment:${OccurrenceMoment}`
  | `requirement:${OccurrenceRequirementField}`

export const OCCURRENCE_TYPE_FILTER_CHIP_GROUPS: readonly (readonly OccurrenceTypeFilterChipId[])[] =
  [
    OCCURRENCE_MOMENTS.map((moment) => `moment:${moment}` as const),
    OCCURRENCE_REQUIREMENT_FIELDS.map((field) => `requirement:${field}` as const),
    [
      'activity:active',
      'activity:inactive',
      'notification:notifies',
      'notification:silent',
      'exception:has',
    ],
  ]

function toggleItem<TItem>(items: readonly TItem[], item: TItem): readonly TItem[] {
  return items.includes(item) ? items.filter((candidate) => candidate !== item) : [...items, item]
}

export function toggleOccurrenceTypeFilterChip(
  filters: OccurrenceTypeFilters,
  chipId: OccurrenceTypeFilterChipId,
): OccurrenceTypeFilters {
  if (chipId === 'exception:has') return { ...filters, hasException: !filters.hasException }
  if (chipId === 'activity:active' || chipId === 'activity:inactive') {
    const activity = chipId === 'activity:active' ? 'active' : 'inactive'
    return { ...filters, activity: filters.activity === activity ? 'all' : activity }
  }
  if (chipId === 'notification:notifies' || chipId === 'notification:silent') {
    const notification = chipId === 'notification:notifies' ? 'notifies' : 'silent'
    return {
      ...filters,
      notification: filters.notification === notification ? 'all' : notification,
    }
  }
  const [group, value = ''] = chipId.split(':')
  if (group === 'moment') {
    return { ...filters, moments: toggleItem(filters.moments, value as OccurrenceMoment) }
  }
  return {
    ...filters,
    requirements: toggleItem(filters.requirements, value as OccurrenceRequirementField),
  }
}

export function isOccurrenceTypeFilterChipPressed(
  filters: OccurrenceTypeFilters,
  chipId: OccurrenceTypeFilterChipId,
): boolean {
  if (chipId === 'exception:has') return filters.hasException
  if (chipId === 'activity:active') return filters.activity === 'active'
  if (chipId === 'activity:inactive') return filters.activity === 'inactive'
  if (chipId === 'notification:notifies') return filters.notification === 'notifies'
  if (chipId === 'notification:silent') return filters.notification === 'silent'
  const [group, value = ''] = chipId.split(':')
  if (group === 'moment') return filters.moments.includes(value as OccurrenceMoment)
  return filters.requirements.includes(value as OccurrenceRequirementField)
}

export function countActiveOccurrenceTypeFilters(filters: OccurrenceTypeFilters): number {
  return [
    filters.query.trim() === '' ? 0 : 1,
    filters.moments.length,
    filters.requirements.length,
    filters.activity === 'all' ? 0 : 1,
    filters.notification === 'all' ? 0 : 1,
    filters.hasException ? 1 : 0,
  ].reduce((total, part) => total + part, 0)
}
