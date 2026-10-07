/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { PreviewAllowlistField } from '../domain/contractor-preview-email.constant.js'
import type {
  CargoPreviewEmailOutcome,
  CargoPreviewEmailRejectionCode,
} from '../../shared/cargo-preview.constant.js'

/** O que a ficha lê: nunca o token nem o hash — só se há endereço ativo e desde quando. */
export type PreviewEmailSettings = {
  readonly contractorId: string
  readonly forwarderAllowlist: readonly string[]
  readonly hasInboundToken: boolean
  /** Hora da última geração, pela trilha de auditoria; nula quando o hash entrou por fora dela. */
  readonly inboundTokenSetAt: string | null
  readonly senderAllowlist: readonly string[]
}

/** O registro de um e-mail encaminhado: só código e resultado — nunca endereço, nome, assunto nem corpo. */
export type PreviewEmailIntake = {
  readonly outcome: CargoPreviewEmailOutcome
  readonly previewId: string | null
  readonly reasonCode: CargoPreviewEmailRejectionCode | null
  readonly receivedAt: string
}

export type PreviewEmailActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

export type PreviewEmailLists = {
  readonly forwarderAllowlist: readonly string[]
  readonly senderAllowlist: readonly string[]
}

export type SavePreviewEmailAllowlistsRecordParams = PreviewEmailLists & {
  readonly actor: PreviewEmailActor
  readonly contractorId: string
}

export type SavePreviewEmailAllowlistsOutcome =
  | { readonly status: 'contractor_not_found' }
  | { readonly missing: readonly PreviewAllowlistField[]; readonly status: 'allowlists_required' }
  | { readonly settings: PreviewEmailSettings; readonly status: 'saved' }

/** O repositório só conhece o hash: o token nunca passa por ele. */
export type RotatePreviewInboundTokenRecordParams = {
  readonly actor: PreviewEmailActor
  readonly contractorId: string
  readonly tokenHash: string
}

export type RotatePreviewInboundTokenOutcome =
  | { readonly status: 'contractor_not_found' }
  | { readonly missing: readonly PreviewAllowlistField[]; readonly status: 'allowlists_missing' }
  | { readonly status: 'domain_not_configured' }
  | { readonly isRotation: boolean; readonly replyDomain: string; readonly status: 'rotated' }

export type FindPreviewEmailParams = {
  readonly companyId: string
  readonly contractorId: string
}

export type ListPreviewEmailIntakesRecordParams = FindPreviewEmailParams & {
  readonly limit: number
}

type ContractorScoped = {
  readonly context: CompanyContext
  readonly contractorId: string
}

export type GetPreviewEmailSettingsParams = ContractorScoped

export type ListPreviewEmailIntakesParams = ContractorScoped & { readonly limit: number }

type Audited = ContractorScoped & {
  readonly correlationId: string
  readonly ipAddress: string
}

export type RotatePreviewInboundTokenParams = Audited

export type SavePreviewEmailAllowlistsParams = Audited & PreviewEmailLists

/** O token e o endereço saem UMA vez, na resposta de quem gerou. */
export type GeneratedPreviewInboundAddress = {
  readonly address: string
  readonly token: string
}
