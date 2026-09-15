/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorMailTemplateStatus,
  ContractorMailTemplateType,
  MailTemplateContent,
} from '../domain/mail-template-catalog.constant.js'

export type ContractorMailTemplate = MailTemplateContent & {
  readonly actorUserId: string | null
  readonly companyId: string
  readonly createdAt: Date
  readonly id: string
  readonly isDefault: boolean
  readonly mailType: ContractorMailTemplateType
  readonly name: string
  readonly status: ContractorMailTemplateStatus
  readonly updatedAt: Date
  readonly version: bigint
}

export type CreateContractorMailTemplateParams = MailTemplateContent & {
  readonly actorUserId: string
  readonly companyId: string
  readonly mailType: ContractorMailTemplateType
  readonly name: string
}

/** Arquivar é a única mudança de status: arquivado não volta (RF15). */
export type ContractorMailTemplateChanges = Partial<MailTemplateContent> & {
  readonly name?: string
  readonly status?: 'archived'
}

export type UpdateContractorMailTemplateParams = {
  readonly actorUserId: string
  readonly changes: ContractorMailTemplateChanges
  readonly companyId: string
  readonly expectedVersion: bigint
  readonly templateId: string
}

export type SetDefaultContractorMailTemplateParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly expectedVersion: bigint
  readonly templateId: string
}

/**
 * Toda operação recebe `companyId` e filtra por ele na mesma condição do id. `update`/`setDefault`
 * devolvem `undefined` quando nada bateu (id de fora, versão velha, arquivado) — quem diz qual erro
 * é o caso de uso, que já leu o modelo antes.
 */
export type ContractorMailTemplateRepositoryPort = {
  create(params: CreateContractorMailTemplateParams): Promise<ContractorMailTemplate>
  find(params: {
    readonly companyId: string
    readonly templateId: string
  }): Promise<ContractorMailTemplate | undefined>
  list(params: {
    readonly companyId: string
    readonly mailType?: ContractorMailTemplateType
  }): Promise<readonly ContractorMailTemplate[]>
  setDefault(
    params: SetDefaultContractorMailTemplateParams,
  ): Promise<ContractorMailTemplate | undefined>
  update(params: UpdateContractorMailTemplateParams): Promise<ContractorMailTemplate | undefined>
}
