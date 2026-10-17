/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271: o bloco "E-mail à contratante" do tipo lê os modelos do módulo de notificação, os responsáveis da empresa e os
 * contatos das contratantes. ⚠️ `mock.module` não se desfaz e vale para o processo inteiro: o provedor dos modelos e contatos
 * é trocado **uma vez**, aqui; o dos responsáveis já é dublado por `occurrenceWatchersHarness.helper` (267). Dados sintéticos.
 */
import { mock } from 'bun:test'

import type { OccurrenceTypeMailClient } from '@/modules/occurrence-conversation/shared/occurrenceTypeMailClient.service'
import type {
  ContractorMailTemplateChoice,
  OccurrenceTypeRecipientCandidate,
} from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'
import type { OccurrenceWatcherItem } from '@/modules/occurrence-conversation/shared/occurrenceWatchers.types'

import { installOccurrenceWatchersDouble, watcherFakes } from './occurrenceWatchersHarness.helper'

export type MailChoiceFakes = {
  candidates: readonly OccurrenceTypeRecipientCandidate[]
  candidateRequests: (readonly string[])[]
  templates: readonly ContractorMailTemplateChoice[]
  watchers: readonly OccurrenceWatcherItem[]
}

export const mailChoiceFakes: MailChoiceFakes = {
  candidateRequests: [],
  candidates: [],
  templates: [],
  watchers: [],
}

const typeMailClient: OccurrenceTypeMailClient = {
  listRecipientCandidates: ({ contractorIds }) => {
    mailChoiceFakes.candidateRequests.push(contractorIds)
    return Promise.resolve(mailChoiceFakes.candidates)
  },
  listTemplates: () => Promise.resolve(mailChoiceFakes.templates),
}

void mock.module(
  '@/modules/occurrence-conversation/shared/occurrenceTypeMailClient.provider',
  () => ({
    getOccurrenceTypeMailClient: () => typeMailClient,
  }),
)
export function installMailChoiceDouble(input: Partial<MailChoiceFakes>): void {
  mailChoiceFakes.candidateRequests = []
  mailChoiceFakes.candidates = input.candidates ?? []
  mailChoiceFakes.templates = input.templates ?? []
  mailChoiceFakes.watchers = input.watchers ?? []
  /** A lista da empresa vem do duplo dos responsáveis (267), que dubla o provedor uma vez só. */
  installOccurrenceWatchersDouble()
  watcherFakes.lists = { company: { effectiveSource: null, watchers: mailChoiceFakes.watchers } }
}
