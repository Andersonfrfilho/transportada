/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import { contractorLabel, type ContractorSummary } from './contractorSummary.service'
import type { OccurrenceAttachmentOverrides } from './occurrence.constant'
import type { OccurrenceExceptionKey } from './occurrenceException.service'

export type OccurrenceExceptionLoadStatus = 'error' | 'loading' | 'ready'

export type RecipientSummary = Readonly<{ displayName: string; taxId: string }>

/** Quem pode receber exceção: os contratantes e os clientes cadastrados, nunca um texto digitado (RF1f). */
export type OccurrenceExceptionPeople = Readonly<{
  contractors: readonly ContractorSummary[]
  /** A lista bateu no teto de páginas: pode haver contratante fora dela. */
  contractorsTruncated: boolean
  contractorsStatus: OccurrenceExceptionLoadStatus
  recipients: readonly RecipientSummary[]
  recipientsStatus: OccurrenceExceptionLoadStatus
  recipientsTruncated: boolean
}>

/** O que cada tipo recebe da tela: as suas exceções (da consulta em lote), o estado da leitura e quem pode ser escolhido. */
export type OccurrenceTypeExceptionsState = Readonly<{
  overrides: OccurrenceAttachmentOverrides | undefined
  people: OccurrenceExceptionPeople
  status: OccurrenceExceptionLoadStatus
}>

export type OccurrenceExceptionSubject = Readonly<{ name: string; taxId: string }>

function labelOf(subject: OccurrenceExceptionSubject): string {
  if (subject.taxId === '') return subject.name
  const taxId = formatTaxId(subject.taxId)
  return subject.name === '' ? taxId : `${subject.name} · ${taxId}`
}

/** Exceção de cliente que já saiu do cadastro continua legível: sem nome, o CNPJ formatado diz quem é. */
export function describeExceptionKey(
  key: OccurrenceExceptionKey,
  people: OccurrenceExceptionPeople,
): OccurrenceExceptionSubject {
  if (key.kind === 'contractor') {
    const contractor = people.contractors.find((candidate) => candidate.id === key.contractorId)
    if (contractor === undefined) return { name: key.contractorId, taxId: '' }
    return { name: contractor.displayName, taxId: contractor.taxId }
  }
  const recipient = people.recipients.find(
    (candidate) => normalizeTaxId(candidate.taxId) === key.taxId,
  )
  return { name: recipient?.displayName ?? '', taxId: key.taxId }
}

export function formatExceptionSubject(subject: OccurrenceExceptionSubject): string {
  return labelOf(subject)
}

/** Quem já tem exceção neste tipo não repete na lista de escolha. */
export function buildExceptionClientOptions(
  input: Readonly<{
    kind: OccurrenceExceptionKey['kind']
    people: OccurrenceExceptionPeople
    usedValues: readonly string[]
  }>,
): readonly SearchableSelectOption[] {
  if (input.kind === 'contractor') {
    return input.people.contractors
      .filter((contractor) => !input.usedValues.includes(contractor.id))
      .map((contractor) => ({
        label: labelOf({ name: contractorLabel(contractor), taxId: contractor.taxId }),
        value: contractor.id,
      }))
  }
  return input.people.recipients
    .filter((recipient) => !input.usedValues.includes(normalizeTaxId(recipient.taxId)))
    .map((recipient) => ({
      label: labelOf({ name: recipient.displayName, taxId: recipient.taxId }),
      value: normalizeTaxId(recipient.taxId),
    }))
}
