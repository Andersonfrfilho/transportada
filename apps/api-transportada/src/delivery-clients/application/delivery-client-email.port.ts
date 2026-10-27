/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryClientEmailAuthorKind,
  DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'

/** O endereço em claro nunca sai do repositório: quem lê recebe só a forma mascarada. */
export type DeliveryClientEmail = {
  readonly addressMasked: string
  readonly createdAt: Date
  readonly createdByKind: DeliveryClientEmailAuthorKind
  readonly id: string
  readonly label: string
  readonly purpose: DeliveryClientEmailPurpose
}

/** Quem pede e de onde: vai para `audit_logs`, nunca para o corpo da resposta. */
export type DeliveryClientEmailActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

export type DeliveryClientEmailRepositoryPort = {
  /**
   * Cadastra no tipo, na mesma transação do limite e da auditoria. `null` quando o cliente não existe
   * **nesta empresa**. Lança `DeliveryClientEmailLimitReachedError` e `DeliveryClientEmailAlreadyExistsError`.
   */
  create(input: {
    readonly actor: DeliveryClientEmailActor
    readonly address: string
    readonly label: string
    readonly purpose: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<DeliveryClientEmail | null>
  /** `null` quando o cliente ou o e-mail não existem nesta empresa. */
  remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly taxId: string
  }): Promise<boolean>
  /** `null` quando o cliente não existe nesta empresa; lista vazia é cliente sem e-mail. */
  list(input: {
    readonly companyId: string
    readonly purpose?: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<readonly DeliveryClientEmail[] | null>
  /** Só o rótulo muda: o endereço é identidade, trocar é remover e cadastrar. */
  updateLabel(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly label: string
    readonly taxId: string
  }): Promise<DeliveryClientEmail | null>
}
