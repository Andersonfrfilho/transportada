/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Contractor, ContractorPage, ContractorWrite } from './contractorDirectory.types'
import type { ContractorDirectoryDependencies } from './contractorDirectoryRequest.service'
import type { ReceivingProfile, ReceivingProfileRules } from './receivingProfile.types'

export type ContractorDirectoryClient = Readonly<{
  getReceivingProfile: (contractorId: string) => Promise<ReceivingProfile | null>
  listContractors: (input: Readonly<{ cursor: string | null }>) => Promise<ContractorPage>
  saveReceivingProfile: (
    input: Readonly<{ contractorId: string; rules: ReceivingProfileRules }>,
  ) => Promise<ReceivingProfile>
  updateContractor: (
    input: Readonly<{ id: string; values: ContractorWrite }>,
  ) => Promise<Contractor>
}>

export function createContractorDirectoryClient(
  dependencies: ContractorDirectoryDependencies,
): ContractorDirectoryClient {
  void dependencies
  const notImplemented = (): Promise<never> => Promise.reject(new Error('NOT_IMPLEMENTED'))
  return {
    getReceivingProfile: notImplemented,
    listContractors: notImplemented,
    saveReceivingProfile: notImplemented,
    updateContractor: notImplemented,
  }
}
