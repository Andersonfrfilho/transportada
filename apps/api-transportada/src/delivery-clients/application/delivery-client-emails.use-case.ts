/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryClientEmailPurpose } from '../../shared/delivery-client-email.constant.js'
import {
  DeliveryClientEmailNotFoundError,
  DeliveryClientNotFoundError,
} from '../domain/delivery-client.error.js'
import type {
  DeliveryClientEmail,
  DeliveryClientEmailActor,
  DeliveryClientEmailRepositoryPort,
} from './delivery-client-email.port.js'

export type DeliveryClientEmailsUseCase = {
  add(input: {
    readonly actor: DeliveryClientEmailActor
    readonly address: string
    readonly label: string
    readonly purpose: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<DeliveryClientEmail>
  list(input: {
    readonly companyId: string
    readonly purpose?: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<readonly DeliveryClientEmail[]>
  remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly taxId: string
  }): Promise<void>
  updateLabel(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly label: string
    readonly taxId: string
  }): Promise<DeliveryClientEmail>
}

/**
 * Spec 279 RF1: o cadastro de e-mails do cliente de entrega. Cliente de outra empresa e e-mail que
 * não é dele são ausência (`404`), nunca `403`: existir é informação.
 */
export function createDeliveryClientEmailsUseCase(dependencies: {
  readonly repository: DeliveryClientEmailRepositoryPort
}): DeliveryClientEmailsUseCase {
  const { repository } = dependencies

  return {
    async add(input) {
      const created = await repository.create(input)
      if (created === null) throw new DeliveryClientNotFoundError()
      return created
    },
    async list(input) {
      const found = await repository.list(input)
      if (found === null) throw new DeliveryClientNotFoundError()
      return found
    },
    async remove(input) {
      const removed = await repository.remove(input)
      if (!removed) throw new DeliveryClientEmailNotFoundError()
    },
    async updateLabel(input) {
      const updated = await repository.updateLabel(input)
      if (updated === null) throw new DeliveryClientEmailNotFoundError()
      return updated
    },
  }
}
