/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useContractorDirectoryQuery } from '../queries/useContractorDirectory.query'
import {
  useReceivingProfileSummaries,
  type ReceivingProfileSummary,
} from '../queries/useReceivingProfile.query'
import type { Contractor } from '../shared/contractorDirectory.types'
import { applyContractorTable } from '../shared/contractorTable.service'
import { useContractorTable, type ContractorTableController } from './useContractorTable.hook'

const NO_CONTRACTORS: readonly Contractor[] = []

export type ContractorDirectoryController = Readonly<{
  errorCode: string | undefined
  isLoading: boolean
  profiles: ReadonlyMap<string, ReceivingProfileSummary>
  selectContractor: (id: string | null) => void
  selected: Contractor | undefined
  table: ContractorTableController
  total: number
  visible: readonly Contractor[]
}>

/** Lista, estado da tabela e selos do perfil juntos; o que se vê é derivado no render, nunca guardado. */
export function useContractorDirectory(): ContractorDirectoryController {
  const table = useContractorTable()
  const directory = useContractorDirectoryQuery()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const contractors = directory.data ?? NO_CONTRACTORS
  const profiles = useReceivingProfileSummaries(contractors.map((contractor) => contractor.id))

  return {
    errorCode: directory.error instanceof Error ? directory.error.message : undefined,
    isLoading: directory.isLoading,
    profiles,
    selectContractor: setSelectedId,
    selected: contractors.find((contractor) => contractor.id === selectedId),
    table,
    total: contractors.length,
    visible: applyContractorTable({ contractors, state: table.state }),
  }
}
