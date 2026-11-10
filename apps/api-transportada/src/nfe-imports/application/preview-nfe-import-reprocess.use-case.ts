/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeImportNotFound } from './nfe-import.error.js'
import {
  planNfeImportReprocess,
  REPROCESSABLE_REJECTION_CODES,
} from './nfe-import-reprocess.policy.js'
import type { NfeImportDetailReaderPort } from './nfe-import.types.js'

export type NfeImportReprocessPreview = {
  readonly busy: boolean
  readonly failedItems: number
  readonly reprocessable: boolean
  readonly reprocessableRejectionCodes: readonly string[]
  readonly rejectedItems: number
  readonly total: number
}

/** Spec 314 RF3: só conta. Não grava, não publica evento. */
export function createPreviewNfeImportReprocessUseCase(input: {
  readonly repository: NfeImportDetailReaderPort
}) {
  return {
    async execute(request: {
      readonly context: CompanyContext
      readonly importId: string
    }): Promise<NfeImportReprocessPreview> {
      const detail = await input.repository.findById({
        companyId: request.context.companyId,
        importId: request.importId,
      })
      if (detail === null) throw nfeImportNotFound()
      const plan = planNfeImportReprocess(detail)
      const total = plan.failedItems.length + plan.rejectedItems.length
      return {
        busy: plan.busy,
        failedItems: plan.failedItems.length,
        reprocessable: !plan.busy && total > 0,
        reprocessableRejectionCodes: REPROCESSABLE_REJECTION_CODES,
        rejectedItems: plan.rejectedItems.length,
        total,
      }
    },
  }
}
