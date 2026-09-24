/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T301 (spec 143 T013): CRUD de `contractor_contacts` dentro de `/contractors/:id`. A
 * contratante é sempre resolvida por `getContractor` primeiro — contratante de outra empresa
 * responde 404 igual a inexistente (BOLA), antes de qualquer consulta a `contractor_contacts`.
 *
 * Spec 183 T302: toda escrita passa por `resolveContractorContactWrite` — os campos antigos saem dos
 * tipos, e o aceite do WhatsApp é carimbado com o relógio daqui e o usuário do contexto. O `PATCH`
 * decide a partir do contato atual, lido dentro da contratante e da empresa.
 */
import type { ContractorContactStatus } from '../../database/contractor-mail.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  resolveContractorContactWrite,
  type ContractorContactState,
  type ContractorContactWriteRequest,
} from '../domain/contractor-contact.policy.js'
import {
  ContractorContactInvalidError,
  ContractorContactNotFoundError,
} from '../domain/contractor-mail.error.js'
import type {
  ContractorContactRecord,
  ContractorMailRepositoryPort,
} from './contractor-mail.port.js'

/** Dependência estreita: o caso de uso só toca os três métodos de contato do repositório. */
type ContactRepositoryPort = Pick<
  ContractorMailRepositoryPort,
  | 'createContractorContact'
  | 'findContractorContact'
  | 'listContractorContacts'
  | 'updateContractorContact'
>

export type ContractorContact = ContractorContactState & {
  readonly contractorId: string
  readonly email: string
  readonly id: string
  readonly status: ContractorContactStatus
}

type ContactContext = CompanyContext

type GetContractorPort = {
  readonly execute: (input: {
    readonly context: ContactContext
    readonly id: string
  }) => Promise<unknown>
}

export type ListContractorContactsUseCaseInput = {
  readonly context: ContactContext
  readonly contractorId: string
}

export type CreateContractorContactUseCaseInput = ContractorContactWriteRequest & {
  readonly context: ContactContext
  readonly contractorId: string
  readonly email: string
}

export type UpdateContractorContactUseCaseInput = ContractorContactWriteRequest & {
  readonly contactId: string
  readonly context: ContactContext
  readonly contractorId: string
  readonly email?: string
  readonly status?: ContractorContactStatus
}

export type ContractorContactsUseCase = {
  create(input: CreateContractorContactUseCaseInput): Promise<ContractorContact>
  list(input: ListContractorContactsUseCaseInput): Promise<readonly ContractorContact[]>
  update(input: UpdateContractorContactUseCaseInput): Promise<ContractorContact>
}

export function createContractorContactsUseCase(dependencies: {
  readonly getContractor: GetContractorPort
  /** O relógio do carimbo do aceite; injetado para o teste, `new Date()` em produção. */
  readonly now?: () => Date
  readonly repository: ContactRepositoryPort
}): ContractorContactsUseCase {
  const { getContractor, repository } = dependencies
  const now = dependencies.now ?? (() => new Date())

  function decide(
    context: ContactContext,
    current: ContractorContactState | null,
    request: ContractorContactWriteRequest,
  ): ContractorContactState {
    const result = resolveContractorContactWrite({
      actorUserId: context.userId,
      current,
      now: now(),
      request,
    })
    if (!result.ok) throw new ContractorContactInvalidError(result.code)
    return result.state
  }

  return {
    async list({ context, contractorId }) {
      await getContractor.execute({ context, id: contractorId })
      const contacts = await repository.listContractorContacts({
        companyId: context.companyId,
        contractorId,
      })
      return contacts.map(toContractorContact)
    },

    async create({ context, contractorId, email, ...request }) {
      await getContractor.execute({ context, id: contractorId })
      const state = decide(context, null, request)
      const contact = await repository.createContractorContact({
        ...state,
        companyId: context.companyId,
        contractorId,
        email: normalizeEmail(email),
      })
      return toContractorContact(contact)
    },

    async update({ contactId, context, contractorId, email, status, ...request }) {
      await getContractor.execute({ context, id: contractorId })
      const current = await repository.findContractorContact({
        companyId: context.companyId,
        contactId,
        contractorId,
      })
      if (current === undefined) throw new ContractorContactNotFoundError()
      const state = decide(context, current, request)
      const updated = await repository.updateContractorContact({
        ...state,
        companyId: context.companyId,
        contactId,
        contractorId,
        ...(email === undefined ? {} : { email: normalizeEmail(email) }),
        ...(status === undefined ? {} : { status }),
      })
      if (updated === undefined) throw new ContractorContactNotFoundError()
      return toContractorContact(updated)
    },
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Lista fechada: o contato nunca sai com a empresa, que é do contexto. */
export function toContractorContact(record: ContractorContactRecord): ContractorContact {
  return {
    canDecide: record.canDecide,
    contractorId: record.contractorId,
    email: record.email,
    id: record.id,
    name: record.name,
    occurrenceStages: record.occurrenceStages,
    phone: record.phone,
    preferredChannel: record.preferredChannel,
    receivesOccurrences: record.receivesOccurrences,
    roleLabel: record.roleLabel,
    status: record.status,
    types: record.types,
    whatsappOptInAt: record.whatsappOptInAt,
    whatsappOptInByUserId: record.whatsappOptInByUserId,
  }
}
