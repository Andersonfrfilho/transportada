/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { AggregateDocumentInvalidUploadError } from '../domain/aggregate-document.error.js'
import { AggregateApplicationNotFoundError } from '../domain/aggregate-application.error.js'

export type AggregateApplicationAttachmentView = Readonly<{
  extractedFields?: unknown
  id: string
  rejectionReason?: string
  status: string
  taxId: string
  type: string
}>

type ReviewContext = Readonly<{ companyId: string; userId: string }>

export type AggregateApplicationAttachmentReviewRepositoryPort = Readonly<{
  findForReview: (input: {
    readonly attachmentId: string
    readonly companyId: string
  }) => Promise<AggregateApplicationAttachmentView | null>
  listByApplication: (input: {
    readonly applicationId: string
    readonly companyId: string
  }) => Promise<readonly AggregateApplicationAttachmentView[]>
  /** Reaproveita o objeto já gravado: o documento da conta aponta para o mesmo arquivo do anexo. */
  promoteToAggregateDocument: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly reviewedBy: string
    readonly taxId: string
    readonly type: string
  }) => Promise<void>
  review: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly decision: 'approved' | 'rejected'
    readonly rejectionReason: string
    readonly reviewedBy: string
  }) => Promise<AggregateApplicationAttachmentView | null>
}>

/**
 * Os tipos que existem em `aggregate_documents`. O CCMEI **não** está aqui de propósito: aquela
 * tabela lista "os tipos exigidos" de todo agregado, e incluir o certificado de MEI faria o portal
 * cobrá-lo de todo motorista, inclusive de quem não é MEI. Ele é prova da empresa e fica como anexo
 * da candidatura.
 */
const PROMOTABLE_TYPES = new Set(['cnh', 'crlv'])

type Dependencies = {
  readonly repository: AggregateApplicationAttachmentReviewRepositoryPort
}

export type AggregateApplicationAttachmentReviewUseCase = Readonly<{
  list: (input: {
    readonly applicationId: string
    readonly context: ReviewContext
  }) => Promise<readonly AggregateApplicationAttachmentView[]>
  review: (input: {
    readonly attachmentId: string
    readonly context: ReviewContext
    readonly decision: 'approved' | 'rejected'
    readonly rejectionReason: string
  }) => Promise<AggregateApplicationAttachmentView>
}>

export function createAggregateApplicationAttachmentReviewUseCase(
  dependencies: Dependencies,
): AggregateApplicationAttachmentReviewUseCase {
  return {
    async list({ applicationId, context }) {
      return dependencies.repository.listByApplication({
        applicationId,
        companyId: context.companyId,
      })
    },

    async review({ attachmentId, context, decision, rejectionReason }) {
      const reason = rejectionReason.trim()
      // Recusa sem motivo deixa quem enviou sem saber o que corrigir — e o CHECK do banco recusaria
      // do mesmo jeito, só que como erro de escrita em vez de erro de entrada.
      if (decision === 'rejected' && reason.length === 0) {
        throw new AggregateDocumentInvalidUploadError()
      }

      const attachment = await dependencies.repository.findForReview({
        attachmentId,
        companyId: context.companyId,
      })
      if (attachment === null) throw new AggregateApplicationNotFoundError()

      const reviewed = await dependencies.repository.review({
        attachmentId,
        companyId: context.companyId,
        decision,
        rejectionReason: decision === 'rejected' ? reason : '',
        reviewedBy: context.userId,
      })
      if (reviewed === null) throw new AggregateApplicationNotFoundError()

      if (decision === 'approved' && PROMOTABLE_TYPES.has(attachment.type)) {
        await dependencies.repository.promoteToAggregateDocument({
          attachmentId,
          companyId: context.companyId,
          reviewedBy: context.userId,
          taxId: attachment.taxId,
          type: attachment.type,
        })
      }

      return reviewed
    },
  }
}
