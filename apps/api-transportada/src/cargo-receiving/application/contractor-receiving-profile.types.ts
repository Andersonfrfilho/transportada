/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { PreviewItemField } from '../domain/contractor-receiving-profile.constant.js'

export type PreviewColumnMap = Readonly<Partial<Record<PreviewItemField, string>>>

/** ADR-0094 §2: o que o `PUT` grava — sempre o perfil inteiro, `null` onde não há regra. */
export type ContractorReceivingProfileRules = {
  /** O texto que antecede o número da carga no `infCpl` (ex.: `NroCarga:`), literal. */
  readonly arrivalReferenceLabel: string | null
  readonly deliveryDeadlineBusinessDays: number | null
  readonly isEnabled: boolean
  readonly matchWindowDays: number
  readonly previewColumnMap: PreviewColumnMap | null
  readonly previewEnabled: boolean
  readonly previewSheetName: string | null
  readonly requiresDamageCheck: boolean
  readonly separationWindowHours: number | null
  readonly weightTolerancePercent: number
}

export type ContractorReceivingProfile = ContractorReceivingProfileRules & {
  readonly contractorId: string
  readonly updatedAt: string
}

/** `isContractorFound: false` é contratante inexistente ou de outra empresa — os dois são 404. */
export type ContractorReceivingProfileLookup =
  | { readonly isContractorFound: false }
  | { readonly isContractorFound: true; readonly profile: ContractorReceivingProfile | null }

export type FindContractorReceivingProfileParams = {
  readonly companyId: string
  readonly contractorId: string
}

export type SaveContractorReceivingProfileRecordParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly rules: ContractorReceivingProfileRules
}

export type GetContractorReceivingProfileParams = {
  readonly context: CompanyContext
  readonly contractorId: string
}

export type SaveContractorReceivingProfileParams = GetContractorReceivingProfileParams & {
  readonly correlationId: string
  readonly rules: ContractorReceivingProfileRules
}

/** Spec 237 (revisão, M4): o que o painel precisa para saber quem tem o recebimento ligado. */
export type ContractorReceivingProfileSummary = {
  readonly contractorId: string
  readonly isEnabled: boolean
  readonly previewEnabled: boolean
}

/** O cursor é o id do último contratante da página: a lista anda em ordem de id. */
export type ContractorReceivingProfilePaging = {
  readonly cursor: string | null
  readonly limit: number
}

export type ListContractorReceivingProfilesRecordParams = {
  readonly companyId: string
  readonly enabled?: boolean
  readonly paging: ContractorReceivingProfilePaging
}

export type ListContractorReceivingProfilesParams = {
  readonly context: CompanyContext
  readonly enabled?: boolean
  readonly paging: ContractorReceivingProfilePaging
}

export type ContractorReceivingProfilePage = {
  readonly items: readonly ContractorReceivingProfileSummary[]
  readonly nextCursor: string | null
}
