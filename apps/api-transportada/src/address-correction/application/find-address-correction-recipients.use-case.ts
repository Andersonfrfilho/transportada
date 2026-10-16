/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão final, item de segurança B3: a T305 resolvia o `contractorId` chamando
 * `GET /contractors/by-tax-id/:taxId` — o CPF/CNPJ do emitente viajava no **caminho** da URL
 * (log de acesso, proxy, APM) e a chamada pedia `fleet.read`, permissão alheia a este fluxo. Este
 * caso de uso resolve a contratante e os contatos ativos dela numa única operação, a partir do
 * corpo do `POST` — nunca da URL — e sob a mesma `settings.manage` do resto do pedido de correção.
 */
import type { ContractorContactStatus } from '../../database/contractor-mail.schema.js'
import {
  resolveEffectiveWatchers,
  type OccurrenceWatcherCandidate,
} from '../../contractor-mail/domain/occurrence-watcher.policy.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { AddressCorrectionContractorNotFoundError } from '../domain/address-correction.error.js'
import type { AddressCorrectionContractor } from './address-correction.port.js'

export type AddressCorrectionRecipientContact = Readonly<{
  canDecide: boolean
  email: string
  id: string
  receivesOccurrences: boolean
  status: ContractorContactStatus
}>

export type AddressCorrectionRecipients = Readonly<{
  /** Spec 267 RF4: a cópia efetiva da contratante, mascarada; o operador só tira chips, nunca digita. */
  cc: readonly Readonly<{ maskedEmail: string; name: string; userId: string }>[]
  ccSource: 'company' | 'contractor' | null
  contacts: readonly AddressCorrectionRecipientContact[]
  contractor: AddressCorrectionContractor
}>

export type FindAddressCorrectionRecipientsInput = Readonly<{
  context: CompanyContext
  contractorTaxId: string
}>

export type FindAddressCorrectionRecipientsUseCase = Readonly<{
  find: (input: FindAddressCorrectionRecipientsInput) => Promise<AddressCorrectionRecipients>
}>

type ContractorLookupPort = Readonly<{
  findContractorByTaxId: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<AddressCorrectionContractor | undefined>
}>

type ListContactsPort = Readonly<{
  execute: (input: {
    readonly context: CompanyContext
    readonly contractorId: string
  }) => Promise<readonly AddressCorrectionRecipientContact[]>
}>

type WatcherCandidatesPort = Readonly<{
  loadEffectiveCandidates: (input: {
    readonly companyId: string
    readonly contractorId: string
  }) => Promise<{
    readonly company: readonly OccurrenceWatcherCandidate[]
    readonly contractor: readonly OccurrenceWatcherCandidate[]
  }>
}>

export function createFindAddressCorrectionRecipientsUseCase(dependencies: {
  readonly contractorLookup: ContractorLookupPort
  readonly listContacts: ListContactsPort
  readonly watchers: WatcherCandidatesPort
}): FindAddressCorrectionRecipientsUseCase {
  return {
    async find(input) {
      const contractor = await dependencies.contractorLookup.findContractorByTaxId({
        companyId: input.context.companyId,
        taxId: input.contractorTaxId,
      })
      if (contractor === undefined) throw new AddressCorrectionContractorNotFoundError()

      const [contacts, candidates] = await Promise.all([
        dependencies.listContacts.execute({ context: input.context, contractorId: contractor.id }),
        dependencies.watchers.loadEffectiveCandidates({
          companyId: input.context.companyId,
          contractorId: contractor.id,
        }),
      ])
      const copy = resolveEffectiveWatchers({
        companyWatchers: candidates.company,
        contractorWatchers: candidates.contractor,
        excludedUserIds: [],
        toAddresses: [],
      })

      return {
        cc: copy.copy.map((entry) => ({
          maskedEmail: maskEmailAddress(entry.address),
          name: entry.name,
          userId: entry.userId,
        })),
        ccSource: copy.source,
        contacts: contacts.filter((contact) => contact.status === 'active'),
        contractor,
      }
    },
  }
}
