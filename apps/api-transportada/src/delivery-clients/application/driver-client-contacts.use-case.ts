/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13/D4): normaliza e valida antes de qualquer gravação — o número vira E.164 (a mesma política do envio
 * por WhatsApp) e o e-mail perde espaço nas pontas. Contato fora da forma nunca é guardado.
 */
import { parseClientWhatsAppNumber } from '../../occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import { ContractorReplyWhatsAppNumberInvalidError } from '../../occurrence-conversation/domain/contractor-reply-whatsapp.error.js'
import {
  DELIVERY_CLIENT_CONTACT_CHANNEL,
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  type DeliveryClientContactChannel,
} from '../../shared/delivery-client-email.constant.js'
import { DeliveryClientNotFoundError } from '../domain/delivery-client.error.js'
import {
  DriverClientContactNotFoundError,
  DriverClientEmailInvalidError,
} from '../domain/driver-client-contact.error.js'
import type {
  DriverClientContact,
  DriverClientContactActor,
  DriverClientContactRepositoryPort,
} from './driver-client-contact.port.js'

/** Spec 279 D4: a mesma guarda de forma do cadastro do escritório — não verifica que a caixa existe. */
const EMAIL_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

export type DriverClientContactsUseCase = {
  add(input: {
    readonly actor: DriverClientContactActor
    readonly address: string
    readonly channel: DeliveryClientContactChannel
    readonly documentId: string
    readonly label: string
  }): Promise<{ readonly contact: DriverClientContact; readonly created: boolean }>
  list(input: {
    readonly actor: DriverClientContactActor
    readonly documentId: string
  }): Promise<readonly DriverClientContact[]>
  remove(input: {
    readonly actor: DriverClientContactActor
    readonly contactId: string
    readonly documentId: string
  }): Promise<void>
  update(input: {
    readonly actor: DriverClientContactActor
    readonly address?: string
    readonly contactId: string
    readonly documentId: string
    readonly label?: string
  }): Promise<DriverClientContact>
}

function normalize(channel: DeliveryClientContactChannel, raw: string): string {
  if (channel === DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP) {
    const number = parseClientWhatsAppNumber(raw)
    if (number === null) throw new ContractorReplyWhatsAppNumberInvalidError()
    return number
  }
  const address = raw.trim()
  if (address.length > DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH || !EMAIL_PATTERN.test(address)) {
    throw new DriverClientEmailInvalidError()
  }
  return address
}

export function createDriverClientContactsUseCase(dependencies: {
  readonly repository: DriverClientContactRepositoryPort
}): DriverClientContactsUseCase {
  const { repository } = dependencies

  return {
    async add(input) {
      const created = await repository.create({
        actor: input.actor,
        address: normalize(input.channel, input.address),
        channel: input.channel,
        documentId: input.documentId,
        label: input.label,
      })
      if (created === null) throw new DeliveryClientNotFoundError()
      return created
    },
    async list(input) {
      const contacts = await repository.list(input)
      if (contacts === null) throw new DeliveryClientNotFoundError()
      return contacts
    },
    async remove(input) {
      if (!(await repository.remove(input))) throw new DriverClientContactNotFoundError()
    },
    async update(input) {
      const current = (await repository.list(input))?.find(
        (contact) => contact.contactId === input.contactId,
      )
      if (current === undefined) throw new DriverClientContactNotFoundError()
      const updated = await repository.update({
        actor: input.actor,
        ...(input.address === undefined
          ? {}
          : { address: normalize(current.channel, input.address) }),
        contactId: input.contactId,
        documentId: input.documentId,
        ...(input.label === undefined ? {} : { label: input.label }),
      })
      if (updated === null) throw new DriverClientContactNotFoundError()
      return updated
    },
  }
}
