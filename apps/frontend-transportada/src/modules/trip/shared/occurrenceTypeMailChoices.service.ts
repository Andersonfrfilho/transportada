/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): as opções e as regras puras dos seletores "Em cópia" e "Destinatários" do tipo. Quem já está
 * escolhido e deixou de poder receber (inativo, sem permissão, sem e-mail) continua à vista, **marcado** — sumir esconderia
 * a escolha que o servidor ainda guarda.
 */
import type { MultiSelectOption } from '@/components/ui/multi-select'
import type { OccurrenceWatcherItem } from '@/modules/occurrence-conversation/shared/occurrenceWatchers.types'
import type { OccurrenceTypeRecipientCandidate } from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'

import type {
  OccurrenceType,
  OccurrenceTypeContractor,
  OccurrenceTypeMailRecipient,
  OccurrenceTypeMailWatcher,
} from './occurrence.constant'

/** Cópia por valor do teto da API (`OCCURRENCE_WATCHER_MAX_ACTIVE`): até 10 responsáveis em cópia por tipo. */
export const OCCURRENCE_TYPE_MAIL_WATCHERS_MAX = 10

export type MailChoiceLabels = Readonly<{
  inactive: string
  notEligible: string
}>

/**
 * A lista da empresa (ativos elegíveis) mais os já escolhidos que não cabem mais nela, marcados. O inativo ou
 * inelegível da lista da empresa que **não** está escolhido não aparece: não se adiciona quem não recebe.
 */
export function buildWatcherOptions(input: {
  readonly chosen: readonly OccurrenceTypeMailWatcher[]
  readonly companyWatchers: readonly OccurrenceWatcherItem[]
  readonly labels: MailChoiceLabels
}): readonly MultiSelectOption[] {
  const chosenIds = new Set(input.chosen.map((watcher) => watcher.userId))
  const eligible = input.companyWatchers
    .filter((watcher) => watcher.status === 'active' && watcher.eligible)
    .map((watcher) => ({ label: watcher.name, value: watcher.userId }))
  const marked = input.chosen
    .filter(
      (watcher) =>
        !eligible.some((option) => option.value === watcher.userId) &&
        chosenIds.has(watcher.userId),
    )
    .map((watcher) => ({
      label: `${watcher.name === '' ? watcher.userId : watcher.name} (${
        watcher.status === 'active' ? input.labels.notEligible : input.labels.inactive
      })`,
      value: watcher.userId,
    }))
  return [...eligible, ...marked].toSorted((left, right) => left.label.localeCompare(right.label))
}

/** Escolher acima do teto é recusado antes de gravar; remover sempre passa. */
export function isWatcherSelectionAllowed(
  current: readonly string[],
  next: readonly string[],
): boolean {
  return next.length <= OCCURRENCE_TYPE_MAIL_WATCHERS_MAX || next.length <= current.length
}

/**
 * Os contatos das contratantes do tipo, agrupados pelo nome da contratante (a ordem das contratantes do tipo), mais os
 * já escolhidos que deixaram de receber ocorrências, marcados.
 */
export function buildRecipientOptions(input: {
  readonly candidates: readonly OccurrenceTypeRecipientCandidate[]
  readonly chosen: readonly OccurrenceTypeMailRecipient[]
  readonly contractors: readonly OccurrenceTypeContractor[]
  readonly labels: MailChoiceLabels
}): readonly MultiSelectOption[] {
  const nameOf = new Map(
    input.contractors.map((contractor) => [contractor.id, contractor.displayName]),
  )
  const describe = (contact: { email: string; name: string }) =>
    contact.name === '' ? contact.email : `${contact.name} · ${contact.email}`
  const options = input.contractors.flatMap((contractor) =>
    input.candidates
      .filter((candidate) => candidate.contractorId === contractor.id)
      .map((candidate) => ({
        description: contractor.displayName,
        label: describe(candidate),
        value: candidate.contactId,
      })),
  )
  const marked = input.chosen
    .filter((recipient) => !options.some((option) => option.value === recipient.contactId))
    .map((recipient) => ({
      description: nameOf.get(recipient.contractorId) ?? '',
      label: `${describe(recipient)} (${
        recipient.status === 'active' ? input.labels.notEligible : input.labels.inactive
      })`,
      value: recipient.contactId,
    }))
  return [...options, ...marked]
}

/**
 * Ao tirar contratantes do escopo (ou trocar para "Todas"), os contatos delas saem da escolha de destinatários na mesma
 * gravação: quantos saem, para o aviso do rascunho.
 */
export function countRecipientsLeavingScope(input: {
  readonly nextContractorIds: readonly string[]
  readonly nextScope: 'all' | 'listed'
  readonly recipients: readonly OccurrenceTypeMailRecipient[]
}): number {
  if (input.nextScope === 'all') return input.recipients.length
  return input.recipients.filter(
    (recipient) => !input.nextContractorIds.includes(recipient.contractorId),
  ).length
}

export function readChosenWatcherIds(type: Pick<OccurrenceType, 'contractorMailWatchers'>) {
  return (type.contractorMailWatchers ?? []).map((watcher) => watcher.userId)
}

export function readChosenRecipientIds(type: Pick<OccurrenceType, 'contractorMailRecipients'>) {
  return (type.contractorMailRecipients ?? []).map((recipient) => recipient.contactId)
}
