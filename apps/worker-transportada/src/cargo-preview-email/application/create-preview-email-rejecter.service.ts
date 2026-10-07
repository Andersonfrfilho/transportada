/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: registra a recusa (só código e resultado do DKIM) e devolve o resultado do ramo.
 */
import type { DkimAlignmentResult } from '../../contractor-mail/domain/dkim-alignment.policy.js'
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'
import type {
  CargoPreviewEmailIntakeInput,
  CargoPreviewEmailIntakeResult,
  CargoPreviewEmailRepositoryPort,
  PreviewProfileRecord,
} from './cargo-preview-email.types.js'

export type PreviewEmailRejectionDetail = {
  readonly dkimResult?: DkimAlignmentResult
  /** O remetente original foi lido do cabeçalho do encaminhamento (sempre `unverified`). */
  readonly isOriginalSenderRead?: boolean
}

export type PreviewEmailRejecter = (
  reason: CargoPreviewEmailRejectionCode,
  detail?: PreviewEmailRejectionDetail,
) => Promise<CargoPreviewEmailIntakeResult>

export function createPreviewEmailRejecter(context: {
  readonly input: CargoPreviewEmailIntakeInput
  readonly profile: PreviewProfileRecord
  readonly repository: CargoPreviewEmailRepositoryPort
}): PreviewEmailRejecter {
  const { input, profile, repository } = context
  return async (reason, detail = {}) => {
    await repository.recordRejection({
      companyId: input.companyId,
      contractorId: profile.contractorId,
      ...(detail.dkimResult === undefined ? {} : { dkimResult: detail.dkimResult }),
      isOriginalSenderRead: detail.isOriginalSenderRead ?? false,
      providerEmailId: input.providerEmailId,
      reason,
      receivedAt: input.occurredAt,
    })
    return { contractorId: profile.contractorId, kind: 'rejected', reason }
  }
}
