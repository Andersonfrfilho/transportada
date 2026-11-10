/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, CA5, T6): o cliente que cobrou no recebimento fica marcado; o escritório lê a marca e a limpa.
 * A marca nasce no registro da ocorrência (`flagReceivingChargeClients`), nunca por esta porta.
 */
export type DeliveryClientReceivingChargeFlag = {
  readonly flaggedAt: string | null
  readonly sourceStopOccurrenceId: string | null
}

export type DeliveryClientReceivingChargeFlagPort = {
  /** `null` = cliente inexistente nesta empresa. */
  read(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<DeliveryClientReceivingChargeFlag | null>
  /** Limpa e audita na mesma transação; `null` = cliente inexistente. Limpar o que já está limpo não audita. */
  clear(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly deliveryClientId: string
  }): Promise<DeliveryClientReceivingChargeFlag | null>
}
