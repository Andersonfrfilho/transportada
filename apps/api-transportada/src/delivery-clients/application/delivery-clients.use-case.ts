/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  DeliveryClientAlreadyExistsError,
  DeliveryClientNotFoundError,
} from '../domain/delivery-client.error.js'
import type {
  DeliveryDateException,
  DeliveryWeeklyWindow,
} from '../domain/delivery-window.policy.js'
import type {
  DeliveryClient,
  DeliveryClientDetail,
  DeliveryClientListFilters,
  DeliveryClientPage,
  DeliveryClientRepositoryPort,
  DeliveryClientWriteInput,
} from './delivery-client.port.js'

export type DeliveryClientsUseCase = {
  create(input: {
    readonly context: CompanyContext
    readonly taxId: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient>
  get(input: {
    readonly context: CompanyContext
    readonly id: string
  }): Promise<DeliveryClientDetail>
  getByTaxId(input: {
    readonly context: CompanyContext
    readonly taxId: string
  }): Promise<DeliveryClientDetail>
  list(input: {
    readonly context: CompanyContext
    readonly filters: DeliveryClientListFilters
  }): Promise<DeliveryClientPage>
  replaceExceptions(input: {
    readonly context: CompanyContext
    readonly exceptions: readonly DeliveryDateException[]
    readonly id: string
  }): Promise<readonly DeliveryDateException[]>
  replaceWindows(input: {
    readonly context: CompanyContext
    readonly id: string
    readonly windows: readonly DeliveryWeeklyWindow[]
  }): Promise<readonly DeliveryWeeklyWindow[]>
  update(input: {
    readonly context: CompanyContext
    readonly id: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient>
}

/**
 * Spec 060 D1: o cadastro **já existe** quando alguém abre esta tela — ele nasceu da nota. O que
 * estas rotas fazem é preencher a regra: hora, taxa esperada e agendamento obrigatório.
 *
 * Por isso `create` é exceção, não caminho principal: ela serve o cliente que ainda não mandou nota
 * nenhuma, e colide com o unique quando alguém tenta cadastrar o que já nasceu — daí o `409` apontar
 * o existente em vez de mandar tentar outro documento.
 */
export function createDeliveryClientsUseCase(dependencies: {
  readonly repository: DeliveryClientRepositoryPort
}): DeliveryClientsUseCase {
  const { repository } = dependencies

  async function requireClient(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<DeliveryClientDetail> {
    const found = await repository.findById(input)
    if (found === null) throw new DeliveryClientNotFoundError()
    return found
  }

  return {
    async create({ context, taxId, values }) {
      const existing = await repository.findByTaxId({ companyId: context.companyId, taxId })
      if (existing !== null) throw new DeliveryClientAlreadyExistsError(existing.id)

      return repository.create({ companyId: context.companyId, taxId, values })
    },
    async get({ context, id }) {
      return requireClient({ companyId: context.companyId, id })
    },
    async getByTaxId({ context, taxId }) {
      const found = await repository.findByTaxId({ companyId: context.companyId, taxId })
      if (found === null) throw new DeliveryClientNotFoundError()
      return found
    },
    async list({ context, filters }) {
      return repository.list({ companyId: context.companyId, filters })
    },
    async replaceExceptions({ context, exceptions, id }) {
      await requireClient({ companyId: context.companyId, id })
      return repository.replaceExceptions({ companyId: context.companyId, exceptions, id })
    },
    async replaceWindows({ context, id, windows }) {
      await requireClient({ companyId: context.companyId, id })
      return repository.replaceWindows({ companyId: context.companyId, id, windows })
    },
    async update({ context, id, values }) {
      const updated = await repository.update({ companyId: context.companyId, id, values })
      if (updated === null) throw new DeliveryClientNotFoundError()
      return updated
    },
  }
}
