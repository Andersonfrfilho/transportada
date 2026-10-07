/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6/T4.7c: registra a recusa (só código e resultado do DKIM) e devolve o resultado do ramo. Com a
 * janela de não autenticados cheia, a recusa anterior ao DKIM é devolvida SEM linha nova — só o rastro único
 * `RATE_LIMITED` da janela —, e a avaliação da mensagem segue como sempre.
 */
import {
  DKIM_ALIGNMENT_RESULT,
  type DkimAlignmentResult,
} from '../../contractor-mail/domain/dkim-alignment.policy.js'
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'
import { PREVIEW_EMAIL_INTAKE_RATE_LIMIT } from '../domain/cargo-preview-email.constant.js'
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

type RejecterContext = {
  readonly input: CargoPreviewEmailIntakeInput
  /** A janela de recusas anteriores ao DKIM já está cheia: a recusa não grava linha nova. */
  readonly isUnauthenticatedWindowFull: boolean
  readonly profile: PreviewProfileRecord
  readonly repository: CargoPreviewEmailRepositoryPort
}

export function createPreviewEmailRejecter(context: RejecterContext): PreviewEmailRejecter {
  const { input, profile, repository } = context
  return async (reason, detail = {}) => {
    const isBeforeDkim = detail.dkimResult !== DKIM_ALIGNMENT_RESULT.ALIGNED
    if (context.isUnauthenticatedWindowFull && isBeforeDkim) {
      await recordRateLimitedTrace(context)
    } else {
      await repository.recordRejection({
        companyId: input.companyId,
        contractorId: profile.contractorId,
        ...(detail.dkimResult === undefined ? {} : { dkimResult: detail.dkimResult }),
        isOriginalSenderRead: detail.isOriginalSenderRead ?? false,
        providerEmailId: input.providerEmailId,
        reason,
        receivedAt: input.occurredAt,
      })
    }
    return { contractorId: profile.contractorId, kind: 'rejected', reason }
  }
}

/** Uma linha por contratante e janela, no máximo: o repositório não grava a segunda. */
export function recordRateLimitedTrace(
  context: Pick<RejecterContext, 'input' | 'profile' | 'repository'>,
): Promise<void> {
  const { input, profile, repository } = context
  return repository.recordRateLimited({
    companyId: input.companyId,
    contractorId: profile.contractorId,
    providerEmailId: input.providerEmailId,
    receivedAt: input.occurredAt,
    windowSeconds: PREVIEW_EMAIL_INTAKE_RATE_LIMIT.windowSeconds,
  })
}
