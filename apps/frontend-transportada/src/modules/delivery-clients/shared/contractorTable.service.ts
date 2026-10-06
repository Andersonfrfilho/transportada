/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import {
  CONTRACTOR_STATUSES,
  type Contractor,
  type ContractorStatus,
} from './contractorDirectory.types'
import type { ReceivingProfile } from './receivingProfile.types'

export type ContractorSortColumn = 'name' | 'status' | 'taxId'
export type ContractorSortDirection = 'asc' | 'desc'
export type ContractorSort = Readonly<{
  column: ContractorSortColumn
  direction: ContractorSortDirection
}>

export type ContractorTableState = Readonly<{
  query: string
  sort: ContractorSort | null
  statuses: readonly ContractorStatus[]
}>

export const EMPTY_CONTRACTOR_TABLE_STATE: ContractorTableState = {
  query: '',
  sort: null,
  statuses: [],
}

const SORT_COLUMNS: readonly ContractorSortColumn[] = ['name', 'status', 'taxId']
const TAB_PARAMETER = 'tab'
const CONTRACTORS_TAB = 'contractors'
const STATUS_SEPARATOR = ','
const COMBINING_MARKS = /\p{M}/gu
const NON_ALPHANUMERIC = /[^a-z0-9]/gu

/** asc → desc → neutro no mesmo cabeçalho; outro cabeçalho recomeça em asc (`web.md` §7). */
export function toggleContractorSort(
  input: Readonly<{ column: ContractorSortColumn; current: ContractorSort | null }>,
): ContractorSort | null {
  if (input.current?.column !== input.column) return { column: input.column, direction: 'asc' }
  if (input.current.direction === 'asc') return { column: input.column, direction: 'desc' }
  return null
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

function matchesQuery(input: Readonly<{ contractor: Contractor; query: string }>): boolean {
  const needle = foldText(input.query.trim())
  if (needle === '') return true
  if (foldText(input.contractor.displayName).includes(needle)) return true
  const taxIdNeedle = needle.replace(NON_ALPHANUMERIC, '')
  return (
    taxIdNeedle !== '' && normalizeTaxId(input.contractor.taxId).toLowerCase().includes(taxIdNeedle)
  )
}

function readSortValue(input: Readonly<{ column: ContractorSortColumn; contractor: Contractor }>) {
  if (input.column === 'name') return input.contractor.displayName
  if (input.column === 'taxId') return input.contractor.taxId
  return input.contractor.status
}

function compareContractors(
  input: Readonly<{ left: Contractor; right: Contractor; sort: ContractorSort }>,
): number {
  const { column, direction } = input.sort
  const order = readSortValue({ column, contractor: input.left }).localeCompare(
    readSortValue({ column, contractor: input.right }),
    'pt-BR',
    { sensitivity: 'base' },
  )
  return direction === 'asc' ? order : -order
}

/** Seleção vazia é "sem filtro": esconder tudo por não ter marcado nada seria o defeito. */
export function applyContractorTable(
  input: Readonly<{ contractors: readonly Contractor[]; state: ContractorTableState }>,
): readonly Contractor[] {
  const { query, sort, statuses } = input.state
  const filtered = input.contractors.filter(
    (contractor) =>
      (statuses.length === 0 || statuses.includes(contractor.status)) &&
      matchesQuery({ contractor, query }),
  )
  if (sort === null) return filtered
  return [...filtered].sort((left, right) => compareContractors({ left, right, sort }))
}

export function hasContractorTableCriteria(state: ContractorTableState): boolean {
  return state.query.trim() !== '' || state.statuses.length > 0 || state.sort !== null
}

function isStatus(value: string): value is ContractorStatus {
  return CONTRACTOR_STATUSES.some((status) => status === value)
}

function isSortColumn(value: string | null): value is ContractorSortColumn {
  return SORT_COLUMNS.some((column) => column === value)
}

/** URL inventada não quebra a tela: valor desconhecido é ignorado, nunca recusado. */
export function parseContractorTableState(search: string): ContractorTableState {
  const parameters = new URLSearchParams(search)
  const column = parameters.get('sort')
  const statuses = (parameters.get('status') ?? '').split(STATUS_SEPARATOR).filter(isStatus)
  return {
    query: parameters.get('q') ?? '',
    sort: isSortColumn(column)
      ? { column, direction: parameters.get('dir') === 'desc' ? 'desc' : 'asc' }
      : null,
    statuses: [...new Set(statuses)],
  }
}

/** Devolve o `search` completo: o que é de outro dono (`utm`, …) fica; só os parâmetros desta lista mudam. */
export function serializeContractorTableState(
  input: Readonly<{ search: string; state: ContractorTableState }>,
): string {
  const parameters = new URLSearchParams(input.search)
  parameters.set(TAB_PARAMETER, CONTRACTORS_TAB)
  writeOptional({ name: 'q', parameters, value: input.state.query.trim() })
  writeOptional({ name: 'sort', parameters, value: input.state.sort?.column ?? '' })
  writeOptional({ name: 'dir', parameters, value: input.state.sort?.direction ?? '' })
  writeOptional({
    name: 'status',
    parameters,
    value: input.state.statuses.join(STATUS_SEPARATOR),
  })
  return `?${parameters.toString()}`
}

function writeOptional(
  input: Readonly<{ name: string; parameters: URLSearchParams; value: string }>,
): void {
  if (input.value === '') input.parameters.delete(input.name)
  else input.parameters.set(input.name, input.value)
}

export type ReceivingBadge = 'disabled' | 'enabled' | 'none'

/** Ausência é ausência (ADR-0048): sem perfil não é "desligado", é "ainda sem regra". */
export function resolveReceivingBadge(profile: ReceivingProfile | null): ReceivingBadge {
  if (profile === null) return 'none'
  return profile.isEnabled ? 'enabled' : 'disabled'
}
