/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Contractor, ContractorStatus } from './contractorDirectory.types'
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

export function toggleContractorSort(
  input: Readonly<{ column: ContractorSortColumn; current: ContractorSort | null }>,
): ContractorSort | null {
  return input.current
}

export function applyContractorTable(
  input: Readonly<{ contractors: readonly Contractor[]; state: ContractorTableState }>,
): readonly Contractor[] {
  return input.contractors
}

export function hasContractorTableCriteria(state: ContractorTableState): boolean {
  return state !== EMPTY_CONTRACTOR_TABLE_STATE
}

export function parseContractorTableState(search: string): ContractorTableState {
  void search
  return EMPTY_CONTRACTOR_TABLE_STATE
}

export function serializeContractorTableState(
  input: Readonly<{ search: string; state: ContractorTableState }>,
): string {
  return input.search
}

export type ReceivingBadge = 'disabled' | 'enabled' | 'none'

export function resolveReceivingBadge(profile: ReceivingProfile | null): ReceivingBadge {
  void profile
  return 'none'
}
