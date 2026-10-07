/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FindPreviewEmailParams,
  ListPreviewEmailIntakesRecordParams,
  PreviewEmailIntake,
  PreviewEmailSettings,
  RotatePreviewInboundTokenOutcome,
  RotatePreviewInboundTokenRecordParams,
  SavePreviewEmailAllowlistsOutcome,
  SavePreviewEmailAllowlistsRecordParams,
} from './contractor-preview-email.types.js'

export type ContractorPreviewEmailRepositoryPort = {
  /** `null` é contratante inexistente ou de outra empresa. */
  read(params: FindPreviewEmailParams): Promise<PreviewEmailSettings | null>
  /** Mais recentes primeiro; `null` é contratante fora da empresa. */
  listIntakes(
    params: ListPreviewEmailIntakesRecordParams,
  ): Promise<readonly PreviewEmailIntake[] | null>
  /** Troca o hash e grava a auditoria na mesma transação; o hash anterior deixa de existir. */
  rotateInboundToken(
    params: RotatePreviewInboundTokenRecordParams,
  ): Promise<RotatePreviewInboundTokenOutcome>
  /** Só audita quando algo mudou; lista vazia vira "sem lista" e é recusada com endereço ativo. */
  saveAllowlists(
    params: SavePreviewEmailAllowlistsRecordParams,
  ): Promise<SavePreviewEmailAllowlistsOutcome>
}
