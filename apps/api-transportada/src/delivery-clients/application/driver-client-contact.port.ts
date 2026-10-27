/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13): os contatos do cliente da nota, vistos pelo motorista na abertura da ocorrência. Vários números
 * e vários e-mails por cliente; o motorista adiciona e, do que ele mesmo informou, edita e remove. O que o escritório
 * cadastrou ele só vê. O endereço em claro nunca sai do repositório: quem lê recebe só a forma mascarada.
 */
import type { DeliveryClientContactChannel } from '../../shared/delivery-client-email.constant.js'

export type DriverClientContact = {
  readonly addressMasked: string
  readonly channel: DeliveryClientContactChannel
  readonly contactId: string
  /** `true` só para o que este motorista informou: o resto é do escritório e ele não mexe. */
  readonly editable: boolean
  readonly label: string
}

export type DriverClientContactActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly driverId: string
  readonly userId: string
}

export type DriverClientContactRepositoryPort = {
  /**
   * Guarda o contato (já normalizado) no cliente da nota. `null` quando a nota não é da viagem do motorista ou o
   * destinatário não tem cadastro. Endereço já guardado devolve o existente, sem duplicar. Lança
   * `DeliveryClientEmailLimitReachedError` com o limite do canal estourado.
   */
  create(input: {
    readonly actor: DriverClientContactActor
    readonly address: string
    readonly channel: DeliveryClientContactChannel
    readonly documentId: string
    readonly label: string
  }): Promise<{ readonly contact: DriverClientContact; readonly created: boolean } | null>
  /** `null` quando a nota não é da viagem do motorista ou o destinatário não tem cadastro; vazia é sem contato. */
  list(input: {
    readonly actor: DriverClientContactActor
    readonly documentId: string
  }): Promise<readonly DriverClientContact[] | null>
  /** `false` quando o contato não existe, não é deste cliente ou não foi este motorista que o informou. */
  remove(input: {
    readonly actor: DriverClientContactActor
    readonly contactId: string
    readonly documentId: string
  }): Promise<boolean>
  /** `null` pelas mesmas razões do `remove`. Lança `DeliveryClientEmailAlreadyExistsError` com o endereço de outro. */
  update(input: {
    readonly actor: DriverClientContactActor
    readonly address?: string
    readonly contactId: string
    readonly documentId: string
    readonly label?: string
  }): Promise<DriverClientContact | null>
}
