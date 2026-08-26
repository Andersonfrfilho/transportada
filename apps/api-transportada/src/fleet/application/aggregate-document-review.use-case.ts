/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  AggregateDocumentNotFoundError,
  AggregateDocumentRejectionReasonRequiredError,
} from '../domain/aggregate-document.error.js'
import type {
  AggregateDocument,
  AggregateDocumentForReview,
  AggregateDocumentRepositoryPort,
  AggregateDocumentStoragePort,
} from './aggregate-document.port.js'

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300

type Dependencies = {
  readonly bucket: string
  readonly repository: AggregateDocumentRepositoryPort
  readonly storage: AggregateDocumentStoragePort
}

export type AggregateDocumentReviewUseCase = Readonly<{
  getDownloadUrl: (input: { readonly context: CompanyContext; readonly id: string }) => Promise<URL>
  list: (input: { readonly context: CompanyContext }) => Promise<readonly AggregateDocumentForReview[]>
  review: (input: {
    readonly context: CompanyContext
    readonly decision: 'approved' | 'rejected'
    readonly id: string
    readonly rejectionReason: string
  }) => Promise<AggregateDocument>
}>

/**
 * O operador nunca vê o binário direto — só uma URL assinada de vida curta (5 min), mesmo padrão
 * de NF-e/CT-e. O storage não sabe nada sobre "documento de agregado"; só serve o que a linha do
 * banco aponta.
 */
export function createAggregateDocumentReviewUseCase(dependencies: Dependencies): AggregateDocumentReviewUseCase {
  return {
    async getDownloadUrl({ context, id }) {
      const location = await dependencies.repository.findDownloadLocation({ companyId: context.companyId, id })
      if (location === null) throw new AggregateDocumentNotFoundError()
      return dependencies.storage.createSignedDownload({
        bucket: location.bucket,
        expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
        key: location.objectKey,
      })
    },

    async list({ context }) {
      return dependencies.repository.listPendingByCompany({ companyId: context.companyId })
    },

    async review({ context, decision, id, rejectionReason }) {
      if (decision === 'rejected' && rejectionReason.trim().length === 0) {
        throw new AggregateDocumentRejectionReasonRequiredError()
      }

      const reviewed = await dependencies.repository.review({
        companyId: context.companyId,
        id,
        rejectionReason: decision === 'rejected' ? rejectionReason : '',
        reviewedBy: context.userId,
        status: decision,
      })
      if (reviewed === null) throw new AggregateDocumentNotFoundError()
      return reviewed
    },
  }
}
