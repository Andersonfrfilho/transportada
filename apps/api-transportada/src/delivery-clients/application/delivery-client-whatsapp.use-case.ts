/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: o número vira E.164 (a mesma política do envio) antes de qualquer gravação; cliente de outra empresa e
 * número que não é dele são ausência (`404`), nunca `403`.
 */
import { parseClientWhatsAppNumber } from '../../occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import { ContractorReplyWhatsAppNumberInvalidError } from '../../occurrence-conversation/domain/contractor-reply-whatsapp.error.js'
import {
  DeliveryClientNotFoundError,
  DeliveryClientWhatsAppNotFoundError,
} from '../domain/delivery-client.error.js'
import type { DeliveryClientEmailActor } from './delivery-client-email.port.js'
import type {
  DeliveryClientWhatsApp,
  DeliveryClientWhatsAppRepositoryPort,
} from './delivery-client-whatsapp.port.js'

export type DeliveryClientWhatsAppUseCase = {
  add(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label: string
    readonly number: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp>
  list(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<readonly DeliveryClientWhatsApp[]>
  remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly numberId: string
    readonly taxId: string
  }): Promise<void>
  update(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label?: string
    readonly number?: string
    readonly numberId: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp>
}

function normalize(raw: string): string {
  const number = parseClientWhatsAppNumber(raw)
  if (number === null) throw new ContractorReplyWhatsAppNumberInvalidError()
  return number
}

export function createDeliveryClientWhatsAppUseCase(dependencies: {
  readonly repository: DeliveryClientWhatsAppRepositoryPort
}): DeliveryClientWhatsAppUseCase {
  const { repository } = dependencies

  return {
    async add(input) {
      const created = await repository.create({ ...input, number: normalize(input.number) })
      if (created === null) throw new DeliveryClientNotFoundError()
      return created
    },
    async list(input) {
      const found = await repository.list(input)
      if (found === null) throw new DeliveryClientNotFoundError()
      return found
    },
    async remove(input) {
      if (!(await repository.remove(input))) throw new DeliveryClientWhatsAppNotFoundError()
    },
    async update(input) {
      const updated = await repository.update({
        ...input,
        ...(input.number === undefined ? {} : { number: normalize(input.number) }),
      })
      if (updated === null) throw new DeliveryClientWhatsAppNotFoundError()
      return updated
    },
  }
}
