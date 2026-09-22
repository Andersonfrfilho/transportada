/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T301 (spec 143 T013): CRUD de `contractor_contacts` dentro de `/contractors/:id`. A
 * contratante é sempre resolvida por `getContractor` primeiro — contratante de outra empresa
 * responde 404 igual a inexistente (BOLA), antes de qualquer consulta a `contractor_contacts`.
 */
import type { ContractorContactStatus } from '../../database/contractor-mail.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ContractorContactNotFoundError } from '../domain/contractor-mail.error.js'
import type {
  ContractorContactRecord,
  ContractorMailRepositoryPort,
} from './contractor-mail.port.js'

/** Dependência estreita: o caso de uso só toca os três métodos de contato do repositório. */
type ContactRepositoryPort = Pick<
  ContractorMailRepositoryPort,
  'createContractorContact' | 'listContractorContacts' | 'updateContractorContact'
>

export type ContractorContact = {
  readonly canDecide: boolean
  readonly contractorId: string
  readonly email: string
  readonly id: string
  readonly receivesOccurrences: boolean
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

export type CreateContractorContactUseCaseInput = {
  readonly canDecide: boolean
  readonly context: ContactContext
  readonly contractorId: string
  readonly email: string
  readonly receivesOccurrences: boolean
}

export type UpdateContractorContactUseCaseInput = {
  readonly canDecide?: boolean
  readonly contactId: string
  readonly context: ContactContext
  readonly contractorId: string
  readonly email?: string
  readonly receivesOccurrences?: boolean
  readonly status?: ContractorContactStatus
}

export type ContractorContactsUseCase = {
  create(input: CreateContractorContactUseCaseInput): Promise<ContractorContact>
  list(input: ListContractorContactsUseCaseInput): Promise<readonly ContractorContact[]>
  update(input: UpdateContractorContactUseCaseInput): Promise<ContractorContact>
}

export function createContractorContactsUseCase(dependencies: {
  readonly getContractor: GetContractorPort
  readonly repository: ContactRepositoryPort
}): ContractorContactsUseCase {
  const { getContractor, repository } = dependencies

  return {
    async list({ context, contractorId }) {
      await getContractor.execute({ context, id: contractorId })
      const contacts = await repository.listContractorContacts({
        companyId: context.companyId,
        contractorId,
      })
      return contacts.map(toContact)
    },

    async create({ canDecide, context, contractorId, email, receivesOccurrences }) {
      await getContractor.execute({ context, id: contractorId })
      const contact = await repository.createContractorContact({
        canDecide,
        companyId: context.companyId,
        contractorId,
        email: normalizeEmail(email),
        receivesOccurrences,
      })
      return toContact(contact)
    },

    async update({
      canDecide,
      contactId,
      context,
      contractorId,
      email,
      receivesOccurrences,
      status,
    }) {
      await getContractor.execute({ context, id: contractorId })
      const updated = await repository.updateContractorContact({
        ...(canDecide === undefined ? {} : { canDecide }),
        companyId: context.companyId,
        contactId,
        contractorId,
        ...(email === undefined ? {} : { email: normalizeEmail(email) }),
        ...(receivesOccurrences === undefined ? {} : { receivesOccurrences }),
        ...(status === undefined ? {} : { status }),
      })
      if (updated === undefined) throw new ContractorContactNotFoundError()
      return toContact(updated)
    },
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toContact(record: ContractorContactRecord): ContractorContact {
  return {
    canDecide: record.canDecide,
    contractorId: record.contractorId,
    email: record.email,
    id: record.id,
    receivesOccurrences: record.receivesOccurrences,
    status: record.status,
  }
}
