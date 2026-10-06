/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF11b: a busca e os filtros-pílula da aba Tipos. Combinam por E entre grupos; dentro de
 * Momento vale qualquer um dos escolhidos, e em Exige valem todos.
 */
import { normalizeSearchText } from '@/components/ui/searchableSelect.service'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import {
  DEFAULT_OCCURRENCE_NOTE_MODE,
  DEFAULT_OCCURRENCE_SIGNATURE_MODE,
  OCCURRENCE_ATTACHMENT_MODE,
  type OccurrenceAttachmentOverrides,
  type OccurrenceType,
} from './occurrence.constant'
import {
  describeExceptionKey,
  type OccurrenceExceptionPeople,
} from './occurrenceExceptionPeople.service'
import { countExceptions, toExceptionKey } from './occurrenceException.service'
import { resolveOccurrenceMoments } from './occurrenceMoments.service'
import type { OccurrenceTypeFilters } from './occurrenceTypeFilterChips.service'
import type { OccurrenceRequirementField } from './occurrenceRequirement.constant'

/** O que a busca e o filtro "tem exceção" leem: as exceções por tipo (ausente enquanto não carregaram) e quem são. */
export type OccurrenceTypeFilterContext = Readonly<{
  exceptionsByTypeId: ReadonlyMap<string, OccurrenceAttachmentOverrides> | undefined
  people: OccurrenceExceptionPeople
}>

const TAX_ID_QUERY_PATTERN = /^[\d.\-/\s]+$/u

const REQUIREMENT_MODE_OF: Readonly<
  Record<OccurrenceRequirementField, (type: OccurrenceType) => string | undefined>
> = {
  items: (type) => type.itemsMode,
  note: (type) => type.noteMode ?? DEFAULT_OCCURRENCE_NOTE_MODE,
  photo: (type) => type.attachmentMode,
  signature: (type) => type.signatureMode ?? DEFAULT_OCCURRENCE_SIGNATURE_MODE,
}

function matchesException(
  input: Readonly<{
    context: OccurrenceTypeFilterContext
    normalizedQuery: string
    taxIdQuery: string
    type: OccurrenceType
  }>,
): boolean {
  const overrides = input.context.exceptionsByTypeId?.get(input.type.id)
  if (overrides === undefined) return false
  const keys = [...overrides.contractorOverrides, ...overrides.recipientOverrides].map(
    toExceptionKey,
  )
  return keys.some((key) => {
    const subject = describeExceptionKey(key, input.context.people)
    if (normalizeSearchText(subject.name).includes(input.normalizedQuery)) return true
    return input.taxIdQuery !== '' && normalizeTaxId(subject.taxId).includes(input.taxIdQuery)
  })
}

function matchesQuery(
  input: Readonly<{ context: OccurrenceTypeFilterContext; query: string; type: OccurrenceType }>,
): boolean {
  const trimmed = input.query.trim()
  if (trimmed === '') return true
  const normalizedQuery = normalizeSearchText(trimmed)
  if (normalizeSearchText(input.type.name).includes(normalizedQuery)) return true
  const taxIdQuery = TAX_ID_QUERY_PATTERN.test(trimmed) ? normalizeTaxId(trimmed) : ''
  return matchesException({ context: input.context, normalizedQuery, taxIdQuery, type: input.type })
}

function matchesPills(
  type: OccurrenceType,
  filters: OccurrenceTypeFilters,
  exceptionCount: number,
): boolean {
  if (filters.activity !== 'all' && type.active !== (filters.activity === 'active')) return false
  if (filters.notification !== 'all' && type.notifies !== (filters.notification === 'notifies')) {
    return false
  }
  if (filters.hasException && exceptionCount === 0) return false
  if (filters.moments.length > 0) {
    const moments = resolveOccurrenceMoments(type)
    if (!filters.moments.some((moment) => moments.includes(moment))) return false
  }
  return filters.requirements.every(
    (field) => REQUIREMENT_MODE_OF[field](type) === OCCURRENCE_ATTACHMENT_MODE.required,
  )
}

export function filterOccurrenceTypes(
  input: Readonly<{
    context: OccurrenceTypeFilterContext
    filters: OccurrenceTypeFilters
    types: readonly OccurrenceType[]
  }>,
): readonly OccurrenceType[] {
  return input.types.filter((type) => {
    const exceptionCount = countExceptions(input.context.exceptionsByTypeId?.get(type.id))
    return (
      matchesPills(type, input.filters, exceptionCount) &&
      matchesQuery({ context: input.context, query: input.filters.query, type })
    )
  })
}
