/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 268: a ficha da contratante monta os contatos de ocorrência e a aba de e-mail lê a configuração e se o modelo do módulo de notificação serve.
 * ⚠️ `mock.module` não se desfaz e vale para o processo inteiro: os dois clientes são trocados **uma vez**, aqui, e
 * cada teste só reconfigura os `*Fakes`. O módulo de verdade é espalhado por baixo para que os erros e as constantes
 * que a tela importa continuem existindo. Dados sintéticos.
 */
import { mock } from 'bun:test'

import * as actualContacts from '@/modules/delivery-clients/shared/contractorContactsClient.service'
import * as actualSettings from '@/modules/delivery-clients/shared/contractorMailSettingsClient.service'
import type { ContractorContactsClient } from '@/modules/delivery-clients/shared/contractorContactsClient.service'
import type {
  ContractorContact,
  ContractorSummary,
} from '@/modules/delivery-clients/shared/contractorContacts.types'
import type { ContractorMailSettingsClient } from '@/modules/delivery-clients/shared/contractorMailSettingsClient.service'
import type {
  ContractorMailSettingsRead,
  ContractorMailSettingsSummary,
} from '@/modules/delivery-clients/shared/contractorMailSettings.types'

/** Mesmo valor de `ALFA_CONTRACTOR_ID` do harness do diretório, que importa este arquivo. */
const ALFA_CONTRACTOR_ID = '00000000-0000-4000-8000-000000237a01'

export const VERIFIED_SETTINGS: ContractorMailSettingsSummary = {
  apiKeyConfigured: true,
  id: 'settings-1',
  lastWebhookAt: null,
  replyDomain: 'resposta.example.test',
  senderAddress: 'ocorrencias@example.test',
  senderName: 'Transportadora Sintética',
  sendingVerifiedAt: '2026-09-01T00:00:00.000Z',
  status: 'active',
  version: '1',
  webhookId: 'webhook-1',
  webhookSecretConfigured: true,
}

export const ALFA_CONTACT: ContractorContact = {
  canDecide: false,
  contractorId: ALFA_CONTRACTOR_ID,
  email: 'compras@alfa.example.test',
  id: 'contact-alfa-1',
  name: 'Compras Alfa',
  occurrenceStages: ['separation', 'delivery', 'stop'],
  phone: null,
  preferredChannel: 'email',
  receivesOccurrences: true,
  roleLabel: 'Compras',
  status: 'active',
  types: ['occurrences'],
  whatsappOptInAt: null,
  whatsappOptInByUserId: null,
}

export const mailFakes: {
  contacts: ContractorContact[]
  read: ContractorMailSettingsRead
  /** Spec 286: o módulo de notificação tem um modelo utilizável para o e-mail de correção. */
  templateUsable: boolean
} = {
  contacts: [],
  read: { sandboxDelivery: false, summary: null },
  templateUsable: true,
}

export type MailDoubleCalls = {
  readonly contactLists: string[]
  readonly contactUpdates: { body: unknown; contactId: string }[]
  readonly contactCreates: { body: unknown; contractorId: string }[]
  readonly contractorListCalls: { count: number }
}

const CONTRACTOR_SUMMARIES: readonly ContractorSummary[] = [
  { displayName: 'Alfa Indústria Fictícia', id: ALFA_CONTRACTOR_ID, taxId: '11222333000181' },
]

const contactsClient: { current: ContractorContactsClient } = {
  current: undefined as unknown as ContractorContactsClient,
}
const settingsClient: { current: ContractorMailSettingsClient } = {
  current: undefined as unknown as ContractorMailSettingsClient,
}

/** Instala os dois clientes dublados e devolve o registro do que a tela chamou. */
export function installContractorMailDouble(
  initial: Partial<typeof mailFakes> = {},
): MailDoubleCalls {
  mailFakes.contacts = initial.contacts ?? []
  mailFakes.read = initial.read ?? { sandboxDelivery: false, summary: null }
  mailFakes.templateUsable = initial.templateUsable ?? true
  const calls: MailDoubleCalls = {
    contactCreates: [],
    contactLists: [],
    contactUpdates: [],
    contractorListCalls: { count: 0 },
  }
  contactsClient.current = {
    createContact: (input) => {
      calls.contactCreates.push(structuredClone(input))
      const created: ContractorContact = {
        ...ALFA_CONTACT,
        ...input.body,
        contractorId: input.contractorId,
        id: `contact-new-${calls.contactCreates.length}`,
        status: 'active',
        whatsappOptInAt: null,
        whatsappOptInByUserId: null,
      }
      mailFakes.contacts = [...mailFakes.contacts, created]
      return Promise.resolve(created)
    },
    listContacts: (contractorId) => {
      calls.contactLists.push(contractorId)
      return Promise.resolve(
        mailFakes.contacts.filter((contact) => contact.contractorId === contractorId),
      )
    },
    listContractors: () => {
      calls.contractorListCalls.count += 1
      return Promise.resolve(CONTRACTOR_SUMMARIES)
    },
    updateContact: (input) => {
      calls.contactUpdates.push(structuredClone({ body: input.body, contactId: input.contactId }))
      const current = mailFakes.contacts.find((contact) => contact.id === input.contactId)
      if (current === undefined) return Promise.reject(new Error('CONTACT_NOT_FOUND'))
      const updated = { ...current, ...input.body } as ContractorContact
      mailFakes.contacts = mailFakes.contacts.map((contact) =>
        contact.id === input.contactId ? updated : contact,
      )
      return Promise.resolve(updated)
    },
  }
  settingsClient.current = {
    getChecks: () => Promise.resolve([]),
    getSettings: () => Promise.resolve(mailFakes.read),
    isAddressCorrectionTemplateUsable: () => Promise.resolve(mailFakes.templateUsable),
    saveSettings: () => Promise.reject(new Error('NOT_USED_BY_THIS_CONTRACT')),
    sendTestEmail: () => Promise.reject(new Error('NOT_USED_BY_THIS_CONTRACT')),
  }
  return calls
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para o falso. */
void mock.module('@/modules/delivery-clients/shared/contractorContactsClient.service', () => ({
  ...actualContacts,
  getContractorContactsClient: () => contactsClient.current,
}))
void mock.module('@/modules/delivery-clients/shared/contractorMailSettingsClient.service', () => ({
  ...actualSettings,
  getContractorMailSettingsClient: () => settingsClient.current,
}))
