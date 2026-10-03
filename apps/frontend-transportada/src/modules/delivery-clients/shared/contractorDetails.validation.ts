/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormIssues } from './contractorFormIssue.types'
import type {
  Contractor,
  ContractorClosingPeriod,
  ContractorStatus,
  ContractorWrite,
} from './contractorDirectory.types'

export type ContractorDetailsDraft = Readonly<{
  closingPeriod: ContractorClosingPeriod
  displayName: string
  notes: string
  reportEmail: string
  status: ContractorStatus
}>

export function createContractorDetailsDraft(contractor: Contractor): ContractorDetailsDraft {
  throw new Error(`NOT_IMPLEMENTED:${contractor.id}`)
}

export function validateContractorDetailsDraft(draft: ContractorDetailsDraft): FormIssues {
  void draft
  return {}
}

export function toContractorWrite(draft: ContractorDetailsDraft): ContractorWrite {
  void draft
  return {}
}
