/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ContractorAutomationXmlKind } from '../../database/contractor-automation.schema.js'

export type ContractorAutomation = {
  readonly billingDueDays: number
  readonly createdAt: Date
  readonly enabled: boolean
  readonly id: string
  readonly name: string
  readonly nfseCity: string | null
  readonly partSize: number
  readonly recipients: readonly string[]
  readonly updatedAt: Date
  readonly xmlKind: ContractorAutomationXmlKind
}

/** O que o operador edita. A empresa e o ator nunca fazem parte do corpo. */
export type ContractorAutomationFields = {
  readonly billingDueDays: number
  readonly enabled: boolean
  readonly name: string
  readonly nfseCity: string | null
  readonly partSize: number
  readonly recipients: readonly string[]
  readonly xmlKind: ContractorAutomationXmlKind
}

export type ContractorAutomationActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

/** `create` e `update` gravam a auditoria na mesma transação. */
export type ContractorAutomationPort = {
  create(
    params: ContractorAutomationActor & { readonly fields: ContractorAutomationFields },
  ): Promise<ContractorAutomation>
  list(params: { readonly companyId: string }): Promise<readonly ContractorAutomation[]>
  update(
    params: ContractorAutomationActor & {
      readonly fields: ContractorAutomationFields
      readonly id: string
    },
  ): Promise<ContractorAutomation>
}
