/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: o cadastro de números de WhatsApp do cliente de entrega, irmão do cadastro de e-mails da 279. O número
 * em claro nunca sai do repositório: quem lê recebe só a forma mascarada.
 */
import type { DeliveryClientEmailAuthorKind } from '../../shared/delivery-client-email.constant.js'
import type { DeliveryClientEmailActor } from './delivery-client-email.port.js'

export type DeliveryClientWhatsApp = {
  readonly createdAt: Date
  readonly createdByKind: DeliveryClientEmailAuthorKind
  readonly id: string
  readonly label: string
  readonly numberMasked: string
}

export type DeliveryClientWhatsAppRepositoryPort = {
  /** Número já em E.164. `null` quando o cliente não existe **nesta empresa**. Lança limite e duplicata. */
  create(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label: string
    readonly number: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp | null>
  /** `null` quando o cliente não existe nesta empresa; lista vazia é cliente sem WhatsApp. */
  list(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<readonly DeliveryClientWhatsApp[] | null>
  /** `false` quando o cliente ou o número não existem nesta empresa. */
  remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly numberId: string
    readonly taxId: string
  }): Promise<boolean>
  /** Rótulo e/ou número (já em E.164). `null` quando o cliente ou o número não existem. Lança duplicata. */
  update(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label?: string
    readonly number?: string
    readonly numberId: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp | null>
}
