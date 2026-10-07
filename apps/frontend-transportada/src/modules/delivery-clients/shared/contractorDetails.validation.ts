/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormIssue, FormIssues } from './contractorFormIssue.types'
import {
  CONTRACTOR_WRITE_LIMITS,
  type Contractor,
  type ContractorClosingPeriod,
  type ContractorStatus,
  type ContractorWrite,
} from './contractorDirectory.types'

/** O CNPJ não está aqui de propósito: é a identidade do contratante, só leitura. */
export type ContractorDetailsDraft = Readonly<{
  closingPeriod: ContractorClosingPeriod
  displayName: string
  notes: string
  reportEmail: string
  status: ContractorStatus
}>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function createContractorDetailsDraft(contractor: Contractor): ContractorDetailsDraft {
  return {
    closingPeriod: contractor.closingPeriod,
    displayName: contractor.displayName,
    notes: contractor.notes,
    reportEmail: contractor.reportEmail,
    status: contractor.status,
  }
}

function tooLong(input: Readonly<{ max: number; value: string }>): FormIssue | undefined {
  return input.value.trim().length > input.max ? { code: 'tooLong', max: input.max } : undefined
}

function validateReportEmail(value: string): FormIssue | undefined {
  const email = value.trim()
  /** Vazio é lote que se exporta à mão — é o padrão, não erro. */
  return email === '' || EMAIL_PATTERN.test(email) ? undefined : { code: 'invalidEmail' }
}

export function validateContractorDetailsDraft(draft: ContractorDetailsDraft): FormIssues {
  const found: Record<string, FormIssue | undefined> = {
    displayName: tooLong({
      max: CONTRACTOR_WRITE_LIMITS.displayNameMaxLength,
      value: draft.displayName,
    }),
    notes: tooLong({ max: CONTRACTOR_WRITE_LIMITS.notesMaxLength, value: draft.notes }),
    reportEmail: validateReportEmail(draft.reportEmail),
  }
  return Object.fromEntries(
    Object.entries(found).flatMap(([field, issue]) =>
      issue === undefined ? [] : [[field, issue]],
    ),
  )
}

export function toContractorWrite(draft: ContractorDetailsDraft): ContractorWrite {
  return {
    closingPeriod: draft.closingPeriod,
    displayName: draft.displayName.trim(),
    notes: draft.notes.trim(),
    reportEmail: draft.reportEmail.trim(),
    status: draft.status,
  }
}
